// Slots — customer purchases. One entry point: createSlot.
//
// quantity=20 → FULL room (one owner): always opens a fresh dedicated room.
// quantity<20 → partial: fill the current filling room first; if the purchase
//               exceeds its remaining capacity, the overflow goes into a new room.
//
// All slots in one createSlot call share a single batch_id UUID — the stable
// cross-room purchase identity used by correctSlot to reverse and re-credit
// incentives. batch_id replaces the old (room_id, customer_id, created_at)
// heuristic, which collapsed when two backdated purchases by the same customer
// shared a sale date.
//
// Referral commission is ONE row on the TOTAL paid, anchored on slots[0].id,
// credited after all inserts complete.

import { randomUUID } from 'crypto';
import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import { RoomsService, LSS_SLOTS_PER_ROOM } from './rooms.service';
import type { CreateSlotInput, CorrectLssSlotInput } from './lss.schema';
const SCHEME_CODE = 'lss_scheme';

export const SlotsService = {

  async createSlot(
    db: Pool,
    branchId: string,
    enteredBy: string,
    payload: CreateSlotInput,
    // When provided, run inside the caller's transaction (pending-enrollment completion).
    existingClient?: PoolClient,
  ): Promise<{ slots: any[]; room: any; commissionAmount: number; totalAmountPaid: number }> {
    const quantity = payload.quantity ?? 1;
    const run = async (client: PoolClient) => {
      // 1. Customer must exist and belong to this branch
      const custRes = await client.query(
        `SELECT id, name, customer_code FROM customers WHERE id = $1 AND branch_id = $2`,
        [payload.customerId, branchId]
      );
      if (custRes.rows.length === 0) {
        throw new NotFoundError('Customer not found in this branch', 'LSS_CUSTOMER_NOT_FOUND');
      }
      const customer = custRes.rows[0];

      // 2. Plan must exist and be active; amount must match the plan price
      const planRes = await client.query(
        `SELECT id, name, price FROM lss_plans WHERE id = $1 AND is_active = true`,
        [payload.planId]
      );
      if (planRes.rows.length === 0) {
        throw new NotFoundError('Plan not found or inactive', 'LSS_PLAN_NOT_FOUND');
      }
      const plan  = planRes.rows[0];
      const price = parseFloat(plan.price);
      if (Math.abs(price - payload.amountPaid) > 0.01) {
        throw new ValidationError(
          `Amount paid per slot (${payload.amountPaid}) does not match plan price (${price})`,
          'LSS_AMOUNT_MISMATCH'
        );
      }

      // 3. Optional referrer must exist and be active
      if (payload.referrerId) {
        const refRes = await client.query(
          `SELECT id FROM users WHERE id = $1 AND is_active = true`,
          [payload.referrerId]
        );
        if (refRes.rows.length === 0) {
          throw new NotFoundError('Referrer not found or inactive', 'LSS_REFERRER_NOT_FOUND');
        }
      }

      // 4. Compute the allocation plan across rooms.
      //    Full-room → fresh dedicated room (no mixing with existing buyers).
      //    Partial → fill current filling room first; overflow remainder into a
      //    new room. allocateRoomsForPurchase holds FOR UPDATE internally so
      //    concurrent purchases cannot overshoot the 20-slot cap.
      const allocations = await RoomsService.allocateRoomsForPurchase(
        client, payload.planId, branchId, enteredBy, quantity
      );

      // 5. Generate ONE batch_id shared by every slot in this purchase.
      //    This is the durable cross-room purchase identity. batch_id is stable
      //    across combineRooms (which reassigns room_id/slot_number) and avoids
      //    the backdating collision of the old (room_id, customer_id, created_at)
      //    heuristic.
      const batchId = randomUUID();

      // 6. Insert slots across all allocated rooms.
      //    Allocations are ordered: current room first, overflow room second.
      //    slots[0] is therefore the creation-order anchor used by incentive logic.
      const slots: any[] = [];
      for (const alloc of allocations) {
        for (let i = 0; i < alloc.count; i++) {
          const slotNumber = alloc.firstSlotNumber + i;
          // Backdated entry: saleDate overrides created_at so branch summaries
          // (which filter slots by created_at) count the sale in its real period.
          const slotRes = await client.query(
            `INSERT INTO lss_slots
               (room_id, slot_number, customer_id, branch_id, amount_paid,
                payment_mode, proof_key, transaction_id, cash_amount, bank_amount, gpay_amount,
                referrer_id, notes, entered_by, created_at, batch_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                     COALESCE($15::timestamptz, now()), $16)
             RETURNING *`,
            [
              alloc.room.id,
              slotNumber,
              payload.customerId,
              branchId,
              payload.amountPaid,
              payload.paymentMode,
              payload.proofKey?.length ? payload.proofKey : null,
              // transactionId is TEXT[] — bind array directly; empty array → NULL
              payload.transactionId?.length ? payload.transactionId : null,
              // cash_bank/cash_gpay share the cash portion column; per-slot split
              (payload.paymentMode === 'cash_bank' || payload.paymentMode === 'cash_gpay') ? payload.cashAmount : null,
              payload.paymentMode === 'cash_bank' ? payload.bankAmount : null,
              // cash_gpay split: gpay portion — null unless mode is cash_gpay
              payload.paymentMode === 'cash_gpay' ? payload.gpayAmount : null,
              payload.referrerId ?? null,
              payload.notes ?? null,
              enteredBy,
              payload.saleDate ?? null,
              batchId,
            ]
          );
          slots.push(slotRes.rows[0]);
        }
      }

      const totalAmountPaid = quantity * payload.amountPaid;

      // 7. Referral payout — ONE row on the TOTAL paid, anchored on slots[0].id.
      //    Called once after ALL inserts so the commission covers the full batch
      //    even when the purchase spans two rooms.
      let commissionAmount = 0;
      if (payload.referrerId) {
        // TS: slotRangeLabel describes the purchase for the incentive description
        const slotRangeLabel = quantity === 1
          ? `slot ${slots[0].slot_number}/${LSS_SLOTS_PER_ROOM}`
          : quantity === LSS_SLOTS_PER_ROOM
            ? `FULL room`
            : `${quantity} slots (${allocations.length} room${allocations.length > 1 ? 's' : ''})`;
        const sourceDescription =
          `LSS ${slotRangeLabel} — ${customer.name} (${customer.customer_code}) — ${plan.name}`;
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        SCHEME_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_direct',
          baseAmount:        totalAmountPaid,
          paymentEvent:      'enrollment',
          sourceId:          slots[0].id,  // TS: anchor = first slot of this batch
          sourceDescription,
          creditedBy:        enteredBy,
          // Backdated entry: the incentive sits in the sale date's wallet period
          effectiveDate:     payload.saleDate,
        });
        commissionAmount = credited.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      }

      // TS: room is the primary room (first allocation) for back-compat; consumers
      // that need the true room for each slot should read slot.room_id instead.
      return { slots, room: allocations[0].room, commissionAmount, totalAmountPaid };
    };
    return existingClient ? await run(existingClient) : await runInTransaction(db, run);
  },

  async refundSlot(db: Pool, slotId: string, callerBranchId: string): Promise<void> {
    await runInTransaction(db, async (client) => {
      const res = await client.query<{ status: string; room_id: string; branch_id: string; batch_id: string }>(
        `SELECT status, room_id, branch_id, batch_id FROM lss_slots WHERE id = $1 FOR UPDATE`,
        [slotId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Slot not found', 'LSS_SLOT_NOT_FOUND');
      }
      const { status, branch_id, batch_id } = res.rows[0];
      if (branch_id !== callerBranchId) {
        throw new ForbiddenError('Slot belongs to a different branch', 'LSS_SLOT_WRONG_BRANCH');
      }
      if (status !== 'held') {
        throw new ConflictError(`Cannot refund a slot in status '${status}'`, 'LSS_SLOT_NOT_REFUNDABLE');
      }
      await client.query(
        `UPDATE lss_slots SET status = 'refunded' WHERE id = $1`,
        [slotId]
      );
      // Commission was credited on slots[0] of the batch (the anchor), not necessarily
      // this slot. Find the anchor so the reversal locates the actual incentive row.
      const anchorRes = await client.query<{ id: string }>(
        `SELECT s.id FROM lss_slots s
         JOIN lss_rooms r ON r.id = s.room_id
         WHERE s.batch_id = $1
         ORDER BY r.created_at ASC, s.slot_number ASC
         LIMIT 1`,
        [batch_id]
      );
      const anchorSlotId = anchorRes.rows[0]?.id ?? slotId;
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     anchorSlotId,
        paymentEvent: 'enrollment',
      });
    });
  },

  // ─── CORRECT SLOT (admin: MD / Management) ───────────────────────────────────
  async correctSlot(
    db: Pool,
    correctedBy: string,
    slotId: string,
    branchId: string,
    payload: CorrectLssSlotInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const beforeRes = await client.query(
        `SELECT s.*, c.name AS customer_name, c.customer_code, p.name AS plan_name,
                lr.status AS room_status,
                -- TS: total_amount counts by batch_id so overflow slots in a second room
                -- are included; the old (room_id, customer_id) count was room-scoped
                s.amount_paid * (SELECT COUNT(*) FROM lss_slots WHERE batch_id = s.batch_id) AS total_amount
         FROM lss_slots s
         JOIN customers c ON c.id = s.customer_id
         JOIN lss_rooms lr ON lr.id = s.room_id
         JOIN lss_plans p ON p.id = lr.plan_id
         WHERE s.id = $1 AND s.branch_id = $2`,
        [slotId, branchId]
      );
      if (beforeRes.rows.length === 0) throw new NotFoundError('LSS slot not found');
      const old = beforeRes.rows[0];

      // Guard: saleDate edits are only safe before draws begin — once the room goes active
      // and slots start winning, moving the sale date would retroactively break 30-day eligibility
      // for the affected slot (draws.service.ts reads paid_at for the wait check).
      if (payload.saleDate !== undefined) {
        const allowedStatuses = ['filling', 'pending_combine'];
        if (!allowedStatuses.includes(old.room_status)) {
          throw new ValidationError(
            `Sale date cannot be changed once a room is active or completed (current room status: ${old.room_status}).`,
            'LSS_SLOT_SALE_DATE_LOCKED'
          );
        }
        if (old.status === 'won') {
          throw new ValidationError(
            'Sale date cannot be changed on a slot that has already won a draw.',
            'LSS_SLOT_SALE_DATE_LOCKED'
          );
        }
      }

      // Pre-fetch active batch slots for both incentive calc and field propagation.
      // Status filter (Bug 5): excludes refunded/voided so batchAmount isn't inflated.
      // Used below (Bug 6) to propagate field changes to overflow-room slots.
      const batchSlotsRes = await client.query(
        `SELECT s.id
         FROM   lss_slots s
         JOIN   lss_rooms r ON r.id = s.room_id
         WHERE  s.batch_id = $1
         AND    s.status NOT IN ('refunded', 'voided')
         ORDER  BY r.created_at ASC, s.slot_number ASC`,
        [old.batch_id]
      );
      const batchIds     = batchSlotsRes.rows.map((r: { id: string }) => r.id);
      const anchorSlotId = batchSlotsRes.rows[0]?.id ?? slotId;
      const batchAmount  = parseFloat(old.amount_paid) * batchSlotsRes.rows.length;

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.notes      !== undefined) { fields.push(`notes = $${idx++}`);        vals.push(payload.notes); }
      if (payload.paymentMode != null)      { fields.push(`payment_mode = $${idx++}`); vals.push(payload.paymentMode); }
      if (payload.proofKey   != null)       { fields.push(`proof_key = $${idx++}`);    vals.push(payload.proofKey); }
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
      if (payload.referrerId !== undefined) { fields.push(`referrer_id = $${idx++}`);  vals.push(payload.referrerId ?? null); }
      // TS: customerId allows admin to re-assign slot to correct customer
      if (payload.customerId !== undefined) { fields.push(`customer_id = $${idx++}`);  vals.push(payload.customerId); }
      // saleDate moves both created_at (incentive/summary period) and paid_at (draw eligibility wait).
      // Both must move together so the 30-day eligibility check in draws.service.ts stays consistent.
      if (payload.saleDate !== undefined) {
        fields.push(`created_at = $${idx++}::timestamptz`);
        vals.push(payload.saleDate);
        fields.push(`paid_at = $${idx++}::timestamptz`);
        vals.push(payload.saleDate);
      }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(slotId);
      const updated = await client.query(
        `UPDATE lss_slots SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals
      );

      // Bug 6: Propagate all field changes to other active slots in the same batch.
      // Without this, overflow-room slots (in a second room) keep stale payment data.
      const otherBatchIds = batchIds.filter((id: string) => id !== slotId);
      if (otherBatchIds.length > 0) {
        const batchFields: string[] = [];
        const batchVals: any[]  = [];
        let bidx = 1;
        if (payload.notes      !== undefined) { batchFields.push(`notes = $${bidx++}`);        batchVals.push(payload.notes); }
        if (payload.paymentMode != null)      { batchFields.push(`payment_mode = $${bidx++}`); batchVals.push(payload.paymentMode); }
        if (payload.proofKey   != null)       { batchFields.push(`proof_key = $${bidx++}`);    batchVals.push(payload.proofKey); }
        if (payload.transactionId !== undefined) { batchFields.push(`transaction_id = $${bidx++}`); batchVals.push(payload.transactionId?.length ? payload.transactionId : null); }
        // cash_bank / cash_gpay: batch-update all sibling slots' split columns too
        if (payload.paymentMode === 'cash_bank') {
          if (payload.cashAmount != null) { batchFields.push(`cash_amount = $${bidx++}`); batchVals.push(payload.cashAmount); }
          if (payload.bankAmount != null) { batchFields.push(`bank_amount = $${bidx++}`); batchVals.push(payload.bankAmount); }
          batchFields.push(`gpay_amount = NULL`);
        } else if (payload.paymentMode === 'cash_gpay') {
          if (payload.cashAmount != null) { batchFields.push(`cash_amount = $${bidx++}`); batchVals.push(payload.cashAmount); }
          if (payload.gpayAmount != null) { batchFields.push(`gpay_amount = $${bidx++}`); batchVals.push(payload.gpayAmount); }
          batchFields.push(`bank_amount = NULL`);
        } else if (payload.paymentMode != null) {
          batchFields.push(`cash_amount = NULL`);
          batchFields.push(`bank_amount = NULL`);
          batchFields.push(`gpay_amount = NULL`);
        }
        if (payload.referrerId !== undefined) { batchFields.push(`referrer_id = $${bidx++}`);  batchVals.push(payload.referrerId ?? null); }
        if (payload.customerId !== undefined) { batchFields.push(`customer_id = $${bidx++}`);  batchVals.push(payload.customerId); }
        // Propagate saleDate to all batch slots so overflow-room slots share the same date
        if (payload.saleDate !== undefined) {
          batchFields.push(`created_at = $${bidx++}::timestamptz`);
          batchVals.push(payload.saleDate);
          batchFields.push(`paid_at = $${bidx++}::timestamptz`);
          batchVals.push(payload.saleDate);
        }
        if (batchFields.length > 0) {
          batchVals.push(otherBatchIds);
          await client.query(
            `UPDATE lss_slots SET ${batchFields.join(', ')} WHERE id = ANY($${bidx}::uuid[])`,
            batchVals
          );
        }
      }

      const referrerChanged  = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      // TS: saleDateChanged triggers an incentive re-point so the commission lands in the
      // correct wallet period — same as referrerChanged but the referrer stays the same
      const saleDateChanged  = payload.saleDate !== undefined;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;
      // TS: when the sale date is corrected use the new date; otherwise keep the original
      const effectiveDate    = saleDateChanged ? payload.saleDate! : old.created_at;

      if (referrerChanged || saleDateChanged) {
        // anchorSlotId, batchAmount pre-fetched above with status filter (Bug 5 fix).
        // referrer_id and created_at already propagated to all batch slots by the batch update above.
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     anchorSlotId,
          paymentEvent: 'enrollment',
        });
        if (effectiveReferrer) {
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        SCHEME_CODE,
            dealMakerUserId:   effectiveReferrer,
            mode:              'percent_referrer',
            percentRole:       'referrer_direct',
            baseAmount:        batchAmount,
            paymentEvent:      'enrollment',
            sourceId:          anchorSlotId,
            sourceDescription: `LSS (corrected) — ${old.customer_name} (${old.customer_code})`,
            creditedBy:        correctedBy,
            effectiveDate,
          });
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'slot',
        entityId:   slotId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID SLOT (admin: MD / Management) ─────────────────────────────────────
  async voidSlot(
    db: Pool,
    actorId: string,
    slotId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM lss_slots WHERE id = $1 AND branch_id = $2`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('LSS slot not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Slot is already voided');

      await client.query(
        `UPDATE lss_slots SET status = 'voided' WHERE id = $1`,
        [slotId]
      );

      const voidAnchorRes = await client.query<{ id: string }>(
        `SELECT s.id FROM lss_slots s
         JOIN lss_rooms r ON r.id = s.room_id
         WHERE s.batch_id = $1
         ORDER BY r.created_at ASC, s.slot_number ASC
         LIMIT 1`,
        [old.batch_id]
      );
      const voidAnchorId = voidAnchorRes.rows[0]?.id ?? slotId;
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     voidAnchorId,
        paymentEvent: 'enrollment',
      });

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'slot',
        entityId:   slotId,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── REMOVE SLOT (admin: MD / Management) ───────────────────────────────────
  async removeSlot(
    db: Pool,
    actorId: string,
    slotId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT s.*, r.status AS room_status
         FROM lss_slots s
         JOIN lss_rooms r ON r.id = s.room_id
         WHERE s.id = $1 AND s.branch_id = $2`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = before.rows[0];
      if (old.status === 'refunded' || old.status === 'voided') {
        throw new ValidationError('Slot is already removed or voided');
      }

      await client.query(`UPDATE lss_slots SET status = 'refunded' WHERE id = $1`, [slotId]);

      const removeAnchorRes = await client.query<{ id: string }>(
        `SELECT s.id FROM lss_slots s
         JOIN lss_rooms r ON r.id = s.room_id
         WHERE s.batch_id = $1
         ORDER BY r.created_at ASC, s.slot_number ASC
         LIMIT 1`,
        [old.batch_id]
      );
      const removeAnchorId = removeAnchorRes.rows[0]?.id ?? slotId;
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     removeAnchorId,
        paymentEvent: 'enrollment',
      });

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'slot',
        entityId:   slotId,
        actorId,
        action:     'remove',
        oldValues:  old,
      });

      return { ...old, status: 'refunded' };
    });
  },

  // ─── DELETE SLOT (admin: MD / Management) ───────────────────────────────────
  // Permanently deletes a slot row, claws back its incentives, and snapshots the
  // before-state into the audit log. Won slots are blocked: lss_draws holds a
  // NOT NULL FK to the winning slot, so deleting one would corrupt draw history.
  // Known limitation (same as voidSlot/removeSlot): batch purchases credit their
  // enrollment incentive against the FIRST slot of the batch, so deleting a
  // non-head slot reverses nothing and deleting the head slot claws back the
  // whole batch's credit.
  async deleteSlot(
    db: Pool,
    actorId: string,
    slotId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM lss_slots WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = before.rows[0];

      // Block when the slot has won, or any draw row references it (FK safety)
      const draw = await client.query(
        `SELECT id FROM lss_draws WHERE winning_slot_id = $1 LIMIT 1`,
        [slotId]
      );
      if (old.status === 'won' || draw.rows.length > 0) {
        throw new ValidationError('Slot has won a draw — it cannot be deleted; void it instead');
      }

      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   slotId,
      });

      await client.query(`DELETE FROM lss_slots WHERE id = $1`, [slotId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'slot',
        entityId:   slotId,
        actorId,
        action:     'delete',
        oldValues:  { slot: old },
      });

      return { deleted: true, id: slotId };
    });
  },

};
