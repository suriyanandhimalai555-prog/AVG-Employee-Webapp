// Combine / refund — head-branch admin only.
//
// permissions:
//   - The user MUST be a branch_admin at a branch with is_head_branch = true.
//   - This is enforced in the route layer via assertHeadBranchAdmin().
//
// Two actions on pending_combine rooms:
//   combineRooms(sourceRoomIds)  → creates a new combined room owned by the
//                                  head branch, moves the first 16 held slots
//                                  in (paid_at ASC) into it, source rooms move
//                                  to status='combined_into' with a pointer.
//                                  Leftover slots stay in their source room.
//   refundRoom(roomId)           → marks all held slots refunded, room → expired

import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { assertTransition } from './status-machine';
import { GC_FILL_WINDOW_DAYS, GC_SLOTS_PER_ROOM } from './rooms.service';

export const CombineService = {

  // Assert the actor is a branch_admin at a head branch. Throws ForbiddenError otherwise.
  async assertHeadBranchAdmin(db: Pool, userId: string): Promise<{ headBranchId: string }> {
    const res = await db.query<{ branch_id: string; role: string; is_head: boolean }>(
      `SELECT u.branch_id, u.role, b.is_head_branch AS is_head
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );
    if (res.rows.length === 0) throw new ForbiddenError('User not found', 'GC_HEAD_PERM');
    const { branch_id, role, is_head } = res.rows[0];
    if (role !== 'branch_admin' || !is_head || !branch_id) {
      throw new ForbiddenError('Only branch admins at the head branch can perform this action', 'GC_HEAD_PERM');
    }
    return { headBranchId: branch_id };
  },

  async combineRooms(
    db: Pool,
    sourceRoomIds: string[],
    headBranchId: string,
    actorUserId: string,
    notes?: string,
  ): Promise<{ combinedRoom: any; slotsMoved: number; sourceRooms: number }> {
    if (sourceRoomIds.length < 2) {
      throw new ValidationError('Need at least 2 source rooms to combine', 'GC_COMBINE_TOO_FEW');
    }
    return runInTransaction(db, async (client) => {
      // Lock source rooms in deterministic order to avoid deadlocks
      const sortedIds = [...sourceRoomIds].sort();
      const roomsRes = await client.query(
        `SELECT id, package_id, status, branch_id
         FROM gold_coin_rooms
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [sortedIds]
      );
      if (roomsRes.rows.length !== sortedIds.length) {
        throw new NotFoundError('One or more source rooms not found', 'GC_COMBINE_MISSING');
      }

      // package_id is taken from the first source room for the new combined room.
      // Same-package selection is enforced by the frontend UI grouping; the backend
      // only checks that every source room is in pending_combine status.
      const pkgId = roomsRes.rows[0].package_id;
      for (const r of roomsRes.rows) {
        if (r.status !== 'pending_combine') {
          throw new ValidationError(
            `Room ${r.id} is in status '${r.status}', not 'pending_combine'`,
            'GC_COMBINE_BAD_STATUS'
          );
        }
      }

      // Collect held slots from source rooms, ordered by paid_at
      const slotsRes = await client.query<{ id: string; room_id: string }>(
        `SELECT id, room_id FROM gold_coin_slots
         WHERE room_id = ANY($1::uuid[]) AND status = 'held'
         ORDER BY paid_at ASC, id ASC
         FOR UPDATE`,
        [sortedIds]
      );
      if (slotsRes.rows.length < GC_SLOTS_PER_ROOM) {
        throw new ValidationError(
          `Source rooms have only ${slotsRes.rows.length} held slot(s); need ${GC_SLOTS_PER_ROOM}`,
          'GC_COMBINE_NOT_ENOUGH_SLOTS'
        );
      }
      const slotsToMove = slotsRes.rows.slice(0, GC_SLOTS_PER_ROOM);

      // Determine next room_number for the head branch + package
      const seqRes = await client.query<{ next: number }>(
        `SELECT COALESCE(MAX(room_number), 0) + 1 AS next
         FROM gold_coin_rooms WHERE package_id = $1 AND branch_id = $2`,
        [pkgId, headBranchId]
      );
      const roomNumber = seqRes.rows[0].next;

      // Create the new combined room (status='filling' until admin Activates)
      const newRoomRes = await client.query(
        `INSERT INTO gold_coin_rooms
           (package_id, branch_id, room_number, is_combined, status, fill_deadline, created_by, notes)
         VALUES ($1, $2, $3, true, 'filling', now() + INTERVAL '${GC_FILL_WINDOW_DAYS} days', $4, $5)
         RETURNING *`,
        [pkgId, headBranchId, roomNumber, actorUserId, notes ?? null]
      );
      const newRoom = newRoomRes.rows[0];

      // Move slots one-by-one to renumber 1..16 (single UPDATE per slot keeps
      // the unique (room_id, slot_number) constraint happy)
      for (let i = 0; i < slotsToMove.length; i++) {
        await client.query(
          `UPDATE gold_coin_slots SET room_id = $1, slot_number = $2 WHERE id = $3`,
          [newRoom.id, i + 1, slotsToMove[i].id]
        );
      }

      // For each source room: if it has zero held slots left, mark combined_into;
      // otherwise leave it in pending_combine for the next decision.
      let absorbed = 0;
      for (const r of roomsRes.rows) {
        const remaining = await client.query<{ n: number }>(
          `SELECT COUNT(*)::int AS n FROM gold_coin_slots WHERE room_id = $1 AND status = 'held'`,
          [r.id]
        );
        if (remaining.rows[0].n === 0) {
          assertTransition('pending_combine', 'combined_into');
          await client.query(
            `UPDATE gold_coin_rooms
             SET status = 'combined_into', combined_into_room_id = $1
             WHERE id = $2`,
            [newRoom.id, r.id]
          );
          absorbed++;
        }
      }

      return {
        combinedRoom: newRoom,
        slotsMoved:   slotsToMove.length,
        sourceRooms:  absorbed,
      };
    });
  },

  async refundRoom(db: Pool, roomId: string, headBranchId: string, reason?: string): Promise<{ slotsRefunded: number }> {
    return runInTransaction(db, async (client) => {
      const roomRes = await client.query<{ status: string; branch_id: string }>(
        `SELECT status, branch_id FROM gold_coin_rooms WHERE id = $1 FOR UPDATE`,
        [roomId]
      );
      if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'GC_ROOM_NOT_FOUND');
      if (roomRes.rows[0].branch_id !== headBranchId) {
        throw new ForbiddenError('Room is not owned by the head branch', 'GC_ROOM_WRONG_BRANCH');
      }
      assertTransition(roomRes.rows[0].status as any, 'expired');

      const refundRes = await client.query(
        `UPDATE gold_coin_slots SET status = 'refunded'
         WHERE room_id = $1 AND status = 'held'
         RETURNING id`,
        [roomId]
      );

      await client.query(
        `UPDATE gold_coin_rooms
         SET status = 'expired',
             notes = COALESCE($2, notes)
         WHERE id = $1`,
        [roomId, reason ?? null]
      );

      return { slotsRefunded: refundRes.rowCount ?? 0 };
    });
  },

};

