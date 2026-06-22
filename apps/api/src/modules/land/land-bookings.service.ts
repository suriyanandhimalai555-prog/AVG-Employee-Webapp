// Bookings, payments, buyback schedule — branch_admin (and Management) write operations.
//
// Who does what:
//   Management  — creates sites/layouts/plots via land-sites.service
//   Branch Admin — creates bookings and records payments here
//   MD / all roles — read-only views
//
// Booking lifecycle:
//   booked       → after customer signs up (no money yet)
//   advance_paid → advance amount recorded (advance_full_payment mode only)
//   full_paid    → full payment recorded; 60 buyback payout rows auto-created
//   completed    → all 60 customer buyback payouts marked paid
//   cancelled    → booking voided; plot returns to 'available'
//   voided       → Management/MD correction; incentives clawed back
//
// Commission flow:
//   createBooking       → distributeSpot (one-time credit to referrer chain)
//   markPayoutPaid      → distributeMonthly (per buyback month, per-role cap)
//   voidBooking         → IncentiveService.reverseIncentives (claw back all)

import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { LandAuditService } from './land-audit.service';
import { LandIncentivesService } from './land-incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import type {
  CreateLandBookingInput, RecordAdvanceInput, RecordFullPaymentInput,
  CancelBookingInput, ListBookingsQuery, MarkPayoutPaidInput,
  CorrectLandBookingInput,
} from './land.schema';

