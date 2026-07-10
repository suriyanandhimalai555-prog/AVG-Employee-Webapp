// Rooms — lifecycle, status promotion, activation, listing.
//
// Slot creation goes through SlotsService, which calls findOrCreateFillingRoom
// here under a SELECT FOR UPDATE so two concurrent purchases can't overshoot
// the 20-slot cap.

import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { assertTransition, isStaleFilling, nextDrawDate, RoomStatus } from './status-machine';
import { IncentiveService } from '../incentives/incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import { runInTransaction } from '../../shared/transaction-helper';

const SCHEME_CODE = 'lss_scheme';

const FILL_WINDOW_DAYS = 30;
const SLOTS_PER_ROOM   = 20;

export interface RoomRow {
  id:                  string;
  plan_id:             string;
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

  async getRoomWithStaleCheck(client: PoolClient, roomId: string): Promise<RoomRow> {
    const res = await client.query<RoomRow>(
      `SELECT * FROM lss_rooms WHERE id = $1 FOR UPDATE`,
      [roomId]
    );
    if (res.rows.length === 0) throw new NotFoundError('Room not found', 'LSS_ROOM_NOT_FOUND');
    const room = res.rows[0];

    if (isStaleFilling(room.status, room.fill_deadline)) {
      assertTransition(room.status, 'pending_combine');
      await client.query(
        `UPDATE lss_rooms SET status = 'pending_combine' WHERE id = $1`,
        [roomId]
      );
      room.status = 'pending_combine';
    }
    return room;
  },

  // Find the current filling room for (plan, branch) with room for at least
  // one more slot, or create a new one. Returns the room locked with FOR UPDATE
  // so the caller can safely append a slot inside the same transaction.
  // Used for partial (single-slot) purchases. Full-room purchases call
  // createFreshFillingRoom directly so they never land on a partially-filled room.
  async findOrCreateFillingRoom(
    client: PoolClient,
    planId: string,
    branchId: string,
    createdBy: string,
  ): Promise<RoomRow> {
    const existing = await client.query<RoomRow>(
      `SELECT r.*
       FROM lss_rooms r
       WHERE r.plan_id = $1
         AND r.branch_id = $2
         AND r.status = 'filling'
         AND (SELECT COALESCE(MAX(s.slot_number), 0) FROM lss_slots s WHERE s.room_id = r.id) < ${SLOTS_PER_ROOM}
       ORDER BY r.created_at ASC
       LIMIT 1
       FOR UPDATE`,
      [planId, branchId]
    );

    if (existing.rows.length > 0) {
      const room = existing.rows[0];
      if (isStaleFilling(room.status, room.fill_deadline)) {
        await client.query(
          `UPDATE lss_rooms SET status='pending_combine' WHERE id=$1`,
          [room.id]
        );
        // Fall through to create a NEW filling room — the old one is now
        // awaiting head-branch action.
      } else {
        return room;
      }
    }

    return this.createFreshFillingRoom(client, planId, branchId, createdBy);
  },

