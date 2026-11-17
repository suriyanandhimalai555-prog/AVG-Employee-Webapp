// Agila Chit — member cards: add a member, cancel / reinstate a card, mark a refund paid.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import type { AddChitMemberInput, CancelMemberInput } from './chit.schema';
import { SCHEME_CODE, MAX_MEMBERS } from './chit.shared';

export const ChitMembersService = {
  // ─── ADD MEMBER ────────────────────────────────────────────────────────────
  // One-step enrollment: inserts the member, auto-records the Month-1 full
  // payment, and (if referrerId given) credits 20% to the referrer.
  // When the 20th member is added, the group auto-transitions forming → active.
  async addMember(
    db: Pool,
    enteredBy: string,
    groupId: string,
    branchId: string,
    payload: AddChitMemberInput,
    // When provided, run inside the caller's transaction (pending-enrollment completion).
    existingClient?: PoolClient
  ): Promise<any> {
    const ownTx = !existingClient;
    const client = existingClient ?? await db.connect();
    try {
      if (ownTx) await client.query('BEGIN');

      // Verify customer and referrer (on the tx client)
      const custResult = await client.query(
        'SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2',
        [payload.customerId, branchId]
      );
      if (custResult.rows.length === 0) throw new NotFoundError('Customer not found in this branch');

      let referrerName: string | null = null;
      if (payload.referrerId) {
        const refResult = await client.query(
          'SELECT name, role FROM users WHERE id = $1',
          [payload.referrerId]
        );
        if (refResult.rows.length === 0) throw new NotFoundError('Referrer not found');
        const { name, role } = refResult.rows[0];
        referrerName = `${name} ${role.toUpperCase().replace(/_/g, ' ')}`;
      }

      // Lock the group row first — serialises concurrent addMember calls so the
      // 19-member cap and the forming→active transition are race-free.
      const groupResult = await client.query(
        `SELECT id, full_amount, start_date, group_name, status
         FROM agila_chit_groups
         WHERE id = $1 AND branch_id = $2 AND status IN ('forming','active')
         FOR UPDATE`,
        [groupId, branchId]
      );
      if (groupResult.rows.length === 0) {
        throw new NotFoundError('Group not found, already completed, or sent to head branch');
      }
      const group = groupResult.rows[0];

      // Count and cap — safe under the FOR UPDATE lock
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM agila_chit_members WHERE group_id = $1',
        [groupId]
      );
      if (countResult.rows[0].cnt >= MAX_MEMBERS) {
        throw new ValidationError(`Group already has ${MAX_MEMBERS} members`);
      }

      // Compute this customer's next card number in the group.
      // The group row is already locked FOR UPDATE above, so this count is
      // race-safe — no two concurrent inserts can produce the same card_number.
      const cardNumResult = await client.query(
        'SELECT COUNT(*)::int AS n FROM agila_chit_members WHERE group_id = $1 AND customer_id = $2',
        [groupId, payload.customerId]
      );
      // TS: card_number = 1 for first card, 2 for second, etc.
      const cardNumber = (cardNumResult.rows[0].n as number) + 1;

      const fullAmount   = parseFloat(group.full_amount);
      const paymentDate  = payload.firstPaymentDate || group.start_date;
      const customerName = custResult.rows[0].name;

      // Insert member — card_number tracks which card this is for customers
      // who hold multiple positions in the same group (e.g. Card 1, Card 2).
      // branch_id records the original branch so ownership is preserved after combine.
      const memberResult = await client.query(
        `INSERT INTO agila_chit_members
           (group_id, customer_id, referrer_id, referrer_name, entered_by, card_number, branch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [groupId, payload.customerId, payload.referrerId || null, referrerName, enteredBy, cardNumber, branchId]
      );
      const member = memberResult.rows[0];

      // cash_bank split must sum to the month-1 full amount (validated here since the
      // amount is derived from the group package, not the request payload)
      if (payload.firstPaymentMode === 'cash_bank' &&
          Math.abs((payload.firstPaymentCashAmount ?? 0) + (payload.firstPaymentBankAmount ?? 0) - fullAmount) > 0.01) {
        throw new ValidationError('firstPaymentCashAmount + firstPaymentBankAmount must equal the monthly amount');
      }
      // cash_gpay split — same server-side sum check (amount comes from package)
      if (payload.firstPaymentMode === 'cash_gpay' &&
          Math.abs((payload.firstPaymentCashAmount ?? 0) + (payload.firstPaymentGpayAmount ?? 0) - fullAmount) > 0.01) {
        throw new ValidationError('firstPaymentCashAmount + firstPaymentGpayAmount must equal the monthly amount');
      }

      // Auto-record Month-1 full payment
      await client.query(
        `INSERT INTO agila_chit_payments
           (group_id, member_id, month_number, amount, payment_date, payment_mode, proof_key, transaction_id, cash_amount, bank_amount, gpay_amount, entered_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [groupId, member.id, fullAmount, paymentDate, payload.firstPaymentMode, payload.firstPaymentProofKey?.length ? payload.firstPaymentProofKey : null, payload.firstPaymentTransactionId?.length ? payload.firstPaymentTransactionId : null,
          // cash_bank/cash_gpay share the cash portion column
          (payload.firstPaymentMode === 'cash_bank' || payload.firstPaymentMode === 'cash_gpay') ? payload.firstPaymentCashAmount : null,
          payload.firstPaymentMode === 'cash_bank' ? payload.firstPaymentBankAmount : null,
          // cash_gpay split: gpay portion — null unless mode is cash_gpay
          payload.firstPaymentMode === 'cash_gpay' ? payload.firstPaymentGpayAmount : null,
          enteredBy]
      );

      // Credit referrer 20% of Month-1 full amount
      let commissionAmount = 0;
      if (payload.referrerId) {
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        SCHEME_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_direct',
          baseAmount:        fullAmount,
          paymentEvent:      'enrollment',
          sourceId:          member.id,
          sourceDescription: `Agila Chit enrollment: ${customerName} – ${group.group_name}`,
          creditedBy:        enteredBy,
          // Backdated entry: the incentive sits in the month-1 payment date's wallet period
          effectiveDate:     paymentDate,
        });
        commissionAmount = credited.reduce((sum: number, row: any) => sum + parseFloat(row.amount), 0);
      }

      // Auto-transition forming → active when 20th member is added
      const afterCount = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM agila_chit_members WHERE group_id = $1',
        [groupId]
      );
      const newCount = afterCount.rows[0].cnt;
      let groupStatus = 'forming';
      if (newCount === MAX_MEMBERS) {
        await client.query(
          `UPDATE agila_chit_groups
           SET status = 'active', activated_at = NOW(), activated_by = $2
           WHERE id = $1 AND status = 'forming'`,
          [groupId, enteredBy]
        );
        groupStatus = 'active';
      }

      if (ownTx) await client.query('COMMIT');

      return { member, customer: custResult.rows[0], commissionAmount, memberCount: newCount, groupStatus };
    } catch (err: any) {
      if (ownTx) await client.query('ROLLBACK');
      throw err;
    } finally {
      if (ownTx) client.release();
    }
  },

  // ─── CANCEL MEMBER CARD ────────────────────────────────────────────────────
  async cancelMember(db: Pool, groupId: string, memberId: string, branchId: string, payload: CancelMemberInput): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const groupCheck = await client.query(
        'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
        [groupId, branchId]
      );
      if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

      const result = await client.query(
        `UPDATE agila_chit_members
         SET status = 'cancelled', cancellation_due_month_1 = $1, cancellation_due_month_2 = $2
         WHERE id = $3 AND group_id = $4 AND status = 'active'
         RETURNING *`,
        [payload.cancelDueMonth1, payload.cancelDueMonth2 || null, memberId, groupId]
      );
      if (result.rows.length === 0) throw new NotFoundError('Member not found or already cancelled');

      // Reverse the enrollment incentive that was credited when this member joined.
      // Previously this was skipped, leaving orphan incentive rows in the ledger.
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     memberId,
        paymentEvent: 'enrollment',
      });

      return result.rows[0];
    });
  },

  // ─── REINSTATE MEMBER CARD ─────────────────────────────────────────────────
  async reinstateMember(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any> {
    const groupCheck = await db.query(
      'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
      [groupId, branchId]
    );
    if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

    const memberResult = await db.query(
      `SELECT * FROM agila_chit_members WHERE id = $1 AND group_id = $2`,
      [memberId, groupId]
    );
    if (memberResult.rows.length === 0) throw new NotFoundError('Member not found');
    const member = memberResult.rows[0];

    if (member.status !== 'cancelled') throw new ValidationError('Member card is not cancelled');
    if (!member.cancellation_due_month_1) throw new ValidationError('No cancellation months recorded');

    const pay1 = await db.query(
      'SELECT id FROM agila_chit_payments WHERE member_id = $1 AND month_number = $2',
      [memberId, member.cancellation_due_month_1]
    );
    if (pay1.rows.length === 0) {
      throw new ValidationError(`Month ${member.cancellation_due_month_1} payment must be recorded before reinstatement`);
    }

    if (member.cancellation_due_month_2) {
      const pay2 = await db.query(
        'SELECT id FROM agila_chit_payments WHERE member_id = $1 AND month_number = $2',
        [memberId, member.cancellation_due_month_2]
      );
      if (pay2.rows.length === 0) {
        throw new ValidationError(`Month ${member.cancellation_due_month_2} payment must also be recorded before reinstatement`);
      }
    }

    const result = await db.query(
      `UPDATE agila_chit_members
       SET status = 'active', cancellation_due_month_1 = NULL, cancellation_due_month_2 = NULL
       WHERE id = $1 RETURNING *`,
      [memberId]
    );
    return result.rows[0];
  },

  // ─── MARK REFUND PAID ──────────────────────────────────────────────────────
  async markRefundPaid(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any> {
    // The OR EXISTS path allows the original branch admin to mark their own member's
    // refund as credited, even when the group is now owned by the head branch.
    const groupResult = await db.query(
      `SELECT g.status FROM agila_chit_groups g
       WHERE g.id = $1
         AND (g.branch_id = $2 OR EXISTS (
           SELECT 1 FROM agila_chit_members mm
           WHERE mm.id = $3 AND mm.group_id = g.id AND mm.branch_id = $2
         ))`,
      [groupId, branchId, memberId]
    );
    if (groupResult.rows.length === 0) throw new NotFoundError('Group not found');
    if (!['completed','expired'].includes(groupResult.rows[0].status)) {
      throw new ValidationError('Refunds can only be credited after the group completes or expires');
    }

    const result = await db.query(
      `UPDATE agila_chit_members
       SET refund_credited_at = NOW()
       WHERE id = $1 AND group_id = $2 AND status = 'cancelled' AND refund_credited_at IS NULL
       RETURNING *`,
      [memberId, groupId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Member not found, not cancelled, or refund already credited');
    return result.rows[0];
  },
};
