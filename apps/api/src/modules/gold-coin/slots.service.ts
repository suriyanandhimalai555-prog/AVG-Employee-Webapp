// Slots — customer purchases. One entry point: createSlot.
//
// One call may create 1..16 slots in a single transaction:
//   quantity = 1   → SINGLE slot for the customer
//   quantity = N   → N slots for the same customer (still SINGLE, multi-share)
//   quantity = 16  → FULL room: the customer owns all 16. Only allowed when
//                    the next filling room is empty (no existing slots).
//
// Referral commission is ONE row, calculated on quantity × per-slot price.
// Total amount paid = quantity × payload.amountPaid (which must match
// package.price). The slot's amount_paid column stores the PER-SLOT price.

import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import { RoomsService, GC_SLOTS_PER_ROOM } from './rooms.service';
import type { CreateSlotInput, CorrectGoldCoinSlotInput } from './gold-coin.schema';

const SCHEME_CODE = 'gold_coin_scheme';

export const SlotsService = {

  async createSlot(
    db: Pool,
    branchId: string,
    enteredBy: string,
    payload: CreateSlotInput,
  ): Promise<{ slots: any[]; room: any; commissionAmount: number; totalAmountPaid: number }> {
    const quantity = payload.quantity ?? 1;
    return runInTransaction(db, async (client) => {
      // 1. Customer must exist and belong to this branch
      const custRes = await client.query(
        `SELECT id, name, customer_code FROM customers WHERE id = $1 AND branch_id = $2`,
        [payload.customerId, branchId]
      );
      if (custRes.rows.length === 0) {
        throw new NotFoundError('Customer not found in this branch', 'GC_CUSTOMER_NOT_FOUND');
      }
      const customer = custRes.rows[0];

      // 2. Package must exist and be active; amount must match the package price
      const pkgRes = await client.query(
        `SELECT id, name, price, gold_grams FROM gold_coin_packages WHERE id = $1 AND is_active = true`,
        [payload.packageId]
      );
      if (pkgRes.rows.length === 0) {
        throw new NotFoundError('Package not found or inactive', 'GC_PACKAGE_NOT_FOUND');
      }
      const pkg   = pkgRes.rows[0];
      const price = parseFloat(pkg.price);
      if (Math.abs(price - payload.amountPaid) > 0.01) {
        throw new ValidationError(
          `Amount paid per slot (${payload.amountPaid}) does not match package price (${price})`,
          'GC_AMOUNT_MISMATCH'
        );
      }

      // 3. Optional referrer must exist and be active
      if (payload.referrerId) {
        const refRes = await client.query(
          `SELECT id FROM users WHERE id = $1 AND is_active = true`,
          [payload.referrerId]
        );
        if (refRes.rows.length === 0) {
          throw new NotFoundError('Referrer not found or inactive', 'GC_REFERRER_NOT_FOUND');
        }
      }

      // 4. Find or open a filling room (FOR UPDATE — serialised on the room row)
      const room = await RoomsService.findOrCreateFillingRoom(
        client, payload.packageId, branchId, enteredBy
      );

      // 5. Recount under the lock and validate capacity
      const heldCount = await RoomsService.countHeldSlots(client, room.id);
      const available = GC_SLOTS_PER_ROOM - heldCount;

      // FULL room (quantity=16) is only allowed when the room is empty.
      // We cannot start a Full room on top of partially-filled Single slots.
      if (quantity === GC_SLOTS_PER_ROOM && heldCount > 0) {
        throw new ConflictError(
          `A Full room (16 slots) needs a fresh room — the current room already has ${heldCount} slot(s). ` +
          `Sell those out first, or buy ≤ ${available} slot(s) here.`,
          'GC_FULL_ROOM_NOT_EMPTY'
        );
      }
      if (quantity > available) {
        throw new ConflictError(
          `Only ${available} slot(s) available in the current room — cannot sell ${quantity}.`,
          'GC_ROOM_INSUFFICIENT_SLOTS'
        );
      }

      // 6. Insert N slots, numbered (heldCount + 1) .. (heldCount + quantity)
      const slots: any[] = [];
      for (let i = 0; i < quantity; i++) {
        const slotNumber = heldCount + 1 + i;
        // Backdated entry: saleDate overrides created_at so branch summaries
        // (which filter slots by created_at) count the sale in its real period.
        const slotRes = await client.query(
          `INSERT INTO gold_coin_slots
             (room_id, slot_number, customer_id, branch_id, amount_paid,
              payment_mode, proof_key, referrer_id, notes, entered_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                   COALESCE($11::timestamptz, now()))
           RETURNING *`,
          [
            room.id,
            slotNumber,
            payload.customerId,
            branchId,
            payload.amountPaid,
            payload.paymentMode,
            payload.proofKey ?? null,
            payload.referrerId ?? null,
            payload.notes ?? null,
            enteredBy,
            payload.saleDate ?? null,
          ]
        );
        slots.push(slotRes.rows[0]);
      }

      const totalAmountPaid = quantity * payload.amountPaid;

      // 7. Referral payout — ONE row, 20% of the TOTAL paid
      let commissionAmount = 0;
      if (payload.referrerId) {
        const slotRangeLabel = quantity === 1
          ? `slot ${slots[0].slot_number}/${GC_SLOTS_PER_ROOM}`
          : quantity === GC_SLOTS_PER_ROOM
            ? `FULL room`
            : `slots ${slots[0].slot_number}-${slots[slots.length - 1].slot_number}/${GC_SLOTS_PER_ROOM} (×${quantity})`;
        const sourceDescription =
          `Gold Coin ${slotRangeLabel} — ${customer.name} (${customer.customer_code}) — ${pkg.name}`;
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        SCHEME_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_direct',
          baseAmount:        totalAmountPaid,
          paymentEvent:      'enrollment',
          sourceId:          slots[0].id,        // points at the first slot of this batch
          sourceDescription,
          creditedBy:        enteredBy,
          // Backdated entry: the incentive sits in the sale date's wallet period
          effectiveDate:     payload.saleDate,
        });
        commissionAmount = credited.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      }

      return { slots, room, commissionAmount, totalAmountPaid };
    });
  },

  // Refund a single held slot. callerBranchId must match the slot's branch_id.
  // Used by branch admins only; combine.refundRoom has its own path and skips this guard.
  async refundSlot(db: Pool, slotId: string, callerBranchId: string): Promise<void> {
    await runInTransaction(db, async (client) => {
      const res = await client.query<{ status: string; room_id: string; branch_id: string; referrer_id: string | null }>(
        `SELECT status, room_id, branch_id, referrer_id FROM gold_coin_slots WHERE id = $1 FOR UPDATE`,
        [slotId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Slot not found', 'GC_SLOT_NOT_FOUND');
      }
      const { status, branch_id } = res.rows[0];
      if (branch_id !== callerBranchId) {
        throw new ForbiddenError('Slot belongs to a different branch', 'GC_SLOT_WRONG_BRANCH');
      }
      if (status !== 'held') {
        throw new ConflictError(`Cannot refund a slot in status '${status}'`, 'GC_SLOT_NOT_REFUNDABLE');
      }
      await client.query(
        `UPDATE gold_coin_slots SET status = 'refunded' WHERE id = $1`,
        [slotId]
      );
      // Claw back the enrollment incentive that was credited for this batch
      // (sourceId = first slot of the batch = slotId for single-slot purchases)
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     slotId,
        paymentEvent: 'enrollment',
      });
    });
  },

  // ─── CORRECT SLOT (admin: MD / Management) ───────────────────────────────────
  // Patches editable fields on a slot batch. When referrerId changes the enrollment
  // incentive is reversed and re-distributed. sourceId is the first slot in the batch.
  async correctSlot(
    db: Pool,
    correctedBy: string,
    slotId: string,
    branchId: string,
    payload: CorrectGoldCoinSlotInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const beforeRes = await client.query(
        `SELECT s.*, c.name AS customer_name, c.customer_code, pkg.name AS pkg_name,
                s.amount_paid * (SELECT COUNT(*) FROM gold_coin_slots WHERE room_id = s.room_id AND customer_id = s.customer_id) AS total_amount
         FROM gold_coin_slots s
         JOIN customers c ON c.id = s.customer_id
         JOIN gold_coin_packages pkg ON pkg.id = s.package_id
         WHERE s.id = $1 AND s.branch_id = $2`,
        [slotId, branchId]
      );
      if (beforeRes.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = beforeRes.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.notes      !== undefined) { fields.push(`notes = $${idx++}`);        vals.push(payload.notes); }
      if (payload.paymentMode != null)      { fields.push(`payment_mode = $${idx++}`); vals.push(payload.paymentMode); }
      if (payload.proofKey   != null)       { fields.push(`proof_key = $${idx++}`);    vals.push(payload.proofKey); }
      if (payload.referrerId !== undefined) { fields.push(`referrer_id = $${idx++}`);  vals.push(payload.referrerId ?? null); }
      // TS: customerId allows admin to re-assign slot to correct customer
      if (payload.customerId !== undefined) { fields.push(`customer_id = $${idx++}`);  vals.push(payload.customerId); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(slotId);
      const updated = await client.query(
        `UPDATE gold_coin_slots SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals
      );

      const referrerChanged = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;

      if (referrerChanged) {
        // The referrer belongs to the customer's whole holding in this room, and
        // enrollment incentives are keyed to the FIRST slot of each purchase batch —
        // so operate on every sibling slot, not just the one being edited.
        const siblings = await client.query(
          `SELECT id FROM gold_coin_slots
           WHERE room_id = $1 AND customer_id = $2
           ORDER BY slot_number ASC`,
          [old.room_id, old.customer_id]
        );
        await client.query(
          `UPDATE gold_coin_slots SET referrer_id = $1 WHERE room_id = $2 AND customer_id = $3`,
          [payload.referrerId ?? null, old.room_id, old.customer_id]
        );
        for (const sib of siblings.rows) {
          await IncentiveService.reverseIncentives(client, {
            schemeCode:   SCHEME_CODE,
            sourceId:     sib.id,
            paymentEvent: 'enrollment',
          });
        }
        if (effectiveReferrer) {
          const anchorSlotId = siblings.rows[0]?.id ?? slotId;
          const totalAmount = parseFloat(old.total_amount ?? old.amount_paid);
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        SCHEME_CODE,
            dealMakerUserId:   effectiveReferrer,
            mode:              'percent_referrer',
            percentRole:       'referrer_direct',
            baseAmount:        totalAmount,
            paymentEvent:      'enrollment',
            sourceId:          anchorSlotId,
            sourceDescription: `Gold Coin (corrected) — ${old.customer_name} (${old.customer_code})`,
            creditedBy:        correctedBy,
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
        `SELECT * FROM gold_coin_slots WHERE id = $1 AND branch_id = $2`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Slot is already voided');

      await client.query(
        `UPDATE gold_coin_slots SET status = 'voided' WHERE id = $1`,
        [slotId]
      );

      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     slotId,
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
  // Refunds a slot from inside a room and reverses its enrollment incentive.
  // Available for any non-completed, non-voided slot (stricter than voidSlot
  // which only handles non-voided). Frees the room seat.
  async removeSlot(
    db: Pool,
    actorId: string,
    slotId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT s.*, r.status AS room_status
         FROM gold_coin_slots s
         JOIN gold_coin_rooms r ON r.id = s.room_id
         WHERE s.id = $1 AND s.branch_id = $2`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = before.rows[0];
      if (old.status === 'refunded' || old.status === 'voided') {
        throw new ValidationError('Slot is already removed or voided');
      }

      await client.query(`UPDATE gold_coin_slots SET status = 'refunded' WHERE id = $1`, [slotId]);

      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     slotId,
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
  // before-state into the audit log. Won slots are blocked: gold_coin_draws holds
  // a NOT NULL FK to the winning slot, so deleting one would corrupt draw history.
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
        `SELECT * FROM gold_coin_slots WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [slotId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Slot not found');
      const old = before.rows[0];

      // Block when the slot has won, or any draw row references it (FK safety)
      const draw = await client.query(
        `SELECT id FROM gold_coin_draws WHERE winning_slot_id = $1 LIMIT 1`,
        [slotId]
      );
      if (old.status === 'won' || draw.rows.length > 0) {
        throw new ValidationError('Slot has won a draw — it cannot be deleted; void it instead');
      }

      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   slotId,
      });

      await client.query(`DELETE FROM gold_coin_slots WHERE id = $1`, [slotId]);

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
