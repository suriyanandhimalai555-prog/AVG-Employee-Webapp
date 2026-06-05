// Bookings, payments, buyback schedule — branch_admin operations.
//
// Booking lifecycle:
//   booked → advance_paid (advance_full_payment mode only)
//          → full_paid    (direct or from advance_paid)
//          → completed    (all 60 buyback payouts marked paid)
//          → cancelled    (advance forfeited; plot returns to available)
//
// Buyback schedule (60 rows) is auto-created inside the recordFullPayment transaction.

import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { LandAuditService } from './land-audit.service';
import type {
  CreateLandBookingInput, RecordAdvanceInput, RecordFullPaymentInput,
  CancelBookingInput, ListBookingsQuery, MarkPayoutPaidInput,
} from './land.schema';

const COOLING_DAYS   = 60;   // days between full payment and buyback start
const BUYBACK_MONTHS = 60;   // number of monthly buyback payouts
const ADVANCE_DAYS   = 30;   // initial advance deadline window

// ─── helpers ──────────────────────────────────────────────────────────────────

function addDays(date: string, days: number): string {
  // TS: compute a new ISO date string by adding days to an existing YYYY-MM-DD date
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function addMonths(date: string, months: number): string {
  // TS: add calendar months to a YYYY-MM-DD string (handles month-end correctly)
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export const LandBookingsService = {

  // ─── LIST BOOKINGS ────────────────────────────────────────────────────────
  async listBookings(
    db: Pool,
    branchId: string | null,   // null = all (MD)
    query: ListBookingsQuery
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;

    if (branchId) {
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
       ORDER BY bk.created_at DESC
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
         p.site_number, p.area_sqft, p.land_cost, p.buyback_bonus_monthly,
         s.id          AS site_id,
         s.name        AS site_name,
         s.layout_name,
         s.loan_enabled,
         u.name        AS created_by_name
       FROM land_bookings bk
       JOIN customers c  ON c.id = bk.customer_id
       JOIN land_plots p      ON p.id = bk.plot_id
       JOIN land_sites s      ON s.id = p.site_id
       JOIN users u           ON u.id = bk.created_by
       WHERE ${where}`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundError('Booking not found');
    return result.rows[0];
  },

  // ─── CREATE BOOKING ───────────────────────────────────────────────────────
  async createBooking(
    db: Pool,
    userId: string,
    branchId: string,
    payload: CreateLandBookingInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Verify customer belongs to this branch
      const custResult = await client.query(
        `SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2`,
        [payload.customerId, branchId]
      );
      if (custResult.rows.length === 0) {
        throw new NotFoundError('Customer not found in this branch');
      }

      // Lock the plot and verify it's available
      const plotResult = await client.query(
        `SELECT p.*, s.loan_enabled
         FROM land_plots p
         JOIN land_sites s ON s.id = p.site_id
         WHERE p.id = $1
         FOR UPDATE`,
        [payload.plotId]
      );
      if (plotResult.rows.length === 0) throw new NotFoundError('Plot not found');
      const plot = plotResult.rows[0];
      if (plot.status !== 'available') {
        throw new ValidationError(`Plot "${plot.site_number}" is not available (status: ${plot.status})`);
      }

      // Compute advance deadline for advance_full_payment mode
      const advanceDeadline = payload.paymentMode === 'advance_full_payment'
        ? addDays(payload.bookingDate, ADVANCE_DAYS)
        : null;

      // Insert booking
      let bookingResult: any;
      try {
        bookingResult = await client.query(
          `INSERT INTO land_bookings
             (booking_ref, branch_id, customer_id, plot_id, payment_mode,
              booking_date, advance_deadline, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            payload.bookingRef.trim(),
            branchId,
            payload.customerId,
            payload.plotId,
            payload.paymentMode,
            payload.bookingDate,
            advanceDeadline,
            payload.notes || null,
            userId,
          ]
        );
      } catch (err: any) {
        if (err.code === '23505') {
          // Could be duplicate booking_ref or active-booking-per-plot constraint
          throw new ConflictError('Booking reference already exists, or plot already has an active booking');
        }
        throw err;
      }
      const booking = bookingResult.rows[0];

      // Mark plot as booked
      await client.query(
        `UPDATE land_plots SET status = 'booked', updated_by = $1, updated_at = now() WHERE id = $2`,
        [userId, payload.plotId]
      );

      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  booking.id,
        action:    'create',
        changedBy: userId,
        newValues: {
          booking_ref:  booking.booking_ref,
          plot_id:      payload.plotId,
          payment_mode: payload.paymentMode,
          status:       booking.status,
        },
      });

      return {
        booking,
        customer: custResult.rows[0],
        plot: { site_number: plot.site_number, land_cost: plot.land_cost },
      };
    });
  },

  // ─── RECORD ADVANCE PAYMENT ───────────────────────────────────────────────
  async recordAdvance(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null,
    payload: RecordAdvanceInput
  ): Promise<any> {
    const params: any[] = [bookingId];
    let findWhere = 'id = $1';
    if (branchId) { findWhere += ` AND branch_id = $2`; params.push(branchId); }

    const existing = await db.query(
      `SELECT * FROM land_bookings WHERE ${findWhere}`,
      params
    );
    if (existing.rows.length === 0) throw new NotFoundError('Booking not found');
    const booking = existing.rows[0];

    if (booking.payment_mode !== 'advance_full_payment') {
      throw new ValidationError('This booking uses full_payment mode; no advance applies');
    }
    if (booking.status !== 'booked') {
      throw new ValidationError(`Advance already recorded (current status: ${booking.status})`);
    }

    const result = await db.query(
      `UPDATE land_bookings
       SET advance_amount = $1, advance_date = $2, status = 'advance_paid',
           updated_by = $3, updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [payload.advanceAmount, payload.advanceDate, userId, bookingId]
    );
    const updated = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'booking',
      recordId:  bookingId,
      action:    'advance_payment',
      changedBy: userId,
      newValues: { advance_amount: payload.advanceAmount, advance_date: payload.advanceDate, status: 'advance_paid' },
    });

    return updated;
  },

  // ─── RECORD FULL PAYMENT ──────────────────────────────────────────────────
  // Creates the 60-month buyback schedule in the same transaction.
  async recordFullPayment(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null,
    payload: RecordFullPaymentInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const params: any[] = [bookingId];
      let findWhere = 'id = $1';
      if (branchId) { findWhere += ` AND branch_id = $2`; params.push(branchId); }

      const bookingResult = await client.query(
        `SELECT bk.*, p.buyback_bonus_monthly
         FROM land_bookings bk
         JOIN land_plots p ON p.id = bk.plot_id
         WHERE ${findWhere}
         FOR UPDATE`,
        params
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const booking = bookingResult.rows[0];

      if (!['booked', 'advance_paid'].includes(booking.status)) {
        throw new ValidationError(`Full payment cannot be recorded when status is "${booking.status}"`);
      }

      // Validate loan: loan_amount required when loan_taken = true
      if (payload.loanTaken && !payload.loanAmount) {
        throw new ValidationError('Loan amount is required when loan_taken is true');
      }

      // Verify site has loan enabled if loan_taken
      if (payload.loanTaken) {
        const siteCheck = await client.query(
          `SELECT s.loan_enabled FROM land_sites s
           JOIN land_plots p ON p.site_id = s.id
           WHERE p.id = $1`,
          [booking.plot_id]
        );
        if (!siteCheck.rows[0]?.loan_enabled) {
          throw new ValidationError('This site does not offer a company loan');
        }
      }

      const buybackStartDate = addDays(payload.fullPaymentDate, COOLING_DAYS);

      // Update booking to full_paid
      const updResult = await client.query(
        `UPDATE land_bookings
         SET full_amount = $1, full_payment_date = $2,
             loan_taken = $3, loan_amount = $4,
             buyback_start_date = $5, status = 'full_paid',
             updated_by = $6, updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [
          payload.fullAmount,
          payload.fullPaymentDate,
          payload.loanTaken,
          payload.loanAmount || null,
          buybackStartDate,
          userId,
          bookingId,
        ]
      );
      const updated = updResult.rows[0];

      // Auto-create 60 buyback payout rows
      const bonusAmount = parseFloat(booking.buyback_bonus_monthly);
      for (let month = 1; month <= BUYBACK_MONTHS; month++) {
        const dueDate = addMonths(buybackStartDate, month - 1);
        await client.query(
          `INSERT INTO land_buyback_payouts
             (booking_id, month_number, amount, due_date)
           VALUES ($1, $2, $3, $4)`,
          [bookingId, month, bonusAmount, dueDate]
        );
      }

      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  bookingId,
        action:    'full_payment',
        changedBy: userId,
        newValues: {
          full_amount:        payload.fullAmount,
          full_payment_date:  payload.fullPaymentDate,
          buyback_start_date: buybackStartDate,
          loan_taken:         payload.loanTaken,
          status:             'full_paid',
        },
      });

      return { ...updated, buybackStartDate };
    });
  },

  // ─── EXTEND ADVANCE DEADLINE ──────────────────────────────────────────────
  async extendDeadline(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null
  ): Promise<any> {
    const params: any[] = [bookingId];
    let findWhere = 'id = $1';
    if (branchId) { findWhere += ` AND branch_id = $2`; params.push(branchId); }

    const existing = await db.query(
      `SELECT * FROM land_bookings WHERE ${findWhere}`,
      params
    );
    if (existing.rows.length === 0) throw new NotFoundError('Booking not found');
    const booking = existing.rows[0];

    if (!['booked', 'advance_paid'].includes(booking.status)) {
      throw new ValidationError('Deadline can only be extended on active bookings');
    }
    if (booking.payment_mode !== 'advance_full_payment') {
      throw new ValidationError('Only advance+full payment bookings have an advance deadline');
    }
    if (booking.advance_extensions_used >= 2) {
      throw new ValidationError('Maximum 2 deadline extensions allowed; cannot extend further');
    }

    const oldDeadline = booking.advance_deadline as string;
    const newDeadline = addDays(oldDeadline, ADVANCE_DAYS);

    const result = await db.query(
      `UPDATE land_bookings
       SET advance_deadline = $1, advance_extensions_used = advance_extensions_used + 1,
           updated_by = $2, updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [newDeadline, userId, bookingId]
    );
    const updated = result.rows[0];

    await LandAuditService.log(db, {
      entity:    'booking',
      recordId:  bookingId,
      action:    'deadline_extended',
      changedBy: userId,
      oldValues: { advance_deadline: oldDeadline, extensions_used: booking.advance_extensions_used },
      newValues: { advance_deadline: newDeadline, extensions_used: updated.advance_extensions_used },
    });

    return updated;
  },

  // ─── CANCEL BOOKING ───────────────────────────────────────────────────────
  async cancelBooking(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null,
    payload: CancelBookingInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const params: any[] = [bookingId];
      let findWhere = 'id = $1';
      if (branchId) { findWhere += ` AND branch_id = $2`; params.push(branchId); }

      const bookingResult = await client.query(
        `SELECT * FROM land_bookings WHERE ${findWhere} FOR UPDATE`,
        params
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const booking = bookingResult.rows[0];

      if (['cancelled', 'completed'].includes(booking.status)) {
        throw new ValidationError(`Cannot cancel a booking with status "${booking.status}"`);
      }
      if (booking.status === 'full_paid') {
        throw new ValidationError('Full payment has been recorded; cannot cancel this booking');
      }

      // Mark booking cancelled
      const cancelResult = await client.query(
        `UPDATE land_bookings
         SET status = 'cancelled', cancellation_reason = $1,
             updated_by = $2, updated_at = now()
         WHERE id = $3
         RETURNING *`,
        [payload.reason.trim(), userId, bookingId]
      );

      // Return plot to available
      await client.query(
        `UPDATE land_plots
         SET status = 'available', updated_by = $1, updated_at = now()
         WHERE id = $2`,
        [userId, booking.plot_id]
      );

      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  bookingId,
        action:    'cancel',
        changedBy: userId,
        oldValues: { status: booking.status },
        newValues: { status: 'cancelled', cancellation_reason: payload.reason },
      });

      return cancelResult.rows[0];
    });
  },

  // ─── GET BUYBACK PAYOUTS ─────────────────────────────────────────────────
  async getBuybackPayouts(
    db: Pool,
    bookingId: string,
    branchId: string | null
  ): Promise<any[]> {
    const params: any[] = [bookingId];
    if (branchId) {
      // Verify the booking belongs to this branch
      const check = await db.query(
        `SELECT id FROM land_bookings WHERE id = $1 AND branch_id = $2`,
        [bookingId, branchId]
      );
      if (check.rows.length === 0) throw new NotFoundError('Booking not found');
    }

    const result = await db.query(
      `SELECT bp.*,
              u.name AS paid_by_name
       FROM land_buyback_payouts bp
       LEFT JOIN users u ON u.id = bp.paid_by
       WHERE bp.booking_id = $1
       ORDER BY bp.month_number ASC`,
      params
    );
    return result.rows;
  },

  // ─── MARK PAYOUT PAID ─────────────────────────────────────────────────────
  async markPayoutPaid(
    db: Pool,
    userId: string,
    bookingId: string,
    monthNumber: number,
    branchId: string | null,
    payload: MarkPayoutPaidInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Verify booking exists and is accessible
      const params: any[] = [bookingId];
      let bookingWhere = 'id = $1';
      if (branchId) { bookingWhere += ` AND branch_id = $2`; params.push(branchId); }

      const bookingResult = await client.query(
        `SELECT status FROM land_bookings WHERE ${bookingWhere}`,
        params
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      if (bookingResult.rows[0].status !== 'full_paid') {
        throw new ValidationError('Buyback payouts are only available for full_paid bookings');
      }

      // Update the specific payout month
      const payoutResult = await client.query(
        `UPDATE land_buyback_payouts
         SET status = 'paid', paid_date = $1, paid_by = $2, updated_at = now()
         WHERE booking_id = $3 AND month_number = $4 AND status = 'pending'
         RETURNING *`,
        [payload.paidDate, userId, bookingId, monthNumber]
      );
      if (payoutResult.rows.length === 0) {
        throw new NotFoundError('Payout not found or already marked paid');
      }

      await LandAuditService.log(client, {
        entity:    'payout',
        recordId:  payoutResult.rows[0].id,
        action:    'payout_paid',
        changedBy: userId,
        newValues: { month_number: monthNumber, paid_date: payload.paidDate },
      });

      // Check if all 60 payouts are now paid — if so, mark booking as completed
      const unpaidCount = await client.query(
        `SELECT COUNT(*)::int AS n
         FROM land_buyback_payouts
         WHERE booking_id = $1 AND status = 'pending'`,
        [bookingId]
      );
      if (unpaidCount.rows[0].n === 0) {
        await client.query(
          `UPDATE land_bookings
           SET status = 'completed', updated_by = $1, updated_at = now()
           WHERE id = $2`,
          [userId, bookingId]
        );
        // Also mark the plot as completed
        await client.query(
          `UPDATE land_plots
           SET status = 'completed', updated_by = $1, updated_at = now()
           WHERE id = (SELECT plot_id FROM land_bookings WHERE id = $2)`,
          [userId, bookingId]
        );
      }

      return payoutResult.rows[0];
    });
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
};