// Number of days before buyback payments start after full payment is received
const COOLING_DAYS   = 60;
// How many monthly buyback payout rows are created for the customer (fixed per booking)
const BUYBACK_MONTHS = 60;
// Initial window (days) for the customer to pay the full amount after advance
const ADVANCE_DAYS   = 30;

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
    return result.rows[0];
  },

  // ─── CREATE BOOKING ───────────────────────────────────────────────────────
  // Main entry point for Branch Admins recording a new land booking.
  // Steps inside the transaction:
  //   1. Verify customer is in this branch
  //   2. Lock the plot (FOR UPDATE) and confirm it's 'available'
  //   3. Insert the booking row (with optional referrer_id)
  //   4. Set plot status → 'booked'
  //   5. If referrerId is set, distribute spot commission (LandIncentivesService)
  //   6. Write to land_audit_log
  async createBooking(
    db: Pool,
    userId: string,
    branchId: string,
    payload: CreateLandBookingInput
  ): Promise<any> {
    const result = await runInTransaction(db, async (client: PoolClient) => {
      // Step 1 — customer must exist in this branch (prevents cross-branch bookings)
      const custResult = await client.query(
        `SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2`,
        [payload.customerId, branchId]
      );
      if (custResult.rows.length === 0) {
        throw new NotFoundError('Customer not found in this branch');
      }

      // Lock the plot and verify it's available; capture layout_id for commissions
      const plotResult = await client.query(
        `SELECT p.*, ll.id AS layout_id, ll.buyback_bonus_monthly AS layout_buyback, s.loan_enabled
         FROM land_plots p
         JOIN land_layouts ll ON ll.id = p.layout_id
         JOIN land_sites   s  ON s.id  = ll.site_id
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

      // Insert booking (now includes referrer_id for commission attribution)
      let bookingResult: any;
      try {
        bookingResult = await client.query(
          `INSERT INTO land_bookings
             (booking_ref, branch_id, customer_id, plot_id, payment_mode,
              booking_date, advance_deadline, notes, referrer_id, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
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
            payload.referrerId || null,
            userId,
          ]
        );
      } catch (err: any) {
        if (err.code === '23505') {
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

      // Distribute spot (one-time) commission to the referrer's chain
      if (payload.referrerId) {
        await LandIncentivesService.distributeSpot(client, {
          bookingId:      booking.id,
          referrerId:     payload.referrerId,
          layoutId:       plot.layout_id,
          creditedBy:     userId,
          customerName:   custResult.rows[0].name,
          plotSiteNumber: plot.site_number,
          effectiveDate:  payload.bookingDate,
        });
      }

      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  booking.id,
        action:    'create',
        changedBy: userId,
        newValues: {
          booking_ref:  booking.booking_ref,
          plot_id:      payload.plotId,
          payment_mode: payload.paymentMode,
          referrer_id:  payload.referrerId || null,
          status:       booking.status,
        },
      });

      return {
        booking,
        customer: custResult.rows[0],
        plot: { site_number: plot.site_number, land_cost: plot.land_cost },
      };
    });

    return result;
  },

  // ─── RECORD ADVANCE PAYMENT ───────────────────────────────────────────────
  // Wrapped in runInTransaction so the booking UPDATE and audit log row are
  // either both committed or both rolled back — mirrors recordFullPayment below.
  async recordAdvance(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null,
    payload: RecordAdvanceInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const params: any[] = [bookingId];
      let findWhere = 'id = $1';
      if (branchId) { findWhere += ` AND branch_id = $2`; params.push(branchId); }

      // TS: FOR UPDATE locks the row so concurrent advance attempts are serialised.
      const existing = await client.query(
        `SELECT * FROM land_bookings WHERE ${findWhere} FOR UPDATE`,
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

      const result = await client.query(
        `UPDATE land_bookings
         SET advance_amount = $1, advance_date = $2, status = 'advance_paid',
             advance_channel = $3, advance_proof_key = $4, advance_transaction_id = $5,
             updated_by = $6, updated_at = now()
         WHERE id = $7
         RETURNING *`,
        [payload.advanceAmount, payload.advanceDate, payload.advanceChannel || 'cash',
          payload.advanceProofKey?.length ? payload.advanceProofKey : null,
          // advanceTransactionId is TEXT[] — bind array directly; empty array → NULL
          payload.advanceTransactionId?.length ? payload.advanceTransactionId : null,
          userId, bookingId]
      );
      const updated = result.rows[0];

      // TS: pass the transaction client so the audit row and booking update share
      // the same transaction — an audit-log failure rolls back the booking change too.
      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  bookingId,
        action:    'advance_payment',
        changedBy: userId,
        newValues: { advance_amount: payload.advanceAmount, advance_date: payload.advanceDate, status: 'advance_paid' },
      });

      return updated;
    });
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
      // TS: qualify with bk. alias — all three joined tables have an 'id' column,
      // so an unqualified reference causes a PostgreSQL ambiguity error.
      let findWhere = 'bk.id = $1';
      if (branchId) { findWhere += ` AND bk.branch_id = $2`; params.push(branchId); }

      // Join land_layouts to get the authoritative buyback_bonus_monthly and
      // buyback_months — these moved from land_plots to land_layouts in migration 062.
      // land_plots.buyback_bonus_monthly still exists but defaults to 0 for new plots
      // and would cause the land_buyback_payouts CHECK(amount > 0) to fail.
      const bookingResult = await client.query(
        `SELECT bk.*, ll.buyback_bonus_monthly, ll.buyback_months
         FROM land_bookings bk
         JOIN land_plots   p  ON p.id  = bk.plot_id
         JOIN land_layouts ll ON ll.id = p.layout_id
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
             full_channel = $6, full_proof_key = $7, full_transaction_id = $8,
             updated_by = $9, updated_at = now()
         WHERE id = $10
         RETURNING *`,
        [
          payload.fullAmount,
          payload.fullPaymentDate,
          payload.loanTaken,
          payload.loanAmount || null,
          buybackStartDate,
          payload.fullChannel || 'cash',
          payload.fullProofKey?.length ? payload.fullProofKey : null,
          // fullTransactionId is TEXT[] — bind array directly; empty array → NULL
          payload.fullTransactionId?.length ? payload.fullTransactionId : null,
          userId,
          bookingId,
        ]
      );
      const updated = updResult.rows[0];

      // Auto-create buyback payout rows using the layout's monthly amount and
      // duration. Skip entirely for spot_incentive layouts where buyback_bonus_monthly
      // is NULL/0 — those layouts have no customer buyback, and the
      // land_buyback_payouts CHECK(amount > 0) would reject a 0-amount row anyway.
      const bonusAmount  = parseFloat(booking.buyback_bonus_monthly);
      // TS: use the layout's buyback_months when set; fall back to the module constant
      const buybackCount: number = booking.buyback_months ?? BUYBACK_MONTHS;
      if (bonusAmount > 0 && buybackCount > 0) {
        for (let month = 1; month <= buybackCount; month++) {
          const dueDate = addMonths(buybackStartDate, month - 1);
          await client.query(
            `INSERT INTO land_buyback_payouts
               (booking_id, month_number, amount, due_date)
             VALUES ($1, $2, $3, $4)`,
            [bookingId, month, bonusAmount, dueDate]
          );
        }
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

  // ─── CORRECT BOOKING (admin: MD / Management) ────────────────────────────
  // Patches editable booking fields. Land has no incentives so no reversal needed.
  async correctBooking(
    db: Pool,
    correctedBy: string,
    bookingId: string,
    branchId: string,
    payload: CorrectLandBookingInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Join customer + plot so a referrer change can re-distribute commissions
      // without a second context lookup; site supplies loan_enabled for loan edits.
      const before = await client.query(
        `SELECT bk.*, c.name AS customer_name, p.site_number, p.layout_id, s.loan_enabled
         FROM land_bookings bk
         JOIN customers c  ON c.id = bk.customer_id
         JOIN land_plots p ON p.id = bk.plot_id
         JOIN land_sites s ON s.id = p.site_id
         WHERE bk.id = $1 AND bk.branch_id = $2`,
        [bookingId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Booking not found');
      const old = before.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.bookingRef  != null) { fields.push(`booking_ref = $${idx++}`);   vals.push(payload.bookingRef); }
      if (payload.bookingDate != null) { fields.push(`booking_date = $${idx++}`);  vals.push(payload.bookingDate); }
      if (payload.paymentMode != null) { fields.push(`payment_mode = $${idx++}`);  vals.push(payload.paymentMode); }
      if (payload.notes !== undefined) { fields.push(`notes = $${idx++}`);         vals.push(payload.notes); }

      // Customer change — must stay within the booking's branch
      let customerName = old.customer_name;
      if (payload.customerId != null && payload.customerId !== old.customer_id) {
        const cust = await client.query(
          `SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2`,
          [payload.customerId, branchId]
        );
        if (cust.rows.length === 0) throw new NotFoundError('Customer not found in this branch');
        customerName = cust.rows[0].name;
        fields.push(`customer_id = $${idx++}`); vals.push(payload.customerId);
      }

      // Advance corrections are only meaningful once an advance was recorded
      if (payload.advanceAmount != null || payload.advanceDate != null || payload.advanceChannel != null || payload.advanceProofKey != null || payload.advanceTransactionId !== undefined) {
        if (old.advance_amount == null) throw new ValidationError('No advance recorded on this booking');
        if (payload.advanceAmount  != null) { fields.push(`advance_amount = $${idx++}`);     vals.push(payload.advanceAmount); }
        if (payload.advanceDate    != null) { fields.push(`advance_date = $${idx++}`);        vals.push(payload.advanceDate); }
        if (payload.advanceChannel != null) { fields.push(`advance_channel = $${idx++}`);     vals.push(payload.advanceChannel); }
        if (payload.advanceProofKey != null) { fields.push(`advance_proof_key = $${idx++}`); vals.push(payload.advanceProofKey); }
        // advanceTransactionId is TEXT[] — bind array directly; empty array or null → explicit NULL
        if (payload.advanceTransactionId !== undefined) { fields.push(`advance_transaction_id = $${idx++}`); vals.push(payload.advanceTransactionId?.length ? payload.advanceTransactionId : null); }
      }

      // Full-payment corrections — moving the date also moves the buyback start
      // (full_payment_date + cooling days) and the pending payout schedule below.
      // TS: newBuybackStart doubles as the "schedule needs shifting" flag after the UPDATE
      let newBuybackStart: string | null = null;
      if (payload.fullAmount != null || payload.fullPaymentDate != null || payload.fullChannel != null || payload.fullProofKey != null || payload.fullTransactionId !== undefined) {
        if (old.full_payment_date == null) throw new ValidationError('No full payment recorded on this booking');
        if (payload.fullAmount   != null) { fields.push(`full_amount = $${idx++}`);      vals.push(payload.fullAmount); }
        if (payload.fullChannel  != null) { fields.push(`full_channel = $${idx++}`);     vals.push(payload.fullChannel); }
        if (payload.fullProofKey != null) { fields.push(`full_proof_key = $${idx++}`);   vals.push(payload.fullProofKey); }
        // fullTransactionId is TEXT[] — bind array directly; empty array or null → explicit NULL
        if (payload.fullTransactionId !== undefined) { fields.push(`full_transaction_id = $${idx++}`); vals.push(payload.fullTransactionId?.length ? payload.fullTransactionId : null); }
        if (payload.fullPaymentDate != null) {
          newBuybackStart = addDays(payload.fullPaymentDate, COOLING_DAYS);
          fields.push(`full_payment_date = $${idx++}`);  vals.push(payload.fullPaymentDate);
          fields.push(`buyback_start_date = $${idx++}`); vals.push(newBuybackStart);
        }
      }

      // Loan corrections — same rules as recordFullPayment (amount required and
      // site must offer the loan when loan_taken is true)
      if (payload.loanTaken !== undefined || payload.loanAmount !== undefined) {
        if (old.full_payment_date == null) throw new ValidationError('No full payment recorded on this booking');
        const effLoanTaken  = payload.loanTaken  !== undefined ? payload.loanTaken  : old.loan_taken;
        const effLoanAmount = payload.loanAmount !== undefined ? payload.loanAmount : old.loan_amount;
        if (effLoanTaken) {
          if (!effLoanAmount) throw new ValidationError('Loan amount is required when loan_taken is true');
          if (!old.loan_enabled) throw new ValidationError('This site does not offer a company loan');
        }
        fields.push(`loan_taken = $${idx++}`);  vals.push(effLoanTaken);
        fields.push(`loan_amount = $${idx++}`); vals.push(effLoanTaken ? effLoanAmount : null);
      }

      if (payload.referrerId !== undefined) {
        if (payload.referrerId) {
          const ref = await client.query(
            `SELECT id FROM users WHERE id = $1 AND is_active = true`,
            [payload.referrerId]
          );
          if (ref.rows.length === 0) throw new NotFoundError('Referrer not found or inactive');
        }
        fields.push(`referrer_id = $${idx++}`); vals.push(payload.referrerId ?? null);
      }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(bookingId, branchId);
      const updated = await client.query(
        `UPDATE land_bookings SET ${fields.join(', ')} WHERE id = $${idx} AND branch_id = $${idx + 1} RETURNING *`,
        vals
      );

      // Shift the schedule for months not yet paid out; paid rows keep their
      // historical due/paid dates. Same addMonths loop as recordFullPayment so
      // month-end handling stays identical.
      if (newBuybackStart) {
        const pendingPayouts = await client.query(
          `SELECT id, month_number FROM land_buyback_payouts
           WHERE booking_id = $1 AND status = 'pending'`,
          [bookingId]
        );
        for (const payout of pendingPayouts.rows) {
          await client.query(
            `UPDATE land_buyback_payouts SET due_date = $1, updated_at = now() WHERE id = $2`,
            [addMonths(newBuybackStart, payout.month_number - 1), payout.id]
          );
        }
      }

      const referrerChanged   = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;

      if (referrerChanged) {
        // Claw back ALL commissions for this booking (spot + monthly, the whole
        // old referrer chain), then re-walk the new referrer's chain preserving
        // the original business dates. Reversal must not depend on a new referrer
        // so clearing to null also removes the old credits.
        await IncentiveService.reverseIncentives(client, {
          schemeCode: 'land_scheme',
          sourceId:   bookingId,
        });
        if (effectiveReferrer) {
          await LandIncentivesService.distributeSpot(client, {
            bookingId,
            referrerId:     effectiveReferrer,
            layoutId:       old.layout_id,
            creditedBy:     correctedBy,
            customerName,
            plotSiteNumber: old.site_number,
            effectiveDate:  payload.bookingDate ?? old.booking_date,
          });
          // Re-credit each already-paid buyback month on its original paid date
          const paidPayouts = await client.query(
            `SELECT month_number, paid_date FROM land_buyback_payouts
             WHERE booking_id = $1 AND status = 'paid'
             ORDER BY month_number`,
            [bookingId]
          );
          for (const payout of paidPayouts.rows) {
            await LandIncentivesService.distributeMonthly(client, {
              bookingId,
              referrerId:     effectiveReferrer,
              layoutId:       old.layout_id,
              monthNumber:    payout.month_number,
              creditedBy:     correctedBy,
              customerName,
              plotSiteNumber: old.site_number,
              effectiveDate:  payout.paid_date,
            });
          }
        }
      }

      // Use the shared scheme audit (not just Land's own audit) for consistency
      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'booking',
        entityId:   bookingId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID BOOKING (Management only — called from the corrections page) ──────
  // Soft-voids a land booking and claws back ALL commission credits
  // (both spot enrollment credits and any monthly credits already distributed).
  // The plot is returned to 'available' so it can be re-booked.
  // Uses SchemeAudit.log for the correction audit trail.
  async voidBooking(
    db: Pool,
    actorId: string,
    bookingId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM land_bookings WHERE id = $1 AND branch_id = $2`,
        [bookingId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Booking not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Booking is already voided');

      await client.query(
        `UPDATE land_bookings SET status = 'voided' WHERE id = $1`,
        [bookingId]
      );

      // Restore plot to 'available' so it can be re-booked
      await client.query(
        `UPDATE land_plots SET status = 'available' WHERE id = $1`,
        [old.plot_id]
      );

      // Claw back all spot + monthly commissions for this booking
      if (old.referrer_id) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode: 'land_scheme',
          sourceId:   bookingId,
        });
      }

      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'booking',
        entityId:   bookingId,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── DELETE BOOKING (Management only) ───────────────────────────────────────
  // Permanently deletes a booking and all buyback payouts (no FK cascade, so
  // payouts go first), restores the plot to 'available', claws back ALL
  // incentives, and snapshots the full before-state into the audit log.
  async deleteBooking(
    db: Pool,
    actorId: string,
    bookingId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM land_bookings WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [bookingId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Booking not found');
      const old = before.rows[0];

      const payouts = await client.query(
        `SELECT * FROM land_buyback_payouts WHERE booking_id = $1 ORDER BY month_number`,
        [bookingId]
      );

      // Restore plot to 'available' so it can be re-booked
      await client.query(
        `UPDATE land_plots SET status = 'available' WHERE id = $1`,
        [old.plot_id]
      );

      // Claw back all spot + monthly commissions (unconditional — reverse is harmless if none)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: 'land_scheme',
        sourceId:   bookingId,
      });

      await client.query(`DELETE FROM land_buyback_payouts WHERE booking_id = $1`, [bookingId]);
      await client.query(`DELETE FROM land_bookings WHERE id = $1`, [bookingId]);

      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'booking',
        entityId:   bookingId,
        actorId,
        action:     'delete',
        oldValues:  { booking: old, payouts: payouts.rows },
      });

      return { deleted: true, id: bookingId, payouts: payouts.rows.length };
    });
  },

  // ─── UNPAY BUYBACK PAYOUT (Management correction) ──────────────────────────
  // Reverts one paid monthly payout to pending and claws back its commission.
  // Land monthly incentive rows carry payment_event='monthly' with the month
  // only in the description, so a single month cannot be deleted surgically:
  // reverse ALL monthly rows, then re-credit every remaining paid month on its
  // original paid date (same pattern as gold unpayPayment and correctBooking's
  // referrer change).
  async unpayBuybackPayout(
    db: Pool,
    actorId: string,
    bookingId: string,
    monthNumber: number,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const bookingResult = await client.query(
        `SELECT bk.*, p.layout_id, p.site_number, c.name AS customer_name
         FROM land_bookings bk
         JOIN land_plots p ON p.id = bk.plot_id
         JOIN customers  c ON c.id = bk.customer_id
         WHERE bk.id = $1 AND bk.branch_id = $2
         FOR UPDATE OF bk`,
        [bookingId, branchId]
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const bk = bookingResult.rows[0];
      if (!['full_paid', 'completed'].includes(bk.status)) {
        throw new ValidationError(`Payouts can only be unpaid on full_paid/completed bookings (status: ${bk.status})`);
      }

      const payoutResult = await client.query(
        `UPDATE land_buyback_payouts
         SET status = 'pending', paid_date = NULL, paid_by = NULL, updated_at = now()
         WHERE booking_id = $1 AND month_number = $2 AND status = 'paid'
         RETURNING *`,
        [bookingId, monthNumber]
      );
      if (payoutResult.rows.length === 0) {
        throw new NotFoundError('Payout not found or not marked paid');
      }

      // Claw back all monthly commissions, then re-credit the months still paid
      if (bk.referrer_id) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   'land_scheme',
          sourceId:     bookingId,
          paymentEvent: 'monthly',
        });
        const stillPaid = await client.query(
          `SELECT month_number, paid_date FROM land_buyback_payouts
           WHERE booking_id = $1 AND status = 'paid'
           ORDER BY month_number`,
          [bookingId]
        );
        for (const payout of stillPaid.rows) {
          await LandIncentivesService.distributeMonthly(client, {
            bookingId,
            referrerId:     bk.referrer_id,
            layoutId:       bk.layout_id,
            monthNumber:    payout.month_number,
            creditedBy:     actorId,
            customerName:   bk.customer_name,
            plotSiteNumber: bk.site_number,
            effectiveDate:  payout.paid_date,
          });
        }
      }

      // A completed booking is no longer complete — reopen booking + plot
      if (bk.status === 'completed') {
        await client.query(
          `UPDATE land_bookings SET status = 'full_paid', updated_by = $1, updated_at = now() WHERE id = $2`,
          [actorId, bookingId]
        );
        await client.query(
          `UPDATE land_plots SET status = 'booked', updated_by = $1, updated_at = now() WHERE id = $2`,
          [actorId, bk.plot_id]
        );
      }

      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'payout',
        entityId:   payoutResult.rows[0].id,
        actorId,
        action:     'unpay',
        oldValues:  { booking_id: bookingId, month_number: monthNumber, paid_date: null, status_before: 'paid' },
      });

      return payoutResult.rows[0];
    });
  },

  // ─── UNDO FULL PAYMENT (Management correction) ──────────────────────────────
  // Removes the buyback payout schedule and reverts the booking to its
  // pre-full-payment state. Requires every payout to be unpaid first so each
  // month's incentive clawback flows through unpayBuybackPayout and stays
  // individually audited. Full payment itself never distributes incentives
  // (spot = createBooking, monthly = markPayoutPaid), so nothing to reverse here.
  async undoFullPayment(
    db: Pool,
    actorId: string,
    bookingId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const bookingResult = await client.query(
        `SELECT * FROM land_bookings WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [bookingId, branchId]
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const old = bookingResult.rows[0];
      if (old.status !== 'full_paid') {
        throw new ValidationError(`Full payment can only be undone on a full_paid booking (status: ${old.status})`);
      }

      const paidCount = await client.query(
        `SELECT COUNT(*)::int AS n FROM land_buyback_payouts WHERE booking_id = $1 AND status = 'paid'`,
        [bookingId]
      );
      if (paidCount.rows[0].n > 0) {
        throw new ValidationError('Unpay all paid buyback months first, then undo the full payment');
      }

      await client.query(`DELETE FROM land_buyback_payouts WHERE booking_id = $1`, [bookingId]);

      const updated = await client.query(
        `UPDATE land_bookings
         SET full_amount = NULL, full_payment_date = NULL, buyback_start_date = NULL,
             loan_taken = false, loan_amount = NULL,
             status = CASE WHEN advance_amount IS NOT NULL THEN 'advance_paid' ELSE 'booked' END,
             updated_by = $1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [actorId, bookingId]
      );

      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'booking',
        entityId:   bookingId,
        actorId,
        action:     'unpay',
        oldValues:  old,
        newValues:  updated.rows[0],
        notes:      'undo full payment',
      });

      return updated.rows[0];
    });
  },

  // ─── UNDO ADVANCE (Management correction) ───────────────────────────────────
  // Clears the recorded advance and reverts the booking to 'booked'. Only valid
  // while the booking sits at advance_paid — undo the full payment first if one
  // was recorded. advance_deadline / extensions derive from booking_date, so
  // they are left untouched.
  async undoAdvance(
    db: Pool,
    actorId: string,
    bookingId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const bookingResult = await client.query(
        `SELECT * FROM land_bookings WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [bookingId, branchId]
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const old = bookingResult.rows[0];
      if (old.status !== 'advance_paid') {
        throw new ValidationError(`Advance can only be undone on an advance_paid booking (status: ${old.status})`);
      }

      const updated = await client.query(
        `UPDATE land_bookings
         SET advance_amount = NULL, advance_date = NULL, status = 'booked',
             updated_by = $1, updated_at = now()
         WHERE id = $2
         RETURNING *`,
        [actorId, bookingId]
      );

      await SchemeAudit.log(client, {
        schemeCode: 'land_scheme',
        entityType: 'booking',
        entityId:   bookingId,
        actorId,
        action:     'unpay',
        oldValues:  old,
        newValues:  updated.rows[0],
        notes:      'undo advance',
      });

      return updated.rows[0];
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
  // Records that a specific monthly buyback payout was sent to the customer.
  // Also distributes the monthly employee commission to the referrer chain for
  // this month (if the booking has a referrer and the month is within the
  // per-role monthly_months cap configured on the layout).
  // When all 60 payouts are marked paid, the booking and plot auto-complete.
  async markPayoutPaid(
    db: Pool,
    userId: string,
    bookingId: string,
    monthNumber: number,
    branchId: string | null,
    payload: MarkPayoutPaidInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Verify booking and load info needed for commission distribution
      const params: any[] = [bookingId];
      let bookingWhere = 'bk.id = $1';
      if (branchId) { bookingWhere += ` AND bk.branch_id = $2`; params.push(branchId); }

      const bookingResult = await client.query(
        `SELECT bk.status, bk.referrer_id,
                p.layout_id, p.site_number,
                c.name AS customer_name
         FROM land_bookings bk
         JOIN land_plots  p  ON p.id  = bk.plot_id
         JOIN customers   c  ON c.id  = bk.customer_id
         WHERE ${bookingWhere}`,
        params
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const bk = bookingResult.rows[0];
      if (bk.status !== 'full_paid') {
        throw new ValidationError('Buyback payouts are only available for full_paid bookings');
      }

      // Update the specific payout month
      const payoutResult = await client.query(
        `UPDATE land_buyback_payouts
         SET status = 'paid', paid_date = $1, paid_by = $2,
             paid_channel = $3, paid_proof_key = $4, paid_transaction_id = $5,
             updated_at = now()
         WHERE booking_id = $6 AND month_number = $7 AND status = 'pending'
         RETURNING *`,
        [payload.paidDate, userId, payload.paidChannel || 'cash',
          payload.paidProofKey?.length ? payload.paidProofKey : null,
          // paidTransactionId is TEXT[] — bind array directly; empty array → NULL
          payload.paidTransactionId?.length ? payload.paidTransactionId : null,
          bookingId, monthNumber]
      );
      if (payoutResult.rows.length === 0) {
        throw new NotFoundError('Payout not found or already marked paid');
      }

      // Distribute monthly commission to the referrer chain (if one exists).
      // monthly_months is per-role inside the service — no extra param needed.
      if (bk.referrer_id) {
        await LandIncentivesService.distributeMonthly(client, {
          bookingId:      bookingId,
          referrerId:     bk.referrer_id,
          layoutId:       bk.layout_id,
          monthNumber,
          creditedBy:     userId,
          customerName:   bk.customer_name,
          plotSiteNumber: bk.site_number,
          effectiveDate:  payload.paidDate,
        });
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
