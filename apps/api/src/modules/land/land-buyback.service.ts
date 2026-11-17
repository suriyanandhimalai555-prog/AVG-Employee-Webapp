// Land bookings — buyback schedule: read the 60 monthly payouts and mark one paid
// (credits the monthly commission; the booking completes when all 60 are paid).
// Part of LandBookingsService — composed in ./land-bookings.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { LandAuditService } from './land-audit.service';
import { LandIncentivesService } from './land-incentives.service';
import type { MarkPayoutPaidInput } from './land.schema';

export const LandBuybackService = {
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
};