  // Returns an allocation plan for `quantity` slots across one or more rooms.
  // Each entry describes: which room, the first slot_number to write, and how many.
  //
  // Full room (quantity === SLOTS_PER_ROOM):
  //   Always gets a brand-new empty dedicated room; slots 1..20.
  //   Never mixed with existing single-slot buyers.
  //
  // Partial (quantity < SLOTS_PER_ROOM):
  //   Greedy: fill the current filling room to capacity first, then open a fresh
  //   room for any overflow.  Since quantity ≤ SLOTS_PER_ROOM-1 and a room holds
  //   SLOTS_PER_ROOM, at most 2 rooms are ever returned.
  //
  // The FOR UPDATE lock in findOrCreateFillingRoom serialises concurrent purchases
  // so the held-count check inside is safe within the caller's transaction.
  async allocateRoomsForPurchase(
    client: PoolClient,
    planId: string,
    branchId: string,
    createdBy: string,
    quantity: number,
  ): Promise<Array<{ room: RoomRow; firstSlotNumber: number; count: number }>> {
    // TS: full-room purchase always gets its own fresh empty room
    if (quantity === SLOTS_PER_ROOM) {
      const room = await this.createFreshFillingRoom(client, planId, branchId, createdBy);
      return [{ room, firstSlotNumber: 1, count: SLOTS_PER_ROOM }];
    }

    // Partial: lock the current filling room and find its highest-numbered slot
    const room      = await this.findOrCreateFillingRoom(client, planId, branchId, createdBy);
    // TS: maxSlot uses MAX(slot_number) across ALL statuses so refunded/voided slots
    // don't cause a UNIQUE(room_id, slot_number) violation on the next insert
    const maxSlot   = await this.maxSlotNumber(client, room.id);
    const available = SLOTS_PER_ROOM - maxSlot;

    if (quantity <= available) {
      // TS: entire purchase fits in the current room — single allocation
      return [{ room, firstSlotNumber: maxSlot + 1, count: quantity }];
    }

    // TS: purchase overflows — fill the current room, open a fresh room for the rest
    const allocations: Array<{ room: RoomRow; firstSlotNumber: number; count: number }> = [];
    if (available > 0) {
      // TS: current room still has space — fill it to capacity first
      allocations.push({ room, firstSlotNumber: maxSlot + 1, count: available });
    }
    const overflow   = quantity - available;
    const freshRoom  = await this.createFreshFillingRoom(client, planId, branchId, createdBy);
    // TS: remaining slots go into slot positions 1..overflow of the new room
    allocations.push({ room: freshRoom, firstSlotNumber: 1, count: overflow });
    return allocations;
  },

  // Always insert a brand-new empty filling room for (plan, branch).
  // Used by Full-room purchases, which must not land on a partially-filled room.
  async createFreshFillingRoom(
    client: PoolClient,
    planId: string,
    branchId: string,
    createdBy: string,
  ): Promise<RoomRow> {
    // Serialize concurrent room-creation for the same (plan, branch) so two
    // simultaneous overflow purchases cannot both read the same MAX(room_number)
    // and collide on the UNIQUE(plan_id, branch_id, room_number) constraint.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`,
      [planId, branchId]
    );
    // Determine next room_number for this (plan, branch)
    const seqRes = await client.query<{ next: number }>(
      `SELECT COALESCE(MAX(room_number), 0) + 1 AS next
       FROM lss_rooms WHERE plan_id = $1 AND branch_id = $2`,
      [planId, branchId]
    );
    const roomNumber = seqRes.rows[0].next;

