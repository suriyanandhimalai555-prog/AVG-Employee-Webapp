// Agila Chit — corrections (MD / Management): correct, void or delete a member; correct or unpay a payment.
// Every method here writes a scheme_corrections_audit row and claws back incentives where needed.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import { SchemeAudit } from '../../shared/scheme-audit';
import type { CorrectChitMemberInput, CorrectChitPaymentInput } from './chit.schema';
import { SCHEME_CODE } from './chit.shared';

export const ChitCorrectionsService = {
  // ─── CORRECT MEMBER (admin: MD / Management, or original branch_admin) ────────
  // Patches editable fields on an existing chit member. When referrerId or
  // amount changes the enrollment incentive is reversed and re-distributed.
  // Branch admins may correct their own members (matched via member.branch_id)
  // even when the group is now owned by the head branch after combine.
  async correctMember(
    db: Pool,
    correctedBy: string,
    groupId: string,
    memberId: string,
    branchId: string,
    payload: CorrectChitMemberInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const beforeRes = await client.query(
        `SELECT m.*, c.name AS customer_name, g.full_amount, g.group_name
         FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = $1 AND m.group_id = $2
           AND (g.branch_id = $3 OR m.branch_id = $3)`,
        [memberId, groupId, branchId]
      );
      if (beforeRes.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = beforeRes.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.notes      !== undefined) { fields.push(`notes = $${idx++}`);       vals.push(payload.notes); }
      // TS: customerId allows admin to re-assign the enrollment to the correct customer
      if (payload.customerId !== undefined) { fields.push(`customer_id = $${idx++}`); vals.push(payload.customerId); }

      // Handle referrerId + denormalised name together
      if (payload.referrerId !== undefined) {
        if (payload.referrerId) {
          const ref = await client.query('SELECT name, role FROM users WHERE id = $1', [payload.referrerId]);
          if (ref.rows.length === 0) throw new NotFoundError('Referrer not found');
          const { name, role } = ref.rows[0];
          fields.push(`referrer_id = $${idx++}`);   vals.push(payload.referrerId);
          fields.push(`referrer_name = $${idx++}`); vals.push(`${name} ${role.toUpperCase().replace(/_/g, ' ')}`);
        } else {
          fields.push(`referrer_id = $${idx++}`);   vals.push(null);
          fields.push(`referrer_name = $${idx++}`); vals.push(null);
        }
      }

      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(memberId, groupId);
      const updated = await client.query(
        `UPDATE agila_chit_members SET ${fields.join(', ')} WHERE id = $${idx} AND group_id = $${idx + 1} RETURNING *`,
        vals
      );

      const referrerChanged = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;

      if (referrerChanged) {
        // Always claw back first — clearing the referrer (null) must also remove
        // the old referrer's credit, so the reversal cannot depend on a new referrer.
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     memberId,
          paymentEvent: 'enrollment',
        });
        if (effectiveReferrer) {
          // TS: effectiveDate = original enrollment date so the corrected credit lands
          // in the same accounting period the old credit was removed from (not today).
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        SCHEME_CODE,
            dealMakerUserId:   effectiveReferrer,
            mode:              'percent_referrer',
            percentRole:       'referrer_direct',
            baseAmount:        parseFloat(old.full_amount),
            paymentEvent:      'enrollment',
            sourceId:          memberId,
            sourceDescription: `Agila Chit enrollment (corrected): ${old.customer_name} – ${old.group_name}`,
            creditedBy:        correctedBy,
            effectiveDate:     old.created_at,
          });
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID MEMBER (admin: MD / Management) ────────────────────────────────────
  async voidMember(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT m.* FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3`,
        [memberId, groupId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Member is already voided');

      await client.query(
        `UPDATE agila_chit_members SET status = 'voided' WHERE id = $1`,
        [memberId]
      );

      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     memberId,
        paymentEvent: 'enrollment',
      });

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── DELETE MEMBER (admin: MD / Management) ──────────────────────────────────
  // Permanently deletes a chit member and all of their payments, claws back ALL
  // incentives, and snapshots the before-state into the audit log. Members who
  // have already won a month are blocked — deleting them would erase the group's
  // winner history (agila_chit_winners holds the month slot); void instead.
  async deleteMember(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT m.* FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3
         FOR UPDATE OF m`,
        [memberId, groupId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = before.rows[0];
      if (old.has_won) {
        throw new ValidationError('Member has already won a month — void the member instead of deleting');
      }

      const payments = await client.query(
        `SELECT * FROM agila_chit_payments WHERE member_id = $1 ORDER BY month_number`,
        [memberId]
      );

      // Claw back all incentives for this member (enrollment + any payment events)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   memberId,
      });

      await client.query(`DELETE FROM agila_chit_payments WHERE member_id = $1`, [memberId]);
      // Defensive: zero rows given the has_won guard, but keeps the FK path clean
      await client.query(`DELETE FROM agila_chit_winners WHERE member_id = $1`, [memberId]);
      await client.query(`DELETE FROM agila_chit_members WHERE id = $1`, [memberId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId,
        action:     'delete',
        oldValues:  { member: old, payments: payments.rows },
      });

      return { deleted: true, id: memberId, payments: payments.rows.length };
    });
  },

  // ─── CORRECT PAYMENT (admin: MD / Management, or original branch_admin) ────────
  // Edits an existing chit payment row (month/amount/date/mode/notes).
  // Branch admins may correct payments for their own members (matched via member.branch_id)
  // even when the group is now owned by the head branch after combine.
  async correctPayment(
    db: Pool,
    correctedBy: string,
    groupId: string,
    memberId: string,
    paymentId: string,
    branchId: string,
    payload: CorrectChitPaymentInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Allow access if the group belongs to the caller's branch (direct owner)
      // OR if the member being corrected belongs to the caller's branch (original branch).
      const groupRow = await client.query(
        `SELECT g.* FROM agila_chit_groups g
         WHERE g.id = $1
           AND (g.branch_id = $2 OR EXISTS (
             SELECT 1 FROM agila_chit_members mm
             WHERE mm.id = $3 AND mm.group_id = g.id AND mm.branch_id = $2
           ))`,
        [groupId, branchId, memberId]
      );
      if (groupRow.rows.length === 0) throw new NotFoundError('Chit group not found');

      const payRow = await client.query(
        `SELECT * FROM agila_chit_payments WHERE id = $1 AND member_id = $2 AND group_id = $3`,
        [paymentId, memberId, groupId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.monthNumber  != null)  { fields.push(`month_number = $${idx++}`);  vals.push(payload.monthNumber); }
      if (payload.amount       != null)  { fields.push(`amount = $${idx++}`);         vals.push(payload.amount); }
      if (payload.paymentDate  != null)  { fields.push(`payment_date = $${idx++}`);   vals.push(payload.paymentDate); }
      if (payload.paymentMode  != null)  { fields.push(`payment_mode = $${idx++}`);   vals.push(payload.paymentMode); }
      if (payload.proofKey     != null)  { fields.push(`proof_key = $${idx++}`);      vals.push(payload.proofKey); }
      // transactionId is TEXT[] — bind array directly; empty array or null → explicit NULL
      if (payload.transactionId !== undefined) { fields.push(`transaction_id = $${idx++}`); vals.push(payload.transactionId?.length ? payload.transactionId : null); }
      // cash_bank / cash_gpay split columns: set when correcting to a split mode,
      // clear all three when switching to any other mode.
      if (payload.paymentMode === 'cash_bank') {
        if (payload.cashAmount != null) { fields.push(`cash_amount = $${idx++}`); vals.push(payload.cashAmount); }
        if (payload.bankAmount != null) { fields.push(`bank_amount = $${idx++}`); vals.push(payload.bankAmount); }
        fields.push(`gpay_amount = NULL`);
      } else if (payload.paymentMode === 'cash_gpay') {
        if (payload.cashAmount != null) { fields.push(`cash_amount = $${idx++}`); vals.push(payload.cashAmount); }
        if (payload.gpayAmount != null) { fields.push(`gpay_amount = $${idx++}`); vals.push(payload.gpayAmount); }
        fields.push(`bank_amount = NULL`);
      } else if (payload.paymentMode != null) {
        fields.push(`cash_amount = NULL`);
        fields.push(`bank_amount = NULL`);
        fields.push(`gpay_amount = NULL`);
      }
      if (payload.notes !== undefined)   { fields.push(`notes = $${idx++}`);          vals.push(payload.notes); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(paymentId, memberId, groupId);
      const updated = await client.query(
        `UPDATE agila_chit_payments SET ${fields.join(', ')}
         WHERE id = $${idx} AND member_id = $${idx + 1} AND group_id = $${idx + 2} RETURNING *`,
        vals
      );

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payment',
        entityId:   paymentId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── UNPAY PAYMENT (admin: MD / Management) ──────────────────────────────────
  // Deletes a single chit payment. Chit payments currently carry no incentive
  // (only the initial enrollment does), so no incentive reversal is needed.
  async unpayPayment(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    paymentId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const groupRow = await client.query(
        `SELECT * FROM agila_chit_groups WHERE id = $1 AND branch_id = $2`,
        [groupId, branchId]
      );
      if (groupRow.rows.length === 0) throw new NotFoundError('Chit group not found');

      const payRow = await client.query(
        `SELECT * FROM agila_chit_payments WHERE id = $1 AND member_id = $2 AND group_id = $3`,
        [paymentId, memberId, groupId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      await client.query('DELETE FROM agila_chit_payments WHERE id = $1', [paymentId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payment',
        entityId:   paymentId,
        actorId,
        action:     'unpay',
        oldValues:  old,
      });

      return old;
    });
  },
};
