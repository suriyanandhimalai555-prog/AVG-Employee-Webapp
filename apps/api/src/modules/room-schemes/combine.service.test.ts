import { describe, it, expect } from 'vitest';
import type { Pool } from 'pg';
import { createRoomCombineService, type RoomCombineConfig } from './combine.service';

// The two real configurations (mirrors gold-coin/combine.service.ts and lss/combine.service.ts).
const GOLD_COIN: RoomCombineConfig = {
  roomsTable: 'gold_coin_rooms', slotsTable: 'gold_coin_slots', packageColumn: 'package_id',
  errorPrefix: 'GC', slotsPerRoom: 16, fillWindowDays: 30,
};
const LSS: RoomCombineConfig = {
  roomsTable: 'lss_rooms', slotsTable: 'lss_slots', packageColumn: 'plan_id',
  errorPrefix: 'LSS', slotsPerRoom: 20, fillWindowDays: 30,
};

// Minimal pg stand-in: records every statement and answers from a scripted responder.
function fakeDb(respond: (sql: string, params: unknown[]) => { rows: any[]; rowCount?: number }) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const query = async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (/^(BEGIN|COMMIT|ROLLBACK)$/.test(sql)) return { rows: [], rowCount: 0 };
    return respond(sql, params);
  };
  const client = { query, release: () => undefined };
  // TS: cast — the service only uses query() and connect() from the Pool surface
  const db = { query, connect: async () => client } as unknown as Pool;
  return { db, calls };
}

// Scripted DB for a successful combine of two pending rooms holding `held` slots in total.
function combineScenario(cfg: RoomCombineConfig, held: number) {
  return fakeDb((sql) => {
    if (sql.includes('FOR UPDATE') && sql.includes(`FROM ${cfg.roomsTable}`)) {
      return { rows: [
        { id: 'a', [cfg.packageColumn]: 'pkg-1', status: 'pending_combine', branch_id: 'b1' },
        { id: 'b', [cfg.packageColumn]: 'pkg-1', status: 'pending_combine', branch_id: 'b2' },
      ] };
    }
    if (sql.includes(`SELECT id, room_id FROM ${cfg.slotsTable}`)) {
      return { rows: Array.from({ length: held }, (_, i) => ({ id: `s${i}`, room_id: i % 2 ? 'a' : 'b' })) };
    }
    if (sql.includes('COALESCE(MAX(room_number), 0) + 1')) return { rows: [{ next: 7 }] };
    if (sql.startsWith(`INSERT INTO ${cfg.roomsTable}`)) return { rows: [{ id: 'new-room' }] };
    if (sql.includes('COUNT(*)::int AS n')) return { rows: [{ n: 0 }] };
    return { rows: [], rowCount: 1 };
  });
}

describe.each([['Gold Coin', GOLD_COIN], ['LSS', LSS]])('room combine service — %s', (_name, cfg) => {
  const other = cfg === GOLD_COIN ? LSS : GOLD_COIN;

  it('only ever touches its own scheme tables', async () => {
    const { db, calls } = combineScenario(cfg, cfg.slotsPerRoom + 3);
    await createRoomCombineService(cfg).combineRooms(db, ['b', 'a'], 'head', 'actor');
    const sql = calls.map((c) => c.sql).join('\n');
    expect(sql).toContain(cfg.roomsTable);
    expect(sql).toContain(cfg.slotsTable);
    expect(sql).not.toContain(other.roomsTable);
    expect(sql).not.toContain(other.slotsTable);
  });

  it('moves exactly one room of slots, renumbered from 1, and absorbs emptied rooms', async () => {
    const { db, calls } = combineScenario(cfg, cfg.slotsPerRoom + 3);
    const result = await createRoomCombineService(cfg).combineRooms(db, ['b', 'a'], 'head', 'actor', 'note');
    expect(result).toEqual({ combinedRoom: { id: 'new-room' }, slotsMoved: cfg.slotsPerRoom, sourceRooms: 2 });
    const moves = calls.filter((c) => c.sql.startsWith(`UPDATE ${cfg.slotsTable} SET room_id`));
    expect(moves).toHaveLength(cfg.slotsPerRoom);
    expect(moves.map((m) => m.params[1])).toEqual(Array.from({ length: cfg.slotsPerRoom }, (_, i) => i + 1));
    // The new room is created for the head branch with the source package and the fill window.
    const insert = calls.find((c) => c.sql.startsWith(`INSERT INTO ${cfg.roomsTable}`))!;
    expect(insert.sql).toContain(`(${cfg.packageColumn}, branch_id, room_number`);
    expect(insert.sql).toContain(`INTERVAL '${cfg.fillWindowDays} days'`);
    expect(insert.params).toEqual(['pkg-1', 'head', 7, 'actor', 'note']);
  });

  it('refuses to combine when the sources hold fewer slots than one room', async () => {
    const { db, calls } = combineScenario(cfg, cfg.slotsPerRoom - 1);
    await expect(createRoomCombineService(cfg).combineRooms(db, ['a', 'b'], 'head', 'actor'))
      .rejects.toMatchObject({ code: `${cfg.errorPrefix}_COMBINE_NOT_ENOUGH_SLOTS` });
    expect(calls.map((c) => c.sql)).toContain('ROLLBACK');
  });

  it('needs at least two source rooms', async () => {
    const { db } = combineScenario(cfg, cfg.slotsPerRoom);
    await expect(createRoomCombineService(cfg).combineRooms(db, ['a'], 'head', 'actor'))
      .rejects.toMatchObject({ code: `${cfg.errorPrefix}_COMBINE_TOO_FEW` });
  });

  it('refund marks held slots refunded and expires the room', async () => {
    const { db, calls } = fakeDb((sql) => {
      if (sql.startsWith('SELECT status, branch_id')) return { rows: [{ status: 'pending_combine', branch_id: 'head' }] };
      if (sql.startsWith(`UPDATE ${cfg.slotsTable} SET status = 'refunded'`)) return { rows: [{ id: 1 }, { id: 2 }], rowCount: 2 };
      return { rows: [], rowCount: 1 };
    });
    const result = await createRoomCombineService(cfg).refundRoom(db, 'room-1', 'head', 'why');
    expect(result).toEqual({ slotsRefunded: 2 });
    expect(calls.some((c) => c.sql.startsWith(`UPDATE ${cfg.roomsTable}`) && c.sql.includes("status = 'expired'"))).toBe(true);
  });

  it('refund is rejected for a room owned by another branch', async () => {
    const { db } = fakeDb(() => ({ rows: [{ status: 'pending_combine', branch_id: 'elsewhere' }] }));
    await expect(createRoomCombineService(cfg).refundRoom(db, 'room-1', 'head'))
      .rejects.toMatchObject({ code: `${cfg.errorPrefix}_ROOM_WRONG_BRANCH` });
  });

  it('only a head-branch branch_admin passes the permission check', async () => {
    const svc = createRoomCombineService(cfg);
    const ok = fakeDb(() => ({ rows: [{ branch_id: 'head', role: 'branch_admin', is_head: true }] }));
    await expect(svc.assertHeadBranchAdmin(ok.db, 'u1')).resolves.toEqual({ headBranchId: 'head' });
    const notHead = fakeDb(() => ({ rows: [{ branch_id: 'b9', role: 'branch_admin', is_head: false }] }));
    await expect(svc.assertHeadBranchAdmin(notHead.db, 'u1')).rejects.toMatchObject({ code: `${cfg.errorPrefix}_HEAD_PERM` });
  });
});