    // Insert the new filling room. deadline = now + 30d
    const ins = await client.query<RoomRow>(
      `INSERT INTO lss_rooms
         (plan_id, branch_id, room_number, status, fill_deadline, created_by)
       VALUES ($1, $2, $3, 'filling', now() + INTERVAL '${FILL_WINDOW_DAYS} days', $4)
       RETURNING *`,
      [planId, branchId, roomNumber, createdBy]
    );
    return ins.rows[0];
  },

  async activate(db: Pool, roomId: string, activatedBy: string, notes?: string, callerBranchId?: string): Promise<RoomRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const room = await this.getRoomWithStaleCheck(client, roomId);
      if (callerBranchId && room.branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'LSS_ROOM_WRONG_BRANCH');
      }
      assertTransition(room.status, 'active');

      const countRes = await client.query<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM lss_slots WHERE room_id = $1 AND status = 'held'`,
        [roomId]
      );
      if (countRes.rows[0].n !== SLOTS_PER_ROOM) {
        throw new ValidationError(
          `Room must have exactly ${SLOTS_PER_ROOM} held slots before activation (currently ${countRes.rows[0].n})`,
          'LSS_ROOM_NOT_FULL'
        );
      }

      const firstDraw = nextDrawDate();
      const upd = await client.query<RoomRow>(
        `UPDATE lss_rooms
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

  async list(
    db: Pool,
    filters: { status?: RoomStatus; planId?: string; branchIds: string[] | null; search?: string; page: number; limit: number }
  ): Promise<{ data: any[]; total: number }> {
    await db.query(
      `UPDATE lss_rooms SET status='pending_combine'
       WHERE status='filling' AND fill_deadline <= now()`
    );

    const params: any[] = [];
    let where = '1=1';
    let idx = 1;
    if (filters.status)  { where += ` AND r.status = $${idx++}`;         params.push(filters.status); }
    if (filters.planId)  { where += ` AND r.plan_id = $${idx++}`;        params.push(filters.planId); }
    if (filters.branchIds !== null) {
      where += ` AND r.branch_id = ANY($${idx++}::uuid[])`;
      params.push(filters.branchIds);
    }

    // Search: room matches when any of its slots' customers match — same param index reused across OR
    let searchIdx: number | null = null;
    if (filters.search) {
      searchIdx = idx;
      where += ` AND EXISTS (
        SELECT 1 FROM lss_slots s
        JOIN customers c ON c.id = s.customer_id
        WHERE s.room_id = r.id
          AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})
      )`;
      params.push(`%${filters.search}%`);
      idx++;
    }

    const countRes = await db.query<{ n: string }>(
      `SELECT COUNT(*) AS n FROM lss_rooms r WHERE ${where}`,
      params
    );
    const total = parseInt(countRes.rows[0].n, 10);

    // When searching, include matched_slots so the UI can highlight which slots hit
    const matchedSlotsSelect = searchIdx !== null ? `,
         (SELECT json_agg(json_build_object('slot_number', s.slot_number, 'customer_name', c.name))
            FROM lss_slots s
            JOIN customers c ON c.id = s.customer_id
           WHERE s.room_id = r.id
             AND (c.name ILIKE $${searchIdx} OR c.phone ILIKE $${searchIdx} OR c.customer_code ILIKE $${searchIdx}))
           AS matched_slots` : '';

    const dataRes = await db.query(
      `SELECT
         r.*,
         p.name        AS plan_name,
         p.price       AS plan_price,
         b.name        AS branch_name,
         (SELECT COUNT(*)::int FROM lss_slots s WHERE s.room_id = r.id AND s.status = 'held') AS slots_filled,
         (SELECT COUNT(*)::int FROM lss_draws d WHERE d.room_id = r.id)                       AS draws_done${matchedSlotsSelect}
       FROM lss_rooms r
       JOIN lss_plans p  ON r.plan_id   = p.id
       JOIN branches b   ON r.branch_id = b.id
       WHERE ${where}
       ORDER BY r.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, filters.limit, (filters.page - 1) * filters.limit]
    );

    return { data: dataRes.rows, total };
  },

  async listAwaitingCombine(db: Pool): Promise<any[]> {
    await db.query(
      `UPDATE lss_rooms SET status='pending_combine'
       WHERE status='filling' AND fill_deadline <= now()`
    );
    const { rows } = await db.query(
      `SELECT
         r.*,
         p.name  AS plan_name,
         p.price AS plan_price,
         b.name  AS branch_name,
         COUNT(s.id) FILTER (WHERE s.status = 'held')::int AS slots_filled
       FROM lss_rooms r
       JOIN lss_plans p   ON p.id = r.plan_id
       JOIN branches b    ON b.id = r.branch_id
       LEFT JOIN lss_slots s ON s.room_id = r.id
       WHERE r.status = 'pending_combine'
       GROUP BY r.id, p.id, b.id
       ORDER BY r.created_at ASC`
    );
    return rows;
  },

  async getById(
    db: Pool,
    roomId: string,
    allowedBranchIds: string[] | null = null,
    allowPendingCombine = false,
  ): Promise<any> {
    const roomRes = await db.query(
      `SELECT r.*, p.name AS plan_name, p.price AS plan_price,
              b.name AS branch_name, b.is_head_branch AS room_branch_is_head
       FROM lss_rooms r
       JOIN lss_plans p  ON r.plan_id   = p.id
       JOIN branches b   ON r.branch_id = b.id
       WHERE r.id = $1`,
      [roomId]
    );
    if (roomRes.rows.length === 0) throw new NotFoundError('Room not found', 'LSS_ROOM_NOT_FOUND');

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
       FROM lss_slots s
       JOIN customers c ON s.customer_id = c.id
       LEFT JOIN users u ON s.referrer_id = u.id
       JOIN branches bs  ON s.branch_id  = bs.id
       WHERE s.room_id = $1
       ORDER BY s.slot_number ASC`,
      [roomId]
    );

    const drawsRes = await db.query(
      `SELECT d.*,
              s.slot_number AS winning_slot_number,
              c.name        AS winning_customer_name,
              c.customer_code
       FROM lss_draws d
       JOIN lss_slots s ON d.winning_slot_id = s.id
       JOIN customers c ON s.customer_id    = c.id
       WHERE d.room_id = $1
       ORDER BY d.draw_number ASC`,
      [roomId]
    );

    return { ...roomRes.rows[0], slots: slotsRes.rows, draws: drawsRes.rows };
  },

  async countHeldSlots(client: PoolClient, roomId: string): Promise<number> {
    const r = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM lss_slots WHERE room_id = $1 AND status = 'held'`,
      [roomId]
    );
    return r.rows[0].n;
  },

  // Highest slot_number assigned in a room across ALL statuses.
  // Used by allocateRoomsForPurchase for firstSlotNumber so refunded/voided
  // gaps don't cause a UNIQUE(room_id, slot_number) violation on the next insert.
  async maxSlotNumber(client: PoolClient, roomId: string): Promise<number> {
    const r = await client.query<{ n: number }>(
      `SELECT COALESCE(MAX(slot_number), 0)::int AS n FROM lss_slots WHERE room_id = $1`,
      [roomId]
    );
    return r.rows[0].n;
  },

  async sendToHeadBranch(db: Pool, roomId: string, callerBranchId: string): Promise<RoomRow> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const room = await this.getRoomWithStaleCheck(client, roomId);
      if (room.branch_id !== callerBranchId) {
        throw new ForbiddenError('Room belongs to a different branch', 'LSS_ROOM_WRONG_BRANCH');
      }

      assertTransition(room.status, 'pending_combine');

      const upd = await client.query<RoomRow>(
        `UPDATE lss_rooms SET status = 'pending_combine' WHERE id = $1 RETURNING *`,
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

  async markCompletedIfDone(client: PoolClient, roomId: string): Promise<boolean> {
    const r = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM lss_draws WHERE room_id = $1`,
      [roomId]
    );
    if (r.rows[0].n >= SLOTS_PER_ROOM) {
      await client.query(
        `UPDATE lss_rooms SET status = 'completed', completed_at = now() WHERE id = $1`,
        [roomId]
      );
      return true;
    }
    return false;
  },

  // ─── VOID ROOM (admin: MD / Management) ────────────────────────────────────
  async voidRoom(
    db: Pool,
    actorId: string,
    roomId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const roomRow = await client.query(
        `SELECT * FROM lss_rooms WHERE id = $1 AND branch_id = $2`,
        [roomId, branchId]
      );
      if (roomRow.rows.length === 0) throw new NotFoundError('Room not found');
      const room = roomRow.rows[0];
      if (room.status === 'voided') throw new ValidationError('Room is already voided');

      const slots = await client.query(
        `SELECT id, status FROM lss_slots WHERE room_id = $1 AND status NOT IN ('refunded','voided')`,
        [roomId]
      );

      for (const slot of slots.rows) {
        await client.query(`UPDATE lss_slots SET status = 'refunded' WHERE id = $1`, [slot.id]);
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     slot.id,
          paymentEvent: 'enrollment',
        });
      }

      await client.query(`UPDATE lss_rooms SET status = 'voided' WHERE id = $1`, [roomId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'room',
        entityId:   roomId,
        actorId,
        action:     'void',
        oldValues:  { ...room, slotsRefunded: slots.rows.length },
      });

      return { ...room, status: 'voided', slotsRefunded: slots.rows.length };
    });
  },

  // ─── DELETE ROOM (admin: MD / Management) ──────────────────────────────────
  // Permanently removes the room row and all child draws + slots from the DB,
  // clawing back every slot's incentive credits first. Allowed on any room status.
  // Deletion order resolves the FK cycle: NULL won_in_draw_id before deleting
  // draws, then slots, then the room itself.
  async deleteRoom(
    db: Pool,
    actorId: string,
    roomId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const roomRow = await client.query(
        `SELECT * FROM lss_rooms WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [roomId, branchId]
      );
      if (roomRow.rows.length === 0) throw new NotFoundError('Room not found');
      const room = roomRow.rows[0];

      const slots = await client.query(
        `SELECT id FROM lss_slots WHERE room_id = $1`,
        [roomId]
      );

      // Claw back incentives for every slot before destroying any rows.
      for (const slot of slots.rows) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode: SCHEME_CODE,
          sourceId:   slot.id,
        });
      }

      // Break the lss_slots.won_in_draw_id → lss_draws FK cycle so draws can be deleted.
      await client.query(`UPDATE lss_slots SET won_in_draw_id = NULL WHERE room_id = $1`, [roomId]);

      // If other rooms were combined into this one, NULL their pointer so this delete doesn't cascade-block.
      await client.query(`UPDATE lss_rooms SET combined_into_room_id = NULL WHERE combined_into_room_id = $1`, [roomId]);

      await client.query(`DELETE FROM lss_draws WHERE room_id = $1`, [roomId]);
      await client.query(`DELETE FROM lss_slots WHERE room_id = $1`, [roomId]);
      await client.query(`DELETE FROM lss_rooms WHERE id = $1`, [roomId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'room',
        entityId:   roomId,
        actorId,
        action:     'delete',
        oldValues:  { room, slotCount: slots.rows.length },
      });

      return { deleted: true, id: roomId };
    });
  },

  // ─── UPDATE ROOM DATES (admin: MD / Management) ──────────────────────────────
  // Back-office date correction for created_at, fill_deadline, or first_draw_date.
  // None of these columns affect employee_incentives so no incentive logic is needed.
  // At least one date field must be provided (enforced by UpdateRoomDatesSchema upstream).
  async updateRoomDates(
    db: Pool,
    actorId: string,
    roomId: string,
    branchId: string,
    dates: { createdAt?: string; fillDeadline?: string; firstDrawDate?: string }
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const roomRow = await client.query(
        `SELECT * FROM lss_rooms WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [roomId, branchId]
      );
      if (roomRow.rows.length === 0) throw new NotFoundError('Room not found');
      const before = roomRow.rows[0];

      // Build the SET clause dynamically — only the provided fields are written
      const fields: string[] = [];
      const vals: unknown[] = [];
      let idx = 1;
      if (dates.createdAt     != null) { fields.push(`created_at = $${idx++}::timestamptz`); vals.push(dates.createdAt); }
      if (dates.fillDeadline  != null) { fields.push(`fill_deadline = $${idx++}::date`);      vals.push(dates.fillDeadline); }
      if (dates.firstDrawDate != null) { fields.push(`first_draw_date = $${idx++}::date`);   vals.push(dates.firstDrawDate); }
      if (fields.length === 0) throw new ValidationError('No date fields to update');

      vals.push(roomId);
      const updated = await client.query(
        `UPDATE lss_rooms SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
        vals
      );

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'room',
        entityId:   roomId,
        actorId,
        action:     'edit',
        oldValues:  before,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

};

export const LSS_FILL_WINDOW_DAYS = FILL_WINDOW_DAYS;
export const LSS_SLOTS_PER_ROOM   = SLOTS_PER_ROOM;
