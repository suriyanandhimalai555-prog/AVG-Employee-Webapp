// Per-layout employee commission distribution for the Land Sales scheme.
//
// Pattern follows BuildersIncentivesService (builders-incentives.service.ts).
// Rules are stored in land_layout_commission_rules keyed by (layout_id, role).
//
// Two amounts per role, plus monthly_months (nullable per role):
//   spot_amount    — one-time at booking; null monthly_months has no effect here
//   monthly_amount — per buyback payout; skipped if monthNumber > monthly_months
//                    OR monthly_months IS NULL for that role
//
// "PILLARS" in business documentation = 'gm' role in the system.

import { Pool, PoolClient } from 'pg';

// Stable scheme code — matches the 'code' column in the projects table (seeded in migration 051)
const SCHEME_CODE   = 'land_scheme';

// The four roles that can earn commission on land sales, listed from lowest to highest.
// Management and MD are NOT earners — they configure the system, not the recipients.
// "PILLARS" in business docs maps to 'gm' here.
const EARNER_ROLES  = ['sales_officer', 'abm', 'branch_manager', 'gm'] as const;

interface RuleRecord {
  role:           string;
  spot_amount:    string;
  monthly_amount: string;
  monthly_months: number | null;
}

interface RulesMap {
  [role: string]: { spot: number; monthly: number; monthlyMonths: number | null };
}

