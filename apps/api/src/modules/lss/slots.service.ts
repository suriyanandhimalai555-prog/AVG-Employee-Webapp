// Slots — customer purchases. One entry point: createSlot.
//
// quantity=20 with an empty room == FULL room (one owner).
// Referral commission is ONE row, 20% of quantity × plan.price.

import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { IncentiveService } from '../incentives/incentives.service';
import { RoomsService, LSS_SLOTS_PER_ROOM } from './rooms.service';
import type { CreateSlotInput } from './lss.schema';

const SCHEME_CODE = 'lss_scheme';

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

      // 4. Find or open a filling room (FOR UPDATE — serialised on the room row)
      const room = await RoomsService.findOrCreateFillingRoom(
        client, payload.planId, branchId, enteredBy
      );

      // 5. Recount under the lock and validate capacity
      const heldCount = await RoomsService.countHeldSlots(client, room.id);
      const available = LSS_SLOTS_PER_ROOM - heldCount;

      if (quantity === LSS_SLOTS_PER_ROOM && heldCount > 0) {
        throw new ConflictError(
          `A Full room (20 slots) needs a fresh room — the current room already has ${heldCount} slot(s). ` +
          `Sell those out first, or buy ≤ ${available} slot(s) here.`,
          'LSS_FULL_ROOM_NOT_EMPTY'
        );
      }
      if (quantity > available) {
        throw new ConflictError(
          `Only ${available} slot(s) available in the current room — cannot sell ${quantity}.`,
          'LSS_ROOM_INSUFFICIENT_SLOTS'
        );
      }

      // 6. Insert N slots, numbered (heldCount + 1) .. (heldCount + quantity)
      const slots: any[] = [];
      for (let i = 0; i < quantity; i++) {
        const slotNumber = heldCount + 1 + i;
        const slotRes = await client.query(
          `INSERT INTO lss_slots
             (room_id, slot_number, customer_id, branch_id, amount_paid,
              payment_mode, referrer_id, notes, entered_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            room.id,
            slotNumber,
            payload.customerId,
            branchId,
            payload.amountPaid,
            payload.paymentMode,
            payload.referrerId ?? null,
            payload.notes ?? null,
            enteredBy,
          ]
        );
        slots.push(slotRes.rows[0]);
      }

      const totalAmountPaid = quantity * payload.amountPaid;

      // 7. Referral payout — ONE row, 20% of the TOTAL paid
      let commissionAmount = 0;
      if (payload.referrerId) {
        const slotRangeLabel = quantity === 1
          ? `slot ${slots[0].slot_number}/${LSS_SLOTS_PER_ROOM}`
          : quantity === LSS_SLOTS_PER_ROOM
            ? `FULL room`
            : `slots ${slots[0].slot_number}-${slots[slots.length - 1].slot_number}/${LSS_SLOTS_PER_ROOM} (×${quantity})`;
        const sourceDescription =
          `LSS ${slotRangeLabel} — ${customer.name} (${customer.customer_code}) — ${plan.name}`;
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        SCHEME_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_direct',
          baseAmount:        totalAmountPaid,
          paymentEvent:      'enrollment',
          sourceId:          slots[0].id,
          sourceDescription,
          creditedBy:        enteredBy,
        });
        commissionAmount = credited.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      }

      return { slots, room, commissionAmount, totalAmountPaid };
    });
  },

  async refundSlot(db: Pool, slotId: string, callerBranchId: string): Promise<void> {
    await runInTransaction(db, async (client) => {
      const res = await client.query<{ status: string; room_id: string; branch_id: string }>(
        `SELECT status, room_id, branch_id FROM lss_slots WHERE id = $1 FOR UPDATE`,
        [slotId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Slot not found', 'LSS_SLOT_NOT_FOUND');
      }
      const { status, branch_id } = res.rows[0];
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
    });
  },

};
