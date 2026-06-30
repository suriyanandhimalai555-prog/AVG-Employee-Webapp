// Daily collection reconciliation service.
//
// Provides:
//   submitSummary          — branch admin's morning declaration of expected amounts
//   updateSummary          — management can edit a locked day's declared amounts
//   getTodaySummary        — read header+lines for (branch, date); null if not submitted
//   getBranchReconciliation — live declared-vs-actual per scheme for (branch, date)
//   getManagementOverview  — all-branch status roll-up for a date
//
// Actuals are NEVER stored — they are computed live by calling each registered
// scheme's getCollectedByBranch(dateFilter) and filtering to the target branch.
// Status is always auto-derived: no cron, no snapshot, no explicit close step.

import { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
// TS: IST-aware "today" — never use new Date() on UTC servers
import { getCompanyToday } from '../../shared/date';
import { listSchemes } from '../schemes/scheme.registry';

// TS: per-scheme row returned by getBranchReconciliation
export interface ReconciliationLine {
  schemeCode:  string;
  schemeName:  string;
  expected:    number;
  collected:   number;
  remaining:   number;
  percent:     number;
  status:      'pending' | 'completed' | 'exceeded';
}

// TS: per-branch row returned by getManagementOverview
export interface BranchOverview {
  branchId:          string;
  branchName:        string;
  businessDate:      string;
  // TS: present only when summarySubmitted = true; needed by the edit form
  summaryId?:        string;
  summarySubmitted:  boolean;
  status:            'not_submitted' | 'reconciled' | 'mismatch';
  mismatchedSchemes: number;
  totalExpected:     number;
  totalCollected:    number;
  totalDifference:   number;
}

// Sub-cent differences are treated as reconciled (floating-point safety).
const EPSILON = 0.005;

// Fetch display names from the projects table — the registry stores stable
// codes, but the dashboard wants the human label that admins can rename.
async function loadSchemeNames(
  db: Pool | PoolClient,
  codes: string[],
): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  // TS: $1 is a text[] param — ANY($1) matches each code in the array
  const res = await db.query<{ code: string; name: string }>(
    `SELECT code, name FROM projects WHERE code = ANY($1)`,
    [codes]
  );
  const map = new Map<string, string>();
  for (const r of res.rows) map.set(r.code, r.name);
  return map;
}

// TS: derive per-scheme status from the delta between collected and expected
function lineStatus(collected: number, expected: number): ReconciliationLine['status'] {
  const delta = collected - expected;
  if (Math.abs(delta) <= EPSILON) return 'completed';
  if (delta > 0)                  return 'exceeded';
  return 'pending';
}

