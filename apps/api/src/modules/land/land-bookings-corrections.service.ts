// Land bookings — corrections (MD / Management): correct, void or delete a booking; undo an
// advance, a full payment or a buyback payout. Every method is audited and reverses the
// incentives it invalidates.
// Part of LandBookingsService — composed in ./land-bookings.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { LandIncentivesService } from './land-incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import type { CorrectLandBookingInput } from './land.schema';
import { COOLING_DAYS, addDays, addMonths } from './land-bookings.shared';

export const LandBookingsCorrectionsService = {
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

      // NOTE: advance_amount / advance_date are intentionally NOT editable via
      // correctBooking.  Editing the scalar would desync it from the child-table
      // sum in land_booking_advances.  Advance corrections must go through
      // undoAdvance (which clears all child rows) followed by re-recording.
      // The Land corrections UI already routes advances through undo.

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
      // TS: wrap the UPDATE so a duplicate booking_ref surfaces as a clean ConflictError
      let updated: any;
      try {
        updated = await client.query(
          `UPDATE land_bookings SET ${fields.join(', ')} WHERE id = $${idx} AND branch_id = $${idx + 1} RETURNING *`,
          vals
        );
      } catch (err: any) {
        if (err.code === '23505' && err.constraint === 'land_bookings_branch_id_booking_ref_key') {
          throw new ConflictError(`Booking ID "${payload.bookingRef}" is already used in this branch. Please pick a different number.`);
        }
        throw err;
      }

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

      // Remove all child advance rows first so the scalar reset is consistent.
      // ON DELETE CASCADE on the FK would handle full booking deletion, but here
      // the booking row is being kept — only its advance data is being cleared.
      await client.query(
        `DELETE FROM land_booking_advances WHERE booking_id = $1`,
        [bookingId]
      );

      const updated = await client.query(
        `UPDATE land_bookings
         SET advance_amount = NULL, advance_date = NULL,
             advance_channel = NULL, advance_proof_key = NULL, advance_transaction_id = NULL,
             status = 'booked',
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
};
