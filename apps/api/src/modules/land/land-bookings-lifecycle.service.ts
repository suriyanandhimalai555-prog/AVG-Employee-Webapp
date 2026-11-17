// Land bookings — lifecycle writes (branch admin / Management): create a booking, record the
// advance and the full payment, extend the advance deadline, cancel.
// booked → advance_paid → full_paid; the spot commission is credited on create.
// Part of LandBookingsService — composed in ./land-bookings.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { LandAuditService } from './land-audit.service';
import { LandIncentivesService } from './land-incentives.service';
import type { CreateLandBookingInput, RecordAdvanceInput, RecordFullPaymentInput, CancelBookingInput } from './land.schema';
import { COOLING_DAYS, BUYBACK_MONTHS, ADVANCE_DAYS, addDays, addMonths } from './land-bookings.shared';

export const LandBookingsLifecycleService = {
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
          // Disambiguate the two unique constraints that can fire on booking insert
          if (err.constraint === 'land_bookings_branch_id_booking_ref_key') {
            throw new ConflictError(`Booking ID "${payload.bookingRef.trim()}" is already used in this branch. Please pick a different number.`);
          }
          if (err.constraint === 'idx_land_bookings_plot_active') {
            throw new ConflictError('This plot already has an active booking.');
          }
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

        // Snapshot the earner chain at enrollment so that distributeMonthly pays each
        // earner at their CURRENT role/tier, even if they are later promoted or transferred.
        // This mirrors the existing referrer_name denormalization ("so the record survives
        // referrer deactivation") but for the full chain and their tier at enrollment.
        const earnerChain = await LandIncentivesService._walkChain(client, payload.referrerId);
        if (earnerChain.length > 0) {
          const earnerValues = earnerChain
            .map((_: any, i: number) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
            .join(', ');
          const earnerParams = earnerChain.flatMap((e: { id: string; role: string }) => [
            booking.id,
            e.id,
            e.role,
          ]);
          await client.query(
            `INSERT INTO land_booking_earners (booking_id, user_id, role)
             VALUES ${earnerValues}
             ON CONFLICT (booking_id, user_id) DO NOTHING`,
            earnerParams
          );
        }
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
  // Wrapped in runInTransaction so all writes (child row, booking UPDATE, audit)
  // are either all committed or all rolled back.
  //
  // Multiple partial advances are supported: each call inserts one row into
  // land_booking_advances and accumulates land_bookings.advance_amount as a
  // running total.  The booking stays at 'advance_paid' after the first advance;
  // subsequent advances update the scalar to the new cumulative total.
  async recordAdvance(
    db: Pool,
    userId: string,
    bookingId: string,
    branchId: string | null,
    payload: RecordAdvanceInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Lock the booking row so concurrent advances are serialised.
      const params: any[] = [bookingId];
      let findWhere = 'bk.id = $1';
      if (branchId) { findWhere += ` AND bk.branch_id = $2`; params.push(branchId); }

      // TS: join land_plots + land_layouts so we have land_cost (balance check)
      // and buyback_bonus_monthly / buyback_months (auto-completion path) all in
      // one locked query — avoids extra round-trips and keeps the check consistent.
      const existing = await client.query(
        `SELECT bk.*, p.land_cost, ll.buyback_bonus_monthly, ll.buyback_months
         FROM land_bookings bk
         JOIN land_plots   p  ON p.id  = bk.plot_id
         JOIN land_layouts ll ON ll.id = p.layout_id
         WHERE ${findWhere}
         FOR UPDATE OF bk`,
        params
      );
      if (existing.rows.length === 0) throw new NotFoundError('Booking not found');
      const booking = existing.rows[0];

      if (booking.payment_mode !== 'advance_full_payment') {
        throw new ValidationError('This booking uses full_payment mode; no advance applies');
      }
      // Allow advances while status is 'booked' (first advance) OR 'advance_paid'
      // (additional partial advances).  Any other status means full payment or
      // cancellation has already been recorded.
      if (!['booked', 'advance_paid'].includes(booking.status)) {
        throw new ValidationError(`Cannot record an advance when booking status is "${booking.status}"`);
      }

      // TS: pg returns NUMERIC columns as strings — parse before arithmetic.
      const landCost     = parseFloat(booking.land_cost);
      const prevTotal    = booking.advance_amount != null ? parseFloat(booking.advance_amount) : 0;
      const newTotal     = Math.round((prevTotal + payload.advanceAmount) * 100) / 100;

      if (newTotal > landCost) {
        const balance = Math.round((landCost - prevTotal) * 100) / 100;
        throw new ValidationError(
          `Advance of ₹${payload.advanceAmount.toFixed(2)} would exceed the remaining balance of ₹${balance.toFixed(2)}`
        );
      }

      // Insert the individual advance row into the child table.
      await client.query(
        `INSERT INTO land_booking_advances
           (booking_id, amount, advance_date, channel, proof_key, transaction_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          bookingId,
          payload.advanceAmount,
          payload.advanceDate,
          payload.advanceChannel || 'cash',
          // TS: bind TEXT[] directly; empty/absent → NULL
          payload.advanceProofKey?.length ? payload.advanceProofKey : null,
          payload.advanceTransactionId?.length ? payload.advanceTransactionId : null,
          userId,
        ]
      );

      // When advances fully cover the plot price the booking auto-completes to
      // 'full_paid' and the buyback schedule is created in the same transaction —
      // no separate "Record Full Payment" step is required from the branch admin.
      // A ±0.005 tolerance absorbs floating-point rounding at two decimal places.
      const fullyPaid = newTotal >= landCost - 0.005;

      let result: any;
      if (fullyPaid) {
        const buybackStartDate = addDays(payload.advanceDate, COOLING_DAYS);
        result = await client.query(
          `UPDATE land_bookings
           SET advance_amount = $1, advance_date = $2, status = 'full_paid',
               advance_channel = $3, advance_proof_key = $4, advance_transaction_id = $5,
               full_amount = NULL, full_payment_date = $6, buyback_start_date = $7,
               updated_by = $8, updated_at = now()
           WHERE id = $9
           RETURNING *`,
          [
            newTotal,
            payload.advanceDate,
            payload.advanceChannel || 'cash',
            payload.advanceProofKey?.length ? payload.advanceProofKey : null,
            payload.advanceTransactionId?.length ? payload.advanceTransactionId : null,
            payload.advanceDate,
            buybackStartDate,
            userId,
            bookingId,
          ]
        );

        // TS: pg returns NUMERIC as strings — parse before comparison.
        const bonusAmount: number  = parseFloat(booking.buyback_bonus_monthly) || 0;
        const buybackCount: number = booking.buyback_months ?? BUYBACK_MONTHS;
        if (bonusAmount > 0 && buybackCount > 0) {
          for (let month = 1; month <= buybackCount; month++) {
            const dueDate = addMonths(buybackStartDate, month - 1);
            await client.query(
              `INSERT INTO land_buyback_payouts (booking_id, month_number, amount, due_date)
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
            advance_amount:      newTotal,
            full_payment_date:   payload.advanceDate,
            buyback_start_date:  buybackStartDate,
            status:              'full_paid',
            auto_completed:      true,
          },
        });
      } else {
        // Partial advance — update the running total and stay at advance_paid.
        // advance_date / channel / proof / txn = this (most-recent) payment so
        // existing list/report queries still display something meaningful.
        result = await client.query(
          `UPDATE land_bookings
           SET advance_amount = $1, advance_date = $2, status = 'advance_paid',
               advance_channel = $3, advance_proof_key = $4, advance_transaction_id = $5,
               updated_by = $6, updated_at = now()
           WHERE id = $7
           RETURNING *`,
          [
            newTotal,
            payload.advanceDate,
            payload.advanceChannel || 'cash',
            payload.advanceProofKey?.length ? payload.advanceProofKey : null,
            // TS: advanceTransactionId is TEXT[] — bind array directly; empty → NULL
            payload.advanceTransactionId?.length ? payload.advanceTransactionId : null,
            userId,
            bookingId,
          ]
        );

        // TS: audit row shares the transaction — failure rolls back the booking update.
        await LandAuditService.log(client, {
          entity:    'booking',
          recordId:  bookingId,
          action:    'advance_payment',
          changedBy: userId,
          newValues: {
            advance_amount:      newTotal,
            advance_date:        payload.advanceDate,
            status:              'advance_paid',
            advance_installment: payload.advanceAmount,
          },
        });
      }

      return result.rows[0];
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
      // Also join land_plots directly to read land_cost for balance validation.
      const bookingResult = await client.query(
        `SELECT bk.*, ll.buyback_bonus_monthly, ll.buyback_months, p.land_cost
         FROM land_bookings bk
         JOIN land_plots   p  ON p.id  = bk.plot_id
         JOIN land_layouts ll ON ll.id = p.layout_id
         WHERE ${findWhere}
         FOR UPDATE OF bk`,
        params
      );
      if (bookingResult.rows.length === 0) throw new NotFoundError('Booking not found');
      const booking = bookingResult.rows[0];

      if (!['booked', 'advance_paid'].includes(booking.status)) {
        throw new ValidationError(`Full payment cannot be recorded when status is "${booking.status}"`);
      }

      // Guard: full amount must not exceed the remaining balance (land_cost −
      // advances already paid).  Underpay (discount) is allowed.
      // TS: pg returns NUMERIC as strings — parse before comparison.
      const landCost       = parseFloat(booking.land_cost);
      const advancePaid    = booking.advance_amount != null ? parseFloat(booking.advance_amount) : 0;
      const balanceRemaining = Math.round((landCost - advancePaid) * 100) / 100;
      if (payload.fullAmount > balanceRemaining + 0.005) {
        throw new ValidationError(
          `Full payment of ₹${payload.fullAmount.toFixed(2)} exceeds the remaining balance of ₹${balanceRemaining.toFixed(2)}`
        );
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

      // A cancelled sale did not happen — claw back any spot commission credited
      // at booking time, exactly as voidBooking/deleteBooking do.
      // reverseIncentives is a hard DELETE keyed on source_id, so reversing ALL
      // rows for this booking is correct regardless of which events exist, and it
      // is idempotent if the booking is later voided/deleted (second call = 0 rows).
      if (booking.referrer_id) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode: 'land_scheme',
          sourceId:   bookingId,
        });
      }

      await LandAuditService.log(client, {
        entity:    'booking',
        recordId:  bookingId,
        action:    'cancel',
        changedBy: userId,
        // referrer_id included so the incentive reversal is traceable in the audit
        oldValues: { status: booking.status, referrer_id: booking.referrer_id },
        newValues: { status: 'cancelled', cancellation_reason: payload.reason },
      });

      return cancelResult.rows[0];
    });
  },
};
