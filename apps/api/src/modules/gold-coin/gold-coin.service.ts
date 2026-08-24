// Gold Coin scheme facade.
//
// Public API for the module: implements the SchemeService contract so the
// registry (modules/schemes/scheme.registry.ts) can dispatch cross-scheme
// code without knowing internals. Internal logic lives in
// packages.service.ts / rooms.service.ts / slots.service.ts /
// draws.service.ts / combine.service.ts.

import type { Pool, PoolClient } from 'pg';
import type { SchemeDateFilter, SchemeService } from '../schemes/scheme.contract';
import { PackagesService } from './packages.service';
import { RoomsService }    from './rooms.service';
import { SlotsService }    from './slots.service';
import { DrawsService }    from './draws.service';
import { CombineService }  from './combine.service';

const SCHEME_CODE = 'gold_coin_scheme';

// `satisfies` verifies the SchemeService contract without narrowing the type,
// which lets routes call the overloaded getBranchSummary with union arg shapes.
export const GoldCoinService = {
  schemeCode: SCHEME_CODE,

  // Aggregate stats for a branch or set of branches.
  //   { branchId, scopedToUserId? } — single branch (branch_admin / referrer-only roles)
  //   { branchIds }                 — multi-branch aggregate (MD / Director / GM)
  async getBranchSummary(
    db: Pool | PoolClient,
    branchOrBranches: string | { branchId: string; scopedToUserId?: string } | { branchIds: string[] },
    scopedToUserIdLegacy?: string,
    dateFilter?: SchemeDateFilter,
  ): Promise<any> {
    // Normalise the overloaded first arg to canonical shape
    let branchFilter: string;           // SQL fragment
    let branchParams: any[];            // positional values
    let scopedToUserId: string | undefined;

    if (typeof branchOrBranches === 'string') {
      // Legacy call: getBranchSummary(db, branchId, scopedToUserId?, dateFilter?)
      branchFilter = 's.branch_id = $1';
      branchParams = [branchOrBranches];
      scopedToUserId = scopedToUserIdLegacy;
    } else if ('branchIds' in branchOrBranches) {
      // Multi-branch oversight aggregate. Empty array = MD global (no branch filter).
      if (branchOrBranches.branchIds.length === 0) {
        branchFilter = '1=1';
        branchParams = [];
      } else {
        branchFilter = 's.branch_id = ANY($1::uuid[])';
        branchParams = [branchOrBranches.branchIds];
      }
      scopedToUserId = undefined;
    } else {
      // Single branch with optional referrer scope
      branchFilter = 's.branch_id = $1';
      branchParams = [branchOrBranches.branchId];
      scopedToUserId = branchOrBranches.scopedToUserId;
    }

    const params: any[] = [...branchParams];
    let scope = branchFilter;
    let idx = params.length + 1;
    if (scopedToUserId) {
      scope += ` AND s.referrer_id = $${idx++}`;
      params.push(scopedToUserId);
    }
    if (dateFilter?.startDate) {
      scope += ` AND s.created_at >= $${idx++}::date`;
      params.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      scope += ` AND s.created_at < ($${idx++}::date + INTERVAL '1 day')`;
      params.push(dateFilter.endDate);
    }

    // Slot-side counters
    const slotRes = await db.query(
      `SELECT
         COUNT(*)                                    AS total_slots,
         COUNT(*) FILTER (WHERE status='held')       AS held_slots,
         COUNT(*) FILTER (WHERE status='won')        AS won_slots,
         COUNT(*) FILTER (WHERE status='refunded')   AS refunded_slots,
         COALESCE(SUM(amount_paid),0)               AS total_collected
       FROM gold_coin_slots s WHERE ${scope}`,
      params
    );

    // Commission earned via the unified ledger
    const commParams: any[] = [SCHEME_CODE, ...branchParams];

    let commBranchFilter = branchFilter
      .replace('s.branch_id', 's2.branch_id')
      .replace(/\$(\d+)/g, (_, n) => `$${Number(n) + 1}`);

    let commWhere =
      `ei.source_type='scheme' AND ei.scheme_code=$1 AND ${commBranchFilter}`;

    let cIdx = branchParams.length + 2;
    if (scopedToUserId) { commWhere += ` AND ei.user_id=$${cIdx++}`; commParams.push(scopedToUserId); }
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${cIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${cIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query(
      `SELECT COALESCE(SUM(ei.amount),0) AS total_commission
       FROM employee_incentives ei
       JOIN gold_coin_slots s2 ON s2.id = ei.source_id
       WHERE ${commWhere}`,
      commParams
    );

    const r = slotRes.rows[0];
    return {
      totalSlots:      parseInt(r.total_slots, 10),
      heldSlots:       parseInt(r.held_slots, 10),
      wonSlots:        parseInt(r.won_slots, 10),
      refundedSlots:   parseInt(r.refunded_slots, 10),
      totalCollected:  parseFloat(r.total_collected),
      totalCommission: parseFloat(commRes.rows[0].total_commission),
    };
  },

  // ─── ADMIN AGGREGATE: per-branch breakdown for the MD/Director dashboard ───
  // Slots are the unit of money in this scheme — refunded slots are excluded
  // from `collected` since the customer got their money back. count is non-
  // refunded slot count (so it lines up with collected and what the branch is
  // actually responsible for). branch_id on slots is the SOURCE branch even
  // for slots that have moved into a combined head-branch room, so this is the
  // correct breakdown for "which branch drove which money."
  async getOverviewByBranch(
    db: Pool | PoolClient,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number; commission: number }>> {
    const slotParams: any[] = [];
    let slotDate = '';
    let slotIdx = 1;
    if (dateFilter?.startDate) { slotDate += ` AND s.created_at >= $${slotIdx++}::date`; slotParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { slotDate += ` AND s.created_at < ($${slotIdx++}::date + INTERVAL '1 day')`; slotParams.push(dateFilter.endDate); }

    const slotRes = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         s.branch_id,
         b.name AS branch_name,
         COUNT(*) FILTER (WHERE s.status <> 'refunded')::int                              AS count,
         COALESCE(SUM(s.amount_paid) FILTER (WHERE s.status <> 'refunded'), 0)            AS collected
       FROM gold_coin_slots s
       JOIN branches b ON s.branch_id = b.id
       WHERE 1=1${slotDate}
       GROUP BY s.branch_id, b.name
       ORDER BY b.name ASC`,
      slotParams
    );

    const commParams: any[] = [SCHEME_CODE];
    let commDate = '';
    let commIdx = 2;
    if (dateFilter?.startDate) { commDate += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commDate += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT s.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN gold_coin_slots s ON s.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ei.scheme_code = $1${commDate}
       GROUP BY s.branch_id`,
      commParams
    );

    const commByBranch = new Map<string, number>();
    for (const row of commRes.rows) {
      commByBranch.set(row.branch_id, parseFloat(row.commission));
    }

    return slotRes.rows.map(r => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      count:      parseInt(r.count, 10),
      collected:  parseFloat(r.collected),
      commission: commByBranch.get(r.branch_id) ?? 0,
    }));
  },

  // ─── ADMIN DRILL-DOWN: rooms in a single branch ──────────────────────────
  // Rooms (not slots) is the right grain for the dashboard — a branch will
  // typically have a handful of rooms but dozens-to-hundreds of slots.
  // branch_id on the room is the room's owning branch (which is the head
  // branch for combined rooms); slots inside still attribute to their source.
  async getEntriesByBranch(
    db: Pool | PoolClient,
    branchId: string,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'r.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND r.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND r.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         r.id, r.room_number, r.status, r.is_combined, r.fill_deadline,
         r.activated_at, r.first_draw_date, r.completed_at, r.created_at,
         p.name AS package_name, p.price AS package_price, p.gold_grams AS package_gold_grams,
         (SELECT COUNT(*)::int FROM gold_coin_slots s WHERE s.room_id = r.id AND s.status = 'held') AS slots_held,
         (SELECT COUNT(*)::int FROM gold_coin_slots s WHERE s.room_id = r.id AND s.status = 'won')  AS slots_won,
         (SELECT COUNT(*)::int FROM gold_coin_slots s WHERE s.room_id = r.id AND s.status = 'refunded') AS slots_refunded,
         (SELECT COALESCE(SUM(s.amount_paid), 0)
          FROM gold_coin_slots s WHERE s.room_id = r.id AND s.status <> 'refunded') AS collected,
         (SELECT COUNT(*)::int FROM gold_coin_draws d WHERE d.room_id = r.id) AS draws_done
       FROM gold_coin_rooms r
       JOIN gold_coin_packages p ON p.id = r.package_id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT 200`,
      params
    );
    return res.rows;
  },

  // Cash collected in [startDate,endDate] by slot created_at — strictly money in,
  // not notional. Excludes refunded slots. Used by daily reconciliation only.
  async getCollectedByBranch(
    db: Pool | PoolClient,
    dateFilter: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; collected: number }>> {
    const params: any[] = [];
    let where = "s.status <> 'refunded'";
    let idx = 1;
    // TS: date filter follows the standard >=/< convention; both params optional
    if (dateFilter.startDate) { where += ` AND s.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter.endDate)   { where += ` AND s.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query<{ branch_id: string; collected: string }>(
      `SELECT s.branch_id, COALESCE(SUM(s.amount_paid), 0) AS collected
       FROM gold_coin_slots s
       WHERE ${where}
       GROUP BY s.branch_id`,
      params
    );
    // TS: NUMERIC comes back as string from pg; parse to number for the contract type
    return res.rows.map(r => ({ branchId: r.branch_id, collected: parseFloat(r.collected) }));
  },
} satisfies SchemeService;

// Sub-services exported for the routes file
export { PackagesService, RoomsService, SlotsService, DrawsService, CombineService };