export const LandIncentivesService = {

  // ─── GET ALL RULES FOR A LAYOUT ───────────────────────────────────────────
  // Returns the 4 commission rows (one per earner role) for a layout.
  // Used by the Management Control Center and Site Detail page commission editor.
  async getRules(db: Pool | PoolClient, layoutId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT r.*, u.name AS updated_by_name
       FROM land_layout_commission_rules r
       LEFT JOIN users u ON u.id = r.updated_by
       WHERE r.layout_id = $1
       ORDER BY CASE r.role
         WHEN 'sales_officer'  THEN 1
         WHEN 'abm'            THEN 2
         WHEN 'branch_manager' THEN 3
         WHEN 'gm'             THEN 4
       END`,
      [layoutId]
    );
    return res.rows;
  },

  // ─── UPSERT A RULE ────────────────────────────────────────────────────────
  // Called by PATCH /land/layouts/:layoutId/commission-rules (Management only).
  // Uses ON CONFLICT DO UPDATE so Management can freely re-save any cell.
  async updateRule(
    db: Pool,
    userId: string,
    payload: {
      layoutId:      string;
      role:          string;
      spotAmount:    number;
      monthlyAmount: number;
      monthlyMonths: number | null;
    }
  ): Promise<any> {
    const res = await db.query(
      `INSERT INTO land_layout_commission_rules
         (layout_id, role, spot_amount, monthly_amount, monthly_months, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (layout_id, role)
       DO UPDATE SET
         spot_amount    = EXCLUDED.spot_amount,
         monthly_amount = EXCLUDED.monthly_amount,
         monthly_months = EXCLUDED.monthly_months,
         updated_by     = EXCLUDED.updated_by,
         updated_at     = now()
       RETURNING *`,
      [payload.layoutId, payload.role, payload.spotAmount, payload.monthlyAmount, payload.monthlyMonths, userId]
    );
    return res.rows[0];
  },

  // ─── LOAD RULES MAP ───────────────────────────────────────────────────────
  // Internal helper: converts DB rows into a role→amounts object for fast
  // lookup during commission distribution without repeated queries.
  async _loadRulesMap(client: Pool | PoolClient, layoutId: string): Promise<RulesMap> {
    const res = await client.query<RuleRecord>(
      `SELECT role, spot_amount, monthly_amount, monthly_months
       FROM land_layout_commission_rules
       WHERE layout_id = $1`,
      [layoutId]
    );
    const map: RulesMap = {};
    for (const r of res.rows) {
      map[r.role] = {
        spot:         parseFloat(r.spot_amount),
        monthly:      parseFloat(r.monthly_amount),
        monthlyMonths: r.monthly_months,
      };
    }
    return map;
  },

  // ─── WALK REFERRER → GM CHAIN ─────────────────────────────────────────────
  // Starting from the referring employee, follow manager_id upward through
  // the org tree, collecting every earner role (SO → ABM → BM → GM).
  // Stops when we hit a non-earning role (director, md) or the top of the tree.
  async _walkChain(
    client: Pool | PoolClient,
    startUserId: string
  ): Promise<Array<{ id: string; role: string }>> {
    const chain: Array<{ id: string; role: string }> = [];
    const first = await client.query(
      `SELECT id, role, manager_id FROM users WHERE id = $1`, [startUserId]
    );
    if (first.rows.length === 0) return chain;
    let current: { id: string; role: string; manager_id: string | null } | null = first.rows[0];
    while (current && (EARNER_ROLES as readonly string[]).includes(current.role)) {
      chain.push({ id: current.id, role: current.role });
      if (current.role === 'gm' || !current.manager_id) break;
      const next = await client.query(
        `SELECT id, role, manager_id FROM users WHERE id = $1`, [current.manager_id]
      );
      current = next.rows[0] ?? null;
    }
    return chain;
  },

  // ─── DISTRIBUTE SPOT COMMISSION (one-time at booking) ────────────────────
  // Called by LandBookingsService.createBooking (inside the booking transaction).
  // Writes one employee_incentives row per earner in the referrer → GM chain
  // whose spot_amount > 0 for this layout. No-op when booking has no referrer.
  async distributeSpot(
    client: PoolClient,
    args: {
      bookingId:      string;
      referrerId:     string;
      layoutId:       string;
      creditedBy:     string;
      customerName:   string;
      plotSiteNumber: string;
      effectiveDate?: string;
    }
  ): Promise<void> {
    const map   = await LandIncentivesService._loadRulesMap(client, args.layoutId);
    const chain = await LandIncentivesService._walkChain(client, args.referrerId);
    for (const person of chain) {
      const rule = map[person.role];
      if (!rule || rule.spot <= 0) continue;
      await client.query(
        `INSERT INTO employee_incentives
           (user_id, amount, source_type, scheme_code, payment_event,
            source_id, source_description, credited_by, created_at)
         VALUES ($1,$2,'scheme',$3,'enrollment',$4,$5,$6,
                 COALESCE($7::timestamptz, now()))`,
        [person.id, rule.spot, SCHEME_CODE, args.bookingId,
          `Land spot commission: ${args.customerName} — Plot ${args.plotSiteNumber}`,
          args.creditedBy, args.effectiveDate ?? null]
      );
    }
  },

  // ─── DISTRIBUTE MONTHLY COMMISSION (per buyback payout) ──────────────────
  // Called by LandBookingsService.markPayoutPaid each time a buyback payout
  // is recorded for the customer. Each role has its OWN monthly_months cap:
  //   - Nellore: SO earns for 60 months, ABM/BM/GM get monthly_months = null → skip
  //   - Veppur:  SO earns for 36 months, others get null → skip after month 36
  //   - Tirupathi Hare Rama: all 4 roles earn for 60 months
  // The monthNumber guard is per-role, so each role stops independently.
  //
  // Earner chain is read from land_booking_earners (snapshot written at createBooking),
  // NOT re-resolved from current manager_id. This ensures promoted or transferred
  // employees keep earning at the role/tier they held when the booking was made,
  // and manager-override portions stay with the old-branch managers.
  // For bookings created before migration 087, the snapshot was backfilled with current
  // manager_id at migration time; those rows fall back to current-role resolution.
  async distributeMonthly(
    client: PoolClient,
    args: {
      bookingId:      string;
      referrerId:     string;
      layoutId:       string;
      monthNumber:    number;
      creditedBy:     string;
      customerName:   string;
      plotSiteNumber: string;
      effectiveDate?: string;
    }
  ): Promise<void> {
    const map = await LandIncentivesService._loadRulesMap(client, args.layoutId);

    // Read the frozen earner chain for this booking
    const snapshotRes = await client.query(
      `SELECT user_id, role FROM land_booking_earners WHERE booking_id = $1`,
      [args.bookingId]
    );

    // Fall back to live chain if no snapshot exists (pre-migration bookings not backfilled)
    const chain: Array<{ id: string; role: string }> = snapshotRes.rows.length > 0
      ? snapshotRes.rows.map((r: { user_id: string; role: string }) => ({ id: r.user_id, role: r.role }))
      : await LandIncentivesService._walkChain(client, args.referrerId);

    for (const person of chain) {
      const rule = map[person.role];
      // TS: null monthly_months = no monthly commission configured for this role
      if (!rule || rule.monthly <= 0 || rule.monthlyMonths == null) continue;
      if (args.monthNumber > rule.monthlyMonths) continue;
      await client.query(
        `INSERT INTO employee_incentives
           (user_id, amount, source_type, scheme_code, payment_event,
            source_id, source_description, credited_by, created_at)
         VALUES ($1,$2,'scheme',$3,'monthly',$4,$5,$6,
                 COALESCE($7::timestamptz, now()))`,
        [person.id, rule.monthly, SCHEME_CODE, args.bookingId,
          `Land M${args.monthNumber} commission: ${args.customerName} — Plot ${args.plotSiteNumber}`,
          args.creditedBy, args.effectiveDate ?? null]
      );
    }
  },
};
