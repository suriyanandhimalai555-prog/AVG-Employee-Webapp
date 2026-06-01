// Draws — one per month on the 12th. Admin picks the winning slot manually.
//
// Payout formula: plan.price × (1.5 + draw_number × 0.025)
// The payout_amount is stored on the draw row for immutable audit.
//
// runDraw is idempotent within a transaction: SELECT FOR UPDATE on the room
// AND the chosen slot, recount draws, refuse if already at 20. Auto-marks
// the room completed when the 20th draw lands.

import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { RoomsService, LSS_SLOTS_PER_ROOM } from './rooms.service';

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

export const DrawsService = {

  async runDraw(
    db: Pool,
    roomId: string,
    drawnBy: string,
    args: { winningSlotId: string; drawDate?: string; notes?: string },
    callerBranchId: string,
  ): Promise<any> {
    return runInTransaction(db, async (client) => {
      // 1. Lock the room and verify branch ownership
      const roomRes = await client.query(
        `SELECT id, status, branch_id FROM lss_rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );
      if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'LSS_ROOM_NOT_FOUND');
      if (roomRes.rows[0].branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'LSS_ROOM_WRONG_BRANCH');
      }
      if (roomRes.rows[0].status !== 'active') {
        throw new ValidationError(
          `Draws only run on active rooms (current status: ${roomRes.rows[0].status})`,
          'LSS_ROOM_NOT_ACTIVE'
        );
      }

      // 2. Count existing draws — next draw_number = count + 1
      const drawCountRes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM lss_draws WHERE room_id = $1`,
        [roomId]
      );
      const drawNumber = drawCountRes.rows[0].n + 1;
      if (drawNumber > LSS_SLOTS_PER_ROOM) {
        throw new ConflictError(
          `Room already has ${LSS_SLOTS_PER_ROOM} draws — no slots remaining`,
          'LSS_ROOM_DRAWS_DONE'
        );
      }

      // 3. Lock + validate the slot the admin picked
      const slotRes = await client.query<{
        id: string; slot_number: number; room_id: string; status: string; paid_at: Date;
      }>(
        `SELECT id, slot_number, room_id, status, paid_at
         FROM lss_slots
         WHERE id = $1
         FOR UPDATE`,
        [args.winningSlotId]
      );
      if (slotRes.rows.length === 0) {
        throw new NotFoundError('Slot not found', 'LSS_SLOT_NOT_FOUND');
      }
      const winning = slotRes.rows[0];
      if (winning.room_id !== roomId) {
        throw new ValidationError('Slot does not belong to this room', 'LSS_SLOT_WRONG_ROOM');
      }
      if (winning.status !== 'held') {
        throw new ConflictError(
          `Slot ${winning.slot_number} is in status '${winning.status}', not 'held'`,
          'LSS_SLOT_NOT_HELD'
        );
      }
      const slotAgeMs = Date.now() - new Date(winning.paid_at).getTime();
      if (slotAgeMs < THIRTY_DAYS) {
        const daysLeft = Math.ceil((THIRTY_DAYS - slotAgeMs) / 86400000);
        throw new ValidationError(
          `Slot ${winning.slot_number} is not yet eligible — customer joined less than 30 days ago (eligible in ${daysLeft} day${daysLeft === 1 ? '' : 's'})`,
          'LSS_SLOT_NOT_ELIGIBLE',
        );
      }

      // 4. Fetch plan price to compute payout for this draw level
      const planRes = await client.query<{ price: string }>(
        `SELECT p.price FROM lss_plans p
         JOIN lss_rooms r ON r.plan_id = p.id
         WHERE r.id = $1`,
        [roomId]
      );
      const planPrice    = parseFloat(planRes.rows[0].price);
      const payoutAmount = planPrice * (1.5 + drawNumber * 0.025);

      // 5. Insert the draw row with the computed payout
      const drawIns = await client.query(
        `INSERT INTO lss_draws
           (room_id, draw_number, draw_date, winning_slot_id, payout_amount, drawn_by, notes)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6, $7)
         RETURNING *`,
        [roomId, drawNumber, args.drawDate ?? null, winning.id, payoutAmount, drawnBy, args.notes ?? null]
      );
      const draw = drawIns.rows[0];

      // 6. Mark the slot won
      await client.query(
        `UPDATE lss_slots SET status = 'won', won_in_draw_id = $1 WHERE id = $2`,
        [draw.id, winning.id]
      );

      // 7. Auto-complete the room when the 20th draw lands
      const completed = await RoomsService.markCompletedIfDone(client, roomId);

      return { draw, winningSlotNumber: winning.slot_number, payoutAmount, roomCompleted: completed };
    });
  },

};
