// Draws — one per month on the 12th. Admin picks the winning slot manually.
//
// runDraw is idempotent within a transaction: SELECT FOR UPDATE on the room
// AND the chosen slot, recount draws, refuse if already at 16. Auto-marks
// the room completed when the 16th draw lands.

import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { RoomsService, GC_SLOTS_PER_ROOM } from './rooms.service';
import { isEligibilityBypassEnabled, GOLD_COIN_ELIGIBILITY_BYPASS_KEY } from '../../shared/eligibility-bypass-guard';
import { SchemeAudit } from '../../shared/scheme-audit';

// TS: stable scheme code used for audit log entries
const SCHEME_CODE = 'gold_coin_scheme';

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
        `SELECT id, status, branch_id FROM gold_coin_rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );
      if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'GC_ROOM_NOT_FOUND');
      if (roomRes.rows[0].branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'GC_ROOM_WRONG_BRANCH');
      }
      if (roomRes.rows[0].status !== 'active') {
        throw new ValidationError(
          `Draws only run on active rooms (current status: ${roomRes.rows[0].status})`,
          'GC_ROOM_NOT_ACTIVE'
        );
      }

      // 2. Count existing draws under the room lock — next draw_number = count + 1
      const drawCountRes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM gold_coin_draws WHERE room_id = $1`,
        [roomId]
      );
      const drawNumber = drawCountRes.rows[0].n + 1;
      if (drawNumber > GC_SLOTS_PER_ROOM) {
        throw new ConflictError(
          `Room already has ${GC_SLOTS_PER_ROOM} draws — no slots remaining`,
          'GC_ROOM_DRAWS_DONE'
        );
      }

      // 3. Lock + validate the slot the admin picked
      const slotRes = await client.query<{ id: string; slot_number: number; room_id: string; status: string; paid_at: Date }>(
        `SELECT id, slot_number, room_id, status, paid_at
         FROM gold_coin_slots
         WHERE id = $1
         FOR UPDATE`,
        [args.winningSlotId]
      );
      if (slotRes.rows.length === 0) {
        throw new NotFoundError('Slot not found', 'GC_SLOT_NOT_FOUND');
      }
      const winning = slotRes.rows[0];
      if (winning.room_id !== roomId) {
        throw new ValidationError('Slot does not belong to this room', 'GC_SLOT_WRONG_ROOM');
      }
      if (winning.status !== 'held') {
        throw new ConflictError(
          `Slot ${winning.slot_number} is in status '${winning.status}', not 'held'`,
          'GC_SLOT_NOT_HELD'
        );
      }
      // Management can enable a bypass toggle to skip the 30-day wait per scheme.
      // All other guards (room active, slot held, draw-count cap) are always enforced.
      const eligibilityBypassed = await isEligibilityBypassEnabled(client, GOLD_COIN_ELIGIBILITY_BYPASS_KEY);
      if (!eligibilityBypassed) {
        const slotAgeMs   = Date.now() - new Date(winning.paid_at).getTime();
        const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
        if (slotAgeMs < THIRTY_DAYS) {
          const daysLeft = Math.ceil((THIRTY_DAYS - slotAgeMs) / 86400000);
          throw new ValidationError(
            `Slot ${winning.slot_number} is not yet eligible — customer joined less than 30 days ago (eligible in ${daysLeft} day${daysLeft === 1 ? '' : 's'})`,
            'GC_SLOT_NOT_ELIGIBLE',
          );
        }
      }

      // 4. Insert the draw row
      const drawIns = await client.query(
        `INSERT INTO gold_coin_draws
           (room_id, draw_number, draw_date, winning_slot_id, drawn_by, notes)
         VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5, $6)
         RETURNING *`,
        [roomId, drawNumber, args.drawDate ?? null, winning.id, drawnBy, args.notes ?? null]
      );
      const draw = drawIns.rows[0];

      // 5. Mark the slot won — the slot_won_invariant CHECK enforces both columns move together
      await client.query(
        `UPDATE gold_coin_slots SET status = 'won', won_in_draw_id = $1 WHERE id = $2`,
        [draw.id, winning.id]
      );

      // 6. Auto-complete the room when the 16th draw lands
      const completed = await RoomsService.markCompletedIfDone(client, roomId);

      return { draw, winningSlotNumber: winning.slot_number, roomCompleted: completed };
    });
  },

  // ─── UNDO DRAW (admin: MD / Management) ─────────────────────────────────────
  // Reverses the most recent draw in a room:
  //   • Resets the winning slot to 'held' (null won_in_draw_id) — satisfies the
  //     slot_won_invariant CHECK (status='won' ⟺ won_in_draw_id NOT NULL).
  //   • Deletes the draw row (removing it from the UNIQUE(room_id, draw_number)
  //     index so the number can be reused when the next draw is run).
  //   • Reverts a 'completed' room to 'active' so a new winner can be picked.
  //   • No incentive reversal needed — draws write nothing to employee_incentives.
  //   • Only the LATEST draw may be undone; deleting an earlier draw would allow
  //     draw_number reuse and collide with a remaining row's unique constraint.
  async undoDraw(
    db: Pool,
    undoneBy: string,
    roomId: string,
    drawId: string,
    callerBranchId: string,
  ): Promise<any> {
    return runInTransaction(db, async (client) => {
      // 1. Lock the room and verify branch ownership
      const roomRes = await client.query(
        `SELECT id, status, branch_id FROM gold_coin_rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );
      if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'GC_ROOM_NOT_FOUND');
      if (roomRes.rows[0].branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'GC_ROOM_WRONG_BRANCH');
      }

      // 2. Load and lock the draw row, confirm it belongs to this room
      const drawRes = await client.query(
        `SELECT * FROM gold_coin_draws WHERE id = $1 FOR UPDATE`,
        [drawId]
      );
      if (drawRes.rows.length === 0) throw new NotFoundError('Draw not found', 'GC_DRAW_NOT_FOUND');
      const draw = drawRes.rows[0];
      if (draw.room_id !== roomId) {
        throw new ValidationError('Draw does not belong to this room', 'GC_DRAW_WRONG_ROOM');
      }

      // 3. Confirm it is the latest draw (highest draw_number) — see comment above
      const latestRes = await client.query<{ id: string; draw_number: number }>(
        `SELECT id, draw_number FROM gold_coin_draws WHERE room_id = $1 ORDER BY draw_number DESC LIMIT 1`,
        [roomId]
      );
      if (latestRes.rows.length === 0 || latestRes.rows[0].id !== drawId) {
        throw new ConflictError(
          'Only the most recent draw can be undone. Undo later draws first.',
          'GC_DRAW_NOT_LATEST'
        );
      }

      // 4. Lock and reset the winning slot — one UPDATE keeps invariant consistent
      await client.query(
        `UPDATE gold_coin_slots SET status = 'held', won_in_draw_id = NULL WHERE id = $1`,
        [draw.winning_slot_id]
      );

      // 5. Delete the draw row
      await client.query(`DELETE FROM gold_coin_draws WHERE id = $1`, [drawId]);

      // 6. Revert completed room to active so a new draw can run
      const room = roomRes.rows[0];
      if (room.status === 'completed') {
        await client.query(
          `UPDATE gold_coin_rooms SET status = 'active' WHERE id = $1`,
          [roomId]
        );
      }

      // 7. Audit trail
      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payout',
        entityId:   drawId,
        actorId:    undoneBy,
        action:     'void',
        oldValues:  draw,
        // TS: newValues is undefined (not null) — draw row is deleted, nothing to show
        newValues:  undefined,
      });

      return { undone: true, drawNumber: draw.draw_number, slotId: draw.winning_slot_id };
    });
  },

};