export const ReconciliationService = {

  // ─── submitSummary ──────────────────────────────────────────────────────────
  // Insert header + lines in one transaction. business_date is always the
  // server-side IST today (never trust the client for the date).
  // UNIQUE(branch_id, business_date) causes a ConflictError on re-submit.
  async submitSummary(
    db: Pool,
    args: {
      branchId: string;
      userId:   string;
      lines:    Array<{ schemeCode: string; expectedAmount: number }>;
    }
  ): Promise<{ id: string; businessDate: string }> {
    try {
      return await runInTransaction(db, async (client: PoolClient) => {
        const businessDate = getCompanyToday();

        const hdrRes = await client.query<{ id: string }>(
          `INSERT INTO daily_collection_summaries
             (branch_id, business_date, submitted_by)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [args.branchId, businessDate, args.userId]
        );
        const summaryId = hdrRes.rows[0].id;

        // TS: insert each declared line; blank/missing amount defaults to 0
        for (const line of args.lines) {
          await client.query(
            `INSERT INTO daily_collection_summary_lines
               (summary_id, scheme_code, expected_amount)
             VALUES ($1, $2, $3)`,
            [summaryId, line.schemeCode, line.expectedAmount ?? 0]
          );
        }

        return { id: summaryId, businessDate };
      });
    } catch (err: any) {
      // TS: pg unique violation code 23505 → friendly 409 instead of raw 500
      if (err?.code === '23505') {
        throw new ConflictError(
          "A collection summary for today has already been submitted for this branch",
          'DAILY_SUMMARY_ALREADY_SUBMITTED'
        );
      }
      throw err;
    }
  },

  // ─── updateSummary ──────────────────────────────────────────────────────────
  // Management-only edit of an already-submitted summary.
  // Upserts each line so management can add new schemes or correct amounts.
  async updateSummary(
    db: Pool,
    args: {
      summaryId: string;
      branchId:  string;
      userId:    string;
      lines:     Array<{ schemeCode: string; expectedAmount: number }>;
    }
  ): Promise<void> {
    await runInTransaction(db, async (client: PoolClient) => {
      // Verify the summary exists and belongs to the specified branch.
      const check = await client.query(
        `SELECT id FROM daily_collection_summaries
         WHERE id = $1 AND branch_id = $2`,
        [args.summaryId, args.branchId]
      );
      if (check.rows.length === 0) throw new NotFoundError('Collection summary not found');

      await client.query(
        `UPDATE daily_collection_summaries
         SET updated_by = $1, updated_at = now()
         WHERE id = $2`,
        [args.userId, args.summaryId]
      );

      // TS: upsert each line — allows management to add or correct scheme amounts
      for (const line of args.lines) {
        await client.query(
          `INSERT INTO daily_collection_summary_lines (summary_id, scheme_code, expected_amount)
           VALUES ($1, $2, $3)
           ON CONFLICT (summary_id, scheme_code)
           DO UPDATE SET expected_amount = EXCLUDED.expected_amount`,
          [args.summaryId, line.schemeCode, line.expectedAmount ?? 0]
        );
      }
    });
  },

  // ─── getTodaySummary ────────────────────────────────────────────────────────
  // Returns the submitted header + lines or null (drives gate check + form prefill).
  async getTodaySummary(
    db: Pool,
    branchId:     string,
    businessDate: string
  ): Promise<{
    id: string;
    businessDate: string;
    lines: Array<{ schemeCode: string; expectedAmount: number }>;
  } | null> {
    const hdrRes = await db.query<{ id: string; business_date: string }>(
      `SELECT id, business_date FROM daily_collection_summaries
       WHERE branch_id = $1 AND business_date = $2`,
      [branchId, businessDate]
    );
    if (hdrRes.rows.length === 0) return null;

    const summaryId = hdrRes.rows[0].id;
    const linesRes = await db.query<{ scheme_code: string; expected_amount: string }>(
      `SELECT scheme_code, expected_amount
       FROM daily_collection_summary_lines
       WHERE summary_id = $1
       ORDER BY scheme_code`,
      [summaryId]
    );

    return {
      id: summaryId,
      businessDate: hdrRes.rows[0].business_date,
      lines: linesRes.rows.map(r => ({
        schemeCode:     r.scheme_code,
        expectedAmount: parseFloat(r.expected_amount),
      })),
    };
  },

  // ─── getBranchReconciliation ────────────────────────────────────────────────
  // Live declared-vs-actual per scheme for a branch on a specific date.
  // Actuals are computed live via each registered scheme's getCollectedByBranch.
  async getBranchReconciliation(
    db: Pool,
    branchId:     string,
    businessDate: string
  ): Promise<ReconciliationLine[]> {
    const summary = await ReconciliationService.getTodaySummary(db, branchId, businessDate);
    // TS: build a lookup map from the submitted lines; missing line = 0 expected
    const expectedMap = new Map<string, number>();
    if (summary) {
      for (const l of summary.lines) expectedMap.set(l.schemeCode, l.expectedAmount);
    }

    // Only schemes that implement the cash accessor appear in reconciliation.
    const schemes = listSchemes().filter(s => typeof s.getCollectedByBranch === 'function');
    const nameMap = await loadSchemeNames(db, schemes.map(s => s.schemeCode));

    const dateFilter = { startDate: businessDate, endDate: businessDate };
    const lines: ReconciliationLine[] = [];

    for (const scheme of schemes) {
      // TS: non-null assertion safe — filtered above to only schemes with the method
      const allBranches = await scheme.getCollectedByBranch!(db, dateFilter);
      const branchRow   = allBranches.find(b => b.branchId === branchId);
      const collected   = branchRow?.collected ?? 0;
      const expected    = expectedMap.get(scheme.schemeCode) ?? 0;
      const remaining   = Math.max(0, expected - collected);
      // TS: percent is capped at 100; if expected=0 and collected>0 treat as 100%
      const percent     = expected > 0
        ? Math.min(100, (collected / expected) * 100)
        : (collected > 0 ? 100 : 0);

      lines.push({
        schemeCode: scheme.schemeCode,
        schemeName: nameMap.get(scheme.schemeCode) ?? scheme.schemeCode,
        expected,
        collected,
        remaining,
        percent:    Math.round(percent * 10) / 10,
        status:     lineStatus(collected, expected),
      });
    }

    return lines;
  },

  // ─── getManagementOverview ──────────────────────────────────────────────────
  // All-branch status roll-up for a given business date.
  // Management dashboard: one row per branch showing reconciled/mismatch state.
  async getManagementOverview(
    db: Pool,
    businessDate: string
  ): Promise<BranchOverview[]> {
    // Load all branches.
    const branchRes = await db.query<{ id: string; name: string }>(
      `SELECT id, name FROM branches ORDER BY name ASC`
    );

    // Load all summaries submitted for this date.
    const summaryRes = await db.query<{ branch_id: string; id: string }>(
      `SELECT branch_id, id FROM daily_collection_summaries WHERE business_date = $1`,
      [businessDate]
    );
    // TS: map branchId → summaryId for quick lookup
    const summaryByBranch = new Map<string, string>();
    for (const r of summaryRes.rows) summaryByBranch.set(r.branch_id, r.id);

    // Load all declared lines for the summaries on this date.
    const summaryIds = Array.from(summaryByBranch.values());
    // TS: Map<branchId, Map<schemeCode, expectedAmount>>
    const linesByBranch = new Map<string, Map<string, number>>();

    if (summaryIds.length > 0) {
      const linesRes = await db.query<{
        summary_id: string; scheme_code: string; expected_amount: string;
      }>(
        `SELECT summary_id, scheme_code, expected_amount
         FROM daily_collection_summary_lines
         WHERE summary_id = ANY($1)`,
        [summaryIds]
      );
      // Invert summaryId → branchId for the join
      const branchBySummary = new Map<string, string>();
      for (const [bId, sId] of summaryByBranch) branchBySummary.set(sId, bId);

      for (const r of linesRes.rows) {
        const bId = branchBySummary.get(r.summary_id);
        if (!bId) continue;
        if (!linesByBranch.has(bId)) linesByBranch.set(bId, new Map());
        linesByBranch.get(bId)!.set(r.scheme_code, parseFloat(r.expected_amount));
      }
    }

    // Collect actuals for all cash-capable schemes.
    const schemes    = listSchemes().filter(s => typeof s.getCollectedByBranch === 'function');
    const dateFilter = { startDate: businessDate, endDate: businessDate };

    // TS: Map<schemeCode, Map<branchId, collected>>
    const actualsByScheme = new Map<string, Map<string, number>>();
    for (const scheme of schemes) {
      const rows = await scheme.getCollectedByBranch!(db, dateFilter);
      const m    = new Map<string, number>();
      for (const r of rows) m.set(r.branchId, r.collected);
      actualsByScheme.set(scheme.schemeCode, m);
    }

    // Build per-branch overview rows.
    return branchRes.rows.map(branch => {
      const bId              = branch.id;
      const submitted        = summaryByBranch.has(bId);
      const expectedByScheme = linesByBranch.get(bId) ?? new Map<string, number>();

      let totalExpected  = 0;
      let totalCollected = 0;
      let mismatches     = 0;

      for (const scheme of schemes) {
        const expected  = expectedByScheme.get(scheme.schemeCode) ?? 0;
        const collected = actualsByScheme.get(scheme.schemeCode)?.get(bId) ?? 0;
        totalExpected  += expected;
        totalCollected += collected;
        if (Math.abs(collected - expected) > EPSILON) mismatches++;
      }

      const totalDifference = totalCollected - totalExpected;
      let status: BranchOverview['status'];
      if (!submitted)        status = 'not_submitted';
      else if (mismatches === 0) status = 'reconciled';
      else                   status = 'mismatch';

      return {
        branchId:          bId,
        branchName:        branch.name,
        businessDate,
        // TS: expose summaryId so the management edit form can call PUT /summary/:id
        summaryId:         summaryByBranch.get(bId),
        summarySubmitted:  submitted,
        status,
        mismatchedSchemes: mismatches,
        totalExpected,
        totalCollected,
        totalDifference,
      };
    });
  },
};
