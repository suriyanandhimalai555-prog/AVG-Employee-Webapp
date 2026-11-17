// Agila Chit — monthly instalments: record a payment and read a member's payment history.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool } from 'pg';
import { ConflictError, NotFoundError } from '../../shared/errors';
import type { RecordChitPaymentInput } from './chit.schema';

export const ChitPaymentsService = {
  // ─── RECORD MONTHLY PAYMENT ────────────────────────────────────────────────
  async recordPayment(
    db: Pool,
    enteredBy: string,
    groupId: string,
    memberId: string,
    branchId: string,
    payload: RecordChitPaymentInput
  ): Promise<any> {
    // Allow payment recording for all non-terminal statuses.
    // The OR m.branch_id = $3 path allows the original branch admin to record
    // monthly payments for their members in a combined group (where g.branch_id
    // is the head branch, not the original branch). The member's own branch_id
    // stays as the original even after the group is combined.
    const memberResult = await db.query(
      `SELECT m.*, g.full_amount, g.half_amount
       FROM agila_chit_members m
       JOIN agila_chit_groups g ON g.id = m.group_id
       WHERE m.id = $1 AND m.group_id = $2
         AND (g.branch_id = $3 OR m.branch_id = $3)
         AND g.status NOT IN ('combined_into','expired')`,
      [memberId, groupId, branchId]
    );
    if (memberResult.rows.length === 0) throw new NotFoundError('Member not found');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO agila_chit_payments
           (group_id, member_id, month_number, amount, payment_date, payment_mode, proof_key, transaction_id, cash_amount, bank_amount, gpay_amount, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         RETURNING *`,
        [groupId, memberId, payload.monthNumber, payload.amount,
         payload.paymentDate, payload.paymentMode,
         payload.proofKey?.length ? payload.proofKey : null,
         // transactionId is TEXT[] — bind array directly; empty array → NULL
         payload.transactionId?.length ? payload.transactionId : null,
         // cash_bank/cash_gpay share the cash portion column
         (payload.paymentMode === 'cash_bank' || payload.paymentMode === 'cash_gpay') ? payload.cashAmount : null,
         payload.paymentMode === 'cash_bank' ? payload.bankAmount : null,
         // cash_gpay split: gpay portion — null unless mode is cash_gpay
         payload.paymentMode === 'cash_gpay' ? payload.gpayAmount : null,
         payload.notes || null, enteredBy]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new ConflictError(`Month ${payload.monthNumber} payment already recorded for this member`);
      }
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── GET PAYMENT HISTORY FOR A MEMBER ─────────────────────────────────────
  async getMemberPayments(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any[]> {
    const check = await db.query(
      `SELECT m.id FROM agila_chit_members m
       JOIN agila_chit_groups g ON g.id = m.group_id
       WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3`,
      [memberId, groupId, branchId]
    );
    if (check.rows.length === 0) throw new NotFoundError('Member not found');

    const result = await db.query(
      `SELECT p.*, u.name AS entered_by_name
       FROM agila_chit_payments p
       JOIN users u ON u.id = p.entered_by
       WHERE p.member_id = $1
       ORDER BY p.month_number ASC`,
      [memberId]
    );
    return result.rows;
  },
};
