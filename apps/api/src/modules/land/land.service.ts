// Land Sales — facade + SchemeService contract.
//
// Implements getBranchSummary / getOverviewByBranch / getEntriesByBranch so the module
// appears in the MD/Director aggregate schemes dashboard automatically.
//
// Re-exports sub-services so land.routes.ts only needs to import from this one file.

import { Pool } from 'pg';
import type { SchemeService, SchemeDateFilter, SchemeBranchTotals } from '../schemes/scheme.contract';
import { LandBookingsService } from './land-bookings.service';

const SCHEME_CODE = 'land_scheme';

// ─── Sub-service re-exports ────────────────────────────────────────────────────
export { LandSitesService }    from './land-sites.service';
export { LandBookingsService } from './land-bookings.service';
export { LandAuditService }    from './land-audit.service';

// ─── SchemeService implementation ─────────────────────────────────────────────

export const LandService: SchemeService = {
  schemeCode: SCHEME_CODE,

  // Branch summary: booking counts + total collected.
  // Referrer-scoped roles: count their referred bookings across ALL branches
  // (match on referrer_id, drop the branch filter); otherwise scope to the branch.
  async getBranchSummary(
    db: Pool,
    branchId: string,
    scopedToUserId?: string,
    dateFilter?: SchemeDateFilter
  ): Promise<any> {
    const params: any[] = [];
    let where: string;
    if (scopedToUserId) { params.push(scopedToUserId); where = 'bk.referrer_id = $1'; }
    else                { params.push(branchId);       where = 'bk.branch_id = $1'; }
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND bk.booking_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND bk.booking_date <= $${idx++}::date`; params.push(dateFilter.endDate); }

    const result = await db.query(
      `SELECT
         COUNT(*)::int                                                       AS total_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'full_paid')::int              AS full_paid,
         COUNT(*) FILTER (WHERE bk.status = 'completed')::int              AS completed,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled')::int              AS cancelled,
         COALESCE(SUM(bk.full_amount) FILTER (WHERE bk.full_amount IS NOT NULL), 0) AS total_collected
       FROM land_bookings bk WHERE ${where}`,
      params
    );

    // Sum employee_incentives earned. Referrer-scoped: this user's credits across
    // ALL branches; otherwise the whole branch.
    const commParams: any[] = [];
    let commWhere: string;
    if (scopedToUserId) { commParams.push(scopedToUserId, SCHEME_CODE); commWhere = 'ei.user_id = $1 AND ei.scheme_code = $2'; }
    else                { commParams.push(branchId, SCHEME_CODE);       commWhere = 'bk.branch_id = $1 AND ei.scheme_code = $2'; }
    let commIdx = 3;
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commResult = await db.query(
      `SELECT COALESCE(SUM(ei.amount), 0) AS total_commission
       FROM employee_incentives ei
       JOIN land_bookings bk ON bk.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}`,
      commParams
    );

    const r = result.rows[0];
    return {
      totalBookings:   r.total_bookings,
      fullPaid:        r.full_paid,
      completed:       r.completed,
      cancelled:       r.cancelled,
      totalCollected:  parseFloat(r.total_collected),
      totalCommission: parseFloat(commResult.rows[0].total_commission),
    };
  },

  // Aggregate per-branch totals for the MD/Director schemes overview card.
  async getOverviewByBranch(
    db: Pool,
    dateFilter?: SchemeDateFilter
  ): Promise<SchemeBranchTotals[]> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;
    if (dateFilter?.startDate) { where += ` AND bk.booking_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND bk.booking_date <= $${idx++}::date`; params.push(dateFilter.endDate); }

    const result = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         bk.branch_id,
         b.name AS branch_name,
         COUNT(DISTINCT bk.id)::int                                AS count,
         COALESCE(SUM(bk.full_amount) FILTER (WHERE bk.full_amount IS NOT NULL), 0) AS collected
       FROM land_bookings bk
       JOIN branches b ON b.id = bk.branch_id
       WHERE ${where}
       GROUP BY bk.branch_id, b.name
       ORDER BY b.name ASC`,
      params
    );

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT bk.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN land_bookings bk ON bk.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ei.scheme_code = $1
       GROUP BY bk.branch_id`,
      [SCHEME_CODE]
    );
    const commByBranch = new Map<string, number>();
    for (const r of commRes.rows) commByBranch.set(r.branch_id, parseFloat(r.commission));

    return result.rows.map(r => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      count:      parseInt(r.count, 10),
      collected:  parseFloat(r.collected),
      commission: commByBranch.get(r.branch_id) ?? 0,
    }));
  },

  // Per-branch booking entries for the MD/Director drill-down view.
  async getEntriesByBranch(
    db: Pool,
    branchId: string,
    dateFilter?: SchemeDateFilter
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'bk.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND bk.booking_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND bk.booking_date <= $${idx++}::date`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         bk.id, bk.booking_ref, bk.booking_date, bk.payment_mode,
         bk.full_amount, bk.status, bk.created_at, bk.notes,
         bk.advance_amount, bk.advance_date, bk.full_payment_date,
         bk.buyback_start_date, bk.loan_taken, bk.loan_amount,
         bk.referrer_id, u.name AS referrer_name,
         c.name AS customer_name, c.customer_code,
         p.site_number,
         s.name AS site_name
       FROM land_bookings bk
       JOIN customers c   ON c.id = bk.customer_id
       JOIN land_plots p  ON p.id = bk.plot_id
       JOIN land_sites s  ON s.id = p.site_id
       LEFT JOIN users u  ON u.id = bk.referrer_id
       WHERE ${where}
       ORDER BY bk.created_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  },
};
