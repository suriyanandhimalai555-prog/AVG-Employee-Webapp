// builders-incentives.service.ts
// Decoupled employee-incentive layer for the Builders scheme.
//
// Two streams:
//   one_time — credited at plan enrollment to the selling chain (SO → GM).
//   monthly  — credited to the SO only, once per customer payout month.
//
// All writes land in the shared employee_incentives ledger so wallets,
// getBranchSummary, and getOverviewByBranch reflect them without extra code.
//
// Separate from IncentiveService.distributeIncentives because the shared
// scheme_commission_rules table is 1-D (one rate per role) and cannot hold
// a tier × role × type matrix.

import { Pool, PoolClient } from 'pg';
import type { UpdateBuildersIncentiveRuleInput } from './builders.schema';

// TS: roles in the one_time chain, in hierarchy order (lowest first)
const ONE_TIME_ROLES = ['sales_officer', 'abm', 'branch_manager', 'gm'] as const;
type OneTimeRole = typeof ONE_TIME_ROLES[number];

// TS: composite key for the in-memory rules map
type RulesKey = `${number}:${string}:${'one_time' | 'monthly'}`;

const SCHEME_CODE = 'builders_scheme';

export const BuildersIncentivesService = {

  // ─── READ ALL RULES (for MD editor) ────────────────────────────────────────
  async getRules(db: Pool): Promise<any[]> {
    const result = await db.query(
      `SELECT id, package_number, role, incentive_type, amount, updated_at
       FROM builders_incentive_rules
       ORDER BY
         package_number ASC,
         CASE role
           WHEN 'sales_officer'  THEN 1
           WHEN 'abm'            THEN 2
           WHEN 'branch_manager' THEN 3
           WHEN 'gm'             THEN 4
         END ASC,
         incentive_type ASC`
    );
    return result.rows;
  },

  // ─── UPSERT ONE RULE (MD only) ──────────────────────────────────────────────
  async updateRule(
    db: Pool,
    userId: string,
    payload: UpdateBuildersIncentiveRuleInput
  ): Promise<any> {
    const result = await db.query(
      `INSERT INTO builders_incentive_rules
         (package_number, role, incentive_type, amount, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (package_number, role, incentive_type)
       DO UPDATE SET
         amount     = EXCLUDED.amount,
         updated_by = EXCLUDED.updated_by,
         updated_at = now()
       RETURNING *`,
      [payload.packageNumber, payload.role, payload.incentiveType, payload.amount, userId]
    );
    return result.rows[0];
  },

  // ─── LOAD RULES MAP (used inside transactions) ──────────────────────────────
  // TS: Returns a Map keyed by "packageNumber:role:type" → amount (as number)
  async loadRulesMap(
    client: Pool | PoolClient
  ): Promise<Map<RulesKey, number>> {
    const result = await client.query(
      `SELECT package_number, role, incentive_type, amount
       FROM builders_incentive_rules`
    );
    const map = new Map<RulesKey, number>();
    for (const row of result.rows) {
      // TS: cast the composite string to the narrowed RulesKey union
      const key = `${row.package_number}:${row.role}:${row.incentive_type}` as RulesKey;
      map.set(key, parseFloat(row.amount));
    }
    return map;
  },

  // ─── ONE-TIME: credit at enrollment ─────────────────────────────────────────
  // Walks referrer → manager_id up to GM, credits each earner role their fixed
  // one_time amount for the plan's package_number.
  // No "absorption" — every present role in the chain earns their own rate.
  // No-op when plan.referrer_id is null.
  // effectiveDate overrides created_at so past-data entries land in the correct wallet period.
  async distributeOneTime(
    client: PoolClient,
    args: {
      plan:          { id: string; referrer_id: string | null; package_number: number };
      creditedBy:    string;
      customerName:  string;
      effectiveDate?: string;   // 'YYYY-MM-DD' — for backdated correction
    }
  ): Promise<void> {
    if (!args.plan.referrer_id) return;

    const rulesMap = await BuildersIncentivesService.loadRulesMap(client);

    // Walk the chain from referrer up to GM
    const chain: Array<{ id: string; role: string }> = [];
    const earned = new Set<OneTimeRole>();

    let current: { id: string; role: string; manager_id: string | null } | null = null;

    const referrerResult = await client.query(
      `SELECT id, role, manager_id FROM users WHERE id = $1`,
      [args.plan.referrer_id]
    );
    if (referrerResult.rows.length === 0) return;
    current = referrerResult.rows[0];

    while (current) {
      if ((ONE_TIME_ROLES as readonly string[]).includes(current.role)) {
        chain.push({ id: current.id, role: current.role });
        earned.add(current.role as OneTimeRole);
        if (current.role === 'gm') break;
      } else {
        // Reached a non-earning role (director, md) — stop climbing
        break;
      }
      if (!current.manager_id) break;

      const managerResult = await client.query(
        `SELECT id, role, manager_id FROM users WHERE id = $1`,
        [current.manager_id]
      );
      current = managerResult.rows[0] ?? null;
    }

    if (chain.length === 0) return;

    const description =
      `Builders one-time incentive: ${args.customerName} (Tier ${args.plan.package_number})`;

    for (const person of chain) {
      const key: RulesKey = `${args.plan.package_number}:${person.role}:one_time`;
      const amount = rulesMap.get(key) ?? 0;
      if (amount <= 0) {
        // MISCONFIG: builders_incentive_rules is missing a one_time row for this tier+role.
        // The enrollment succeeds but this person receives zero incentive.
        console.warn('[BuildersIncentivesService] distributeOneTime: missing/zero rule for package=%d role=%s — zero one_time incentive paid. Check builders_incentive_rules.', args.plan.package_number, person.role);
        continue;
      }

      // TS: override created_at when an effective date is provided (backdated entry)
      await client.query(
        `INSERT INTO employee_incentives
           (user_id, amount, source_type, scheme_code, payment_event,
            source_id, source_description, credited_by, created_at)
         VALUES ($1, $2, 'scheme', $3, 'enrollment', $4, $5, $6,
                 COALESCE($7::timestamptz, now()))`,
        [person.id, amount, SCHEME_CODE, args.plan.id, description, args.creditedBy, args.effectiveDate ?? null]
      );
    }
  },

  // ─── MONTHLY: credit per recorded customer payout ──────────────────────────
  // Credits the original referrer their tier-based monthly incentive.
  // Only fires when the plan has a referrer_id stored on the plan row.
  // Managers above the referrer do NOT earn monthly incentives in the Builders scheme.
  // No-op when plan.referrer_id is null.
  // effectiveDate overrides created_at so backdated payouts credit the right period.
  //
  // NOTE: the referrer is paid the SO-tier monthly amount regardless of their current role.
  // The role-gate was intentionally removed so promoted/transferred earners keep receiving
  // their old-customer monthly commission (the stored referrer_id is stable and branch-independent).
  async creditMonthly(
    client: PoolClient,
    args: {
      plan:           { id: string; referrer_id: string | null; package_number: number };
      monthNumber:    number;
      creditedBy:     string;
      effectiveDate?: string;   // 'YYYY-MM-DD' — for backdated correction
    }
  ): Promise<void> {
    if (!args.plan.referrer_id) return;

    const rulesMap = await BuildersIncentivesService.loadRulesMap(client);
    const key: RulesKey = `${args.plan.package_number}:sales_officer:monthly`;
    const amount = rulesMap.get(key) ?? 0;
    if (amount <= 0) {
      // MISCONFIG: builders_incentive_rules is missing a monthly row for this tier.
      // The payout month is recorded but the SO receives zero monthly incentive.
      console.warn('[BuildersIncentivesService] creditMonthly: missing/zero rule for package=%d sales_officer monthly — zero monthly incentive paid. Check builders_incentive_rules.', args.plan.package_number);
      return;
    }

    const description =
      `Builders monthly incentive: Month ${args.monthNumber} (Tier ${args.plan.package_number})`;

    // TS: override created_at when an effective date is provided (backdated payout)
    await client.query(
      `INSERT INTO employee_incentives
         (user_id, amount, source_type, scheme_code, payment_event,
          source_id, source_description, credited_by, created_at)
       VALUES ($1, $2, 'scheme', $3, 'monthly', $4, $5, $6,
               COALESCE($7::timestamptz, now()))`,
      [args.plan.referrer_id, amount, SCHEME_CODE, args.plan.id, description, args.creditedBy, args.effectiveDate ?? null]
    );
  },
};
