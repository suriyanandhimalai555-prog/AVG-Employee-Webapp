// Land bookings — reads: paged booking list, booking detail, dashboard and booking-ref availability.
// Part of LandBookingsService — composed in ./land-bookings.service.ts; call it through that facade.

import { Pool } from 'pg';
import { NotFoundError } from '../../shared/errors';
import type { ListBookingsQuery } from './land.schema';
import { addDays, addMonths } from './land-bookings.shared';

export const LandBookingsReadService = {
  // ─── LIST BOOKINGS ────────────────────────────────────────────────────────
  async listBookings(
    db: Pool,
    branchId: string | null,   // null = all (MD)
    query: ListBookingsQuery,
    referrerId?: string,       // set for referrer-only roles → own referrals across ALL branches
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;

    // Referrer-scoped roles see their own referred bookings across every branch
    // (match on referrer_id, ignore branch); everyone else stays branch-scoped.
    if (referrerId) {
      where += ` AND bk.referrer_id = $${idx++}`;
      params.push(referrerId);
    } else if (branchId) {
      where += ` AND bk.branch_id = $${idx++}`;
      params.push(branchId);
    }
    if (query.status) {
      where += ` AND bk.status = $${idx++}`;
      params.push(query.status);
    }
    if (query.siteId) {
      where += ` AND p.site_id = $${idx++}`;
      params.push(query.siteId);
    }
    if (query.startDate) {
      where += ` AND bk.booking_date >= $${idx++}::date`;
      params.push(query.startDate);
    }
    if (query.endDate) {
      where += ` AND bk.booking_date <= $${idx++}::date`;
      params.push(query.endDate);
    }

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM land_bookings bk
       JOIN land_plots p ON p.id = bk.plot_id
       WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         bk.*,
         c.name        AS customer_name,
         c.customer_code,
         c.phone       AS customer_phone,
         p.site_number, p.land_cost,
         s.id          AS site_id,
         s.name        AS site_name,
         s.layout_name,
         u.name        AS created_by_name,
         (SELECT COUNT(*)::int FROM land_buyback_payouts bp WHERE bp.booking_id = bk.id AND bp.status = 'paid') AS payouts_paid
       FROM land_bookings bk
       JOIN customers c  ON c.id  = bk.customer_id
       JOIN land_plots p      ON p.id  = bk.plot_id
       JOIN land_sites s      ON s.id  = p.site_id
       JOIN users u           ON u.id  = bk.created_by
       WHERE ${where}
       ORDER BY bk.created_at DESC, bk.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET BOOKING ─────────────────────────────────────────────────────────
  async getBooking(
    db: Pool,
    bookingId: string,
    branchId: string | null
  ): Promise<any> {
    const params: any[] = [bookingId];
    let where = 'bk.id = $1';
    if (branchId) { where += ` AND bk.branch_id = $2`; params.push(branchId); }

    const result = await db.query(
      `SELECT
         bk.*,
         c.name        AS customer_name,
         c.customer_code,
         c.phone       AS customer_phone,
         c.address     AS customer_address,
         p.site_number, p.area_sqft, p.land_cost,
         ll.buyback_bonus_monthly, ll.buyback_months,
         s.id          AS site_id,
         s.name        AS site_name,
         s.layout_name,
         s.loan_enabled,
         u.name        AS created_by_name
       FROM land_bookings bk
       JOIN customers c  ON c.id = bk.customer_id
       JOIN land_plots p      ON p.id = bk.plot_id
       JOIN land_layouts ll   ON ll.id = p.layout_id
       JOIN land_sites s      ON s.id = p.site_id
       JOIN users u           ON u.id = bk.created_by
       WHERE ${where}`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundError('Booking not found');
    const row = result.rows[0];

    // Fetch the individual advance instalment rows from the child table so the
    // detail page can render each payment with its own date, channel and proof.
    const advancesResult = await db.query(
      `SELECT id, amount, advance_date, channel, proof_key, transaction_id, created_at
       FROM land_booking_advances
       WHERE booking_id = $1
       ORDER BY advance_date, created_at`,
      [row.id]
    );
    // TS: pg returns NUMERIC as strings — parse each advance amount at the read site.
    row.advances = advancesResult.rows.map((a: any) => ({
      ...a,
      amount: parseFloat(a.amount),
    }));

    // Compute and expose the remaining balance on the booking object so the
    // frontend can prefill the full-payment field without a separate calculation.
    // TS: advance_amount is NUMERIC — parse before subtraction.
    const landCost   = parseFloat(row.land_cost);
    const advTotal   = row.advance_amount != null ? parseFloat(row.advance_amount) : 0;
    row.balance_remaining = Math.round((landCost - advTotal) * 100) / 100;

    return row;
  },

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  async getDashboard(
    db: Pool,
    branchId: string | null   // null = org-wide (MD)
  ): Promise<any> {
    const bParam = branchId ? [branchId] : [];
    const bWhere = branchId ? 'bk.branch_id = $1' : '1=1';

    // Plot stats (org-wide always, since plots don't belong to branches)
    const plotStats = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'available')::int  AS available_plots,
        COUNT(*) FILTER (WHERE status = 'booked')::int     AS booked_plots,
        COUNT(*) FILTER (WHERE status = 'completed')::int  AS completed_plots,
        COUNT(*)::int                                       AS total_plots
      FROM land_plots
    `);

    // Booking stats for scope
    const bookingStats = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE bk.status = 'booked')::int         AS pending_bookings,
         COUNT(*) FILTER (WHERE bk.status = 'advance_paid')::int   AS advance_paid,
         COUNT(*) FILTER (WHERE bk.status = 'full_paid')::int      AS full_paid,
         COUNT(*) FILTER (WHERE bk.status = 'completed')::int      AS completed,
         COUNT(*) FILTER (WHERE bk.status = 'cancelled')::int      AS cancelled,
         COALESCE(SUM(bk.full_amount), 0)                          AS total_collected
       FROM land_bookings bk WHERE ${bWhere}`,
      bParam
    );

    // Advance deadlines in next 7 and 30 days
    const today = new Date().toISOString().split('T')[0];
    const in7    = addDays(today, 7);
    const in30   = addDays(today, 30);
    const deadlineParams = branchId
      ? [today, in7, branchId] : [today, in7];
    const deadlineWhere = branchId ? 'AND bk.branch_id = $3' : '';

    const upcomingDeadlines7 = await db.query(
      `SELECT COUNT(*)::int AS n FROM land_bookings bk
       WHERE bk.status IN ('booked','advance_paid')
         AND bk.advance_deadline IS NOT NULL
         AND bk.advance_deadline BETWEEN $1::date AND $2::date
         ${deadlineWhere}`,
      deadlineParams
    );

    const deadline30Params = branchId ? [today, in30, branchId] : [today, in30];
    const upcomingDeadlines30 = await db.query(
      `SELECT COUNT(*)::int AS n FROM land_bookings bk
       WHERE bk.status IN ('booked','advance_paid')
         AND bk.advance_deadline IS NOT NULL
         AND bk.advance_deadline BETWEEN $1::date AND $2::date
         ${deadlineWhere}`,
      deadline30Params
    );

    // Buyback payouts due this month and overdue
    const firstOfMonth = `${today.slice(0, 7)}-01`;
    const lastOfMonth  = addDays(addMonths(firstOfMonth, 1), -1);
    const payoutBaseWhere = branchId
      ? `bp.status = 'pending' AND bk.branch_id = $1` : `bp.status = 'pending'`;
    const payoutParams = branchId ? [branchId] : [];

    const payoutThisMonth = await db.query(
      `SELECT COUNT(*)::int AS n FROM land_buyback_payouts bp
       JOIN land_bookings bk ON bk.id = bp.booking_id
       WHERE ${payoutBaseWhere}
         AND bp.due_date BETWEEN '${firstOfMonth}' AND '${lastOfMonth}'`,
      payoutParams
    );

    const overduePayouts = await db.query(
      `SELECT COUNT(*)::int AS n FROM land_buyback_payouts bp
       JOIN land_bookings bk ON bk.id = bp.booking_id
       WHERE ${payoutBaseWhere}
         AND bp.due_date < '${today}'`,
      payoutParams
    );

    // Recent bookings (last 5)
    const recentResult = await db.query(
      `SELECT bk.booking_ref, bk.booking_date, bk.status,
              c.name AS customer_name, p.site_number, s.name AS site_name
       FROM land_bookings bk
       JOIN customers c ON c.id = bk.customer_id
       JOIN land_plots p     ON p.id = bk.plot_id
       JOIN land_sites s     ON s.id = p.site_id
       WHERE ${bWhere}
       ORDER BY bk.created_at DESC LIMIT 5`,
      bParam
    );

    const ps = plotStats.rows[0];
    const bs = bookingStats.rows[0];
    return {
      plots: {
        available:  ps.available_plots,
        booked:     ps.booked_plots,
        completed:  ps.completed_plots,
        total:      ps.total_plots,
      },
      bookings: {
        pending:      bs.pending_bookings,
        advancePaid:  bs.advance_paid,
        fullPaid:     bs.full_paid,
        completed:    bs.completed,
        cancelled:    bs.cancelled,
        totalCollected: parseFloat(bs.total_collected),
      },
      upcomingDeadlines7:  upcomingDeadlines7.rows[0].n,
      upcomingDeadlines30: upcomingDeadlines30.rows[0].n,
      payoutsDueThisMonth: payoutThisMonth.rows[0].n,
      overduePayouts:      overduePayouts.rows[0].n,
      recentBookings:      recentResult.rows,
    };
  },

  // ─── BOOKING REF AVAILABILITY (used by the branch-scoped number picker) ──────
  // Returns all booking_ref values already in use for the branch, plus a
  // suggested next numeric ref (zero-padded to the width of the widest existing
  // numeric ref, defaulting to 3 digits — "001").
  async getBookingRefAvailability(db: Pool, branchId: string): Promise<{ takenRefs: string[]; suggestedRef: string }> {
    // TS: result is a list of booking_ref strings for the given branch
    const result = await db.query<{ booking_ref: string }>(
      `SELECT booking_ref FROM land_bookings WHERE branch_id = $1 ORDER BY booking_ref`,
      [branchId]
    );
    const takenRefs: string[] = result.rows.map(r => r.booking_ref);

    // TS: extract purely-numeric refs to compute the next suggestion
    const numericRefs = takenRefs.filter(r => /^\d+$/.test(r)).map(r => parseInt(r, 10));
    const maxNum      = numericRefs.length > 0 ? Math.max(...numericRefs) : 0;
    const nextNum     = maxNum + 1;

    // TS: zero-pad to max width of existing numeric refs, min 3 digits (e.g. "001")
    const maxWidth    = numericRefs.length > 0 ? Math.max(...takenRefs.filter(r => /^\d+$/.test(r)).map(r => r.length)) : 3;
    const padWidth    = Math.max(maxWidth, 3);
    const suggestedRef = String(nextNum).padStart(padWidth, '0');

    return { takenRefs, suggestedRef };
  },
};
