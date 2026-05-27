// Rooms — lifecycle, status promotion, activation, listing.
//
// Slot creation goes through SlotsService, which calls findOrCreateFillingRoom
// here under a SELECT FOR UPDATE so two concurrent purchases can't overshoot
// the 16-slot cap.

import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { assertTransition, isStaleFilling, nextDrawDate, RoomStatus } from './status-machine';

const FILL_WINDOW_DAYS = 30;
const SLOTS_PER_ROOM   = 16;

export interface RoomRow {
  id:                  string;
  package_id:          string;
  branch_id:           string;
  room_number:         number;
  is_combined:         boolean;
  status:              RoomStatus;
  fill_deadline:       Date;
  activated_at:        Date | null;
  activated_by:        string | null;
  first_draw_date:     string | null;
  completed_at:        Date | null;
  combined_into_room_id: string | null;
  notes:               string | null;
  created_by:          string;
  created_at:          Date;
}

export const RoomsService = {

  // Fetch a room and promote it to pending_combine if its deadline has passed.
  // Promotion is persisted so future callers see the same status.
  async getRoomWithStaleCheck(client: PoolClient, roomId: string): Promise<RoomRow> {
    const res = await client.query<RoomRow>(
      `SELECT * FROM gold_coin_rooms WHERE id = $1 FOR UPDATE`,
      [roomId]
    );
    if (res.rows.length === 0) throw new NotFoundError('Room not found', 'GC_ROOM_NOT_FOUND');
    const room = res.rows[0];

    if (isStaleFilling(room.status, room.fill_deadline)) {
      assertTransition(room.status, 'pending_combine');
      await client.query(
        `UPDATE gold_coin_rooms SET status = 'pending_combine' WHERE id = $1`,
        [roomId]
      );
      room.status = 'pending_combine';
    }
    return room;
  },

  // Find the current filling room for (package, branch) with room for at least
  // one more slot, or create a new one. Returns the room locked with FOR UPDATE
  // so the caller can safely append a slot inside the same transaction.
  async findOrCreateFillingRoom(
    client: PoolClient,
    packageId: string,
    branchId: string,
    createdBy: string,
  ): Promise<RoomRow> {
    // 1. Look for an existing filling room with < 16 slots, locked
    const existing = await client.query<RoomRow>(
      `SELECT r.*
       FROM gold_coin_rooms r
       WHERE r.package_id = $1
         AND r.branch_id = $2
         AND r.status = 'filling'
         AND (SELECT COUNT(*) FROM gold_coin_slots s WHERE s.room_id = r.id) < ${SLOTS_PER_ROOM}
       ORDER BY r.created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [packageId, branchId]
    );

    if (existing.rows.length > 0) {
      const room = existing.rows[0];
      // Demote if deadline expired
      if (isStaleFilling(room.status, room.fill_deadline)) {
        await client.query(
          `UPDATE gold_coin_rooms SET status='pending_combine' WHERE id=$1`,
          [room.id]
        );
        // Fall through to create a NEW filling room — the old one is now
        // awaiting head-branch action.
      } else {
        return room;
      }
    }

    // 2. Determine next room_number for this (package, branch)
    const seqRes = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(room_number), 0) + 1 AS next
       FROM gold_coin_rooms WHERE package_id = $1 AND branch_id = $2`,
      [packageId, branchId]
    );
    const roomNumber = seqRes.rows[0].next;

    // 3. Insert the new filling room. deadline = now + 30d
    const ins = await client.query<RoomRow>(
      `INSERT INTO gold_coin_rooms
         (package_id, branch_id, room_number, status, fill_deadline, created_by)
       VALUES ($1, $2, $3, 'filling', now() + INTERVAL '${FILL_WINDOW_DAYS} days', $4)
       RETURNING *`,
      [packageId, branchId, roomNumber, createdBy]
    );
    return ins.rows[0];
  },

  // Branch admin clicks Activate. Requires exactly 16 held slots.
  // callerBranchId must match the room's branch_id.
  async activate(db: Pool, roomId: string, activatedBy: string, notes?: string, callerBranchId?: string): Promise<RoomRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const room = await this.getRoomWithStaleCheck(client, roomId);
      if (callerBranchId && room.branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'GC_ROOM_WRONG_BRANCH');
      }
      assertTransition(room.status, 'active');

      const countRes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM gold_coin_slots WHERE room_id = $1 AND status = 'held'`,
        [roomId]
      );
      if (countRes.rows[0].n !== SLOTS_PER_ROOM) {
        throw new ValidationError(
          `Room must have exactly ${SLOTS_PER_ROOM} held slots before activation (currently ${countRes.rows[0].n})`,
          'GC_ROOM_NOT_FULL'
        );
      }

      const firstDraw = nextDrawDate();
      const upd = await client.query<RoomRow>(
        `UPDATE gold_coin_rooms
         SET status = 'active',
             activated_at = now(),
             activated_by = $2,
             first_draw_date = $3,
             notes = COALESCE($4, notes)
         WHERE id = $1
         RETURNING *`,
        [roomId, activatedBy, firstDraw.toISOString().slice(0, 10), notes ?? null]
      );

      await client.query('COMMIT');
      return upd.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },

  // List rooms with filters.
  // branchIds=null means global (MD only). branchIds=[...] scopes to those branches.
  // Promotes stale filling rooms in-place before returning.
  async list(
    db: Pool,
    filters: { status?: RoomStatus; packageId?: string; branchIds: string[] | null; page: number; limit: number }
  ): Promise<{ data: any[]; total: number }> {
    // Lazy bulk-promote stale rooms — single UPDATE, no per-row loop
    await db.query(
      `UPDATE gold_coin_rooms SET status='pending_combine'
       WHERE status='filling' AND fill_deadline <= now()`
    );

    const params: any[] = [];
    let where = '1=1';
    let idx = 1;
    if (filters.status)    { where += ` AND r.status = $${idx++}`;          params.push(filters.status); }
    if (filters.packageId) { where += ` AND r.package_id = $${idx++}`;      params.push(filters.packageId); }
    if (filters.branchIds !== null) {
      where += ` AND r.branch_id = ANY($${idx++}::uuid[])`;
      params.push(filters.branchIds);
    }

    const countRes = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM gold_coin_rooms r WHERE ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].n, 10);

    const dataRes = await db.query(
      `SELECT
         r.*,
         p.name        AS package_name,
         p.price       AS package_price,
         p.gold_grams  AS package_gold_grams,
         b.name        AS branch_name,
         (SELECT COUNT(*)::int FROM gold_coin_slots s WHERE s.room_id = r.id AND s.status = 'held') AS slots_filled,
         (SELECT COUNT(*)::int FROM gold_coin_draws d WHERE d.room_id = r.id)                       AS draws_done
       FROM gold_coin_rooms r
       JOIN gold_coin_packages p ON r.package_id = p.id
       JOIN branches b           ON r.branch_id  = b.id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );

    return { data: dataRes.rows, total };
  },

  // List ALL pending_combine rooms — the head-branch admin's combine inbox.
  // Includes the head branch's own rooms since they are a regular branch too.
  async listAwaitingCombine(db: Pool): Promise<any[]> {
    await db.query(
      `UPDATE gold_coin_rooms SET status='pending_combine'
       WHERE status='filling' AND fill_deadline <= now()`
    );
    const { rows } = await db.query(
      `SELECT
         r.*,
         p.name       AS package_name,
         p.price      AS package_price,
         p.gold_grams AS package_gold_grams,
         b.name       AS branch_name,
         COUNT(s.id) FILTER (WHERE s.status = 'held')::int AS slots_filled
       FROM gold_coin_rooms r
       JOIN gold_coin_packages p ON p.id = r.package_id
       JOIN branches b           ON b.id = r.branch_id
       LEFT JOIN gold_coin_slots s ON s.room_id = r.id
       WHERE r.status = 'pending_combine'
       GROUP BY r.id, p.id, b.id
       ORDER BY r.created_at ASC`
    );
    return rows;
  },

  // Single room view with slots + draws.
  // allowedBranchIds=null means global (MD). Otherwise the room must belong to one of those branches.
  // allowPendingCombine=true lets a head-branch admin preview pending_combine rooms from other branches.
  async getById(
    db: Pool,
    roomId: string,
    allowedBranchIds: string[] | null = null,
    allowPendingCombine = false,
  ): Promise<any> {
    const roomRes = await db.query(
      `SELECT r.*, p.name AS package_name, p.price AS package_price, p.gold_grams AS package_gold_grams,
              b.name AS branch_name, b.is_head_branch AS room_branch_is_head
       FROM gold_coin_rooms r
       JOIN gold_coin_packages p ON r.package_id = p.id
       JOIN branches b           ON r.branch_id  = b.id
       WHERE r.id = $1`,
      [roomId]
    );
    if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'GC_ROOM_NOT_FOUND');

    if (allowedBranchIds !== null) {
      const room = roomRes.rows[0];
      const canView =
        allowedBranchIds.includes(room.branch_id) ||
        (allowPendingCombine && room.status === 'pending_combine');
      if (!canView) throw new ForbiddenError('You do not have access to this room');
    }

    const slotsRes = await db.query(
      `SELECT s.*, c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
              u.name AS referrer_name, u.role AS referrer_role,
              bs.name AS source_branch_name
       FROM gold_coin_slots s
       JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.referrer_id = u.id
       JOIN branches bs ON s.branch_id  = bs.id
       WHERE s.room_id = $1
       ORDER BY s.slot_number ASC`,
      [roomId]
    );

    const drawsRes = await db.query(
      `SELECT d.*,
              s.slot_number AS winning_slot_number,
              c.name        AS winning_customer_name,
              c.customer_code
       FROM gold_coin_draws d
       JOIN gold_coin_slots s ON d.winning_slot_id = s.id
       JOIN customers c       ON s.customer_id    = c.id
       WHERE d.room_id = $1
       ORDER BY d.draw_number ASC`,
      [roomId]
    );

    return { ...roomRes.rows[0], slots: slotsRes.rows, draws: drawsRes.rows };
  },

  // Count of currently held slots in a room — used by slots.service after insert
  // to know if we just hit the 16-slot ready-to-activate state.
  async countHeldSlots(client: PoolClient, roomId: string): Promise<number> {
    const r = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM gold_coin_slots WHERE room_id = $1 AND status = 'held'`,
      [roomId]
    );
    return r.rows[0].n;
  },

  // Branch admin manually sends a filling room to the head branch's combine inbox.
  // Transitions filling → pending_combine without waiting for the 30-day deadline.
  // Caller's branch must own the room; head-branch admins are blocked (they combine directly).
  async sendToHeadBranch(db: Pool, roomId: string, callerBranchId: string): Promise<RoomRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const room = await this.getRoomWithStaleCheck(client, roomId);
      if (room.branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'GC_ROOM_WRONG_BRANCH');
      }

      assertTransition(room.status, 'pending_combine');

      const upd = await client.query<RoomRow>(
        `UPDATE gold_coin_rooms SET status = 'pending_combine' WHERE id = $1 RETURNING *`,
        [roomId]
      );

      await client.query('COMMIT');
      return upd.rows[0];
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  },

  // Mark a room as completed once its 16th draw has been recorded.
  async markCompletedIfDone(client: PoolClient, roomId: string): Promise<boolean> {
    const r = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM gold_coin_draws WHERE room_id = $1`,
      [roomId]
    );
    if (r.rows[0].n >= SLOTS_PER_ROOM) {
      await client.query(
        `UPDATE gold_coin_rooms SET status = 'completed', completed_at = now() WHERE id = $1`,
        [roomId]
      );
      return true;
    }
    return false;
  },

};

export const GC_FILL_WINDOW_DAYS = FILL_WINDOW_DAYS;
export const GC_SLOTS_PER_ROOM   = SLOTS_PER_ROOM;
