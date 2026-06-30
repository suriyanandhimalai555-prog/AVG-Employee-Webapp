-- 078_scheme_slot_batch_id.sql
-- Add batch_id UUID to gold_coin_slots and lss_slots.
--
-- Purpose: a stable, durable, cross-room purchase identity.
-- Replaces the (room_id, customer_id, created_at) heuristic used in correctSlot,
-- which collapses when two backdated purchases by the same customer share a sale date.
-- batch_id also survives combineRooms (which reassigns room_id/slot_number).
--
-- NO column DEFAULT is set intentionally: createSlot generates one uuid per call
-- and writes it to every slot it inserts. A per-row default would give each slot
-- its own id and silently break batch grouping.
--
-- Backfill uses the OLD batch key (room_id, customer_id, created_at) so historical
-- correctSlot operations behave identically after the migration.

BEGIN;

-- ── gold_coin_slots ──────────────────────────────────────────────────────────

ALTER TABLE gold_coin_slots ADD COLUMN batch_id UUID;

-- Backfill: one uuid per (room_id, customer_id, created_at) group = one purchase
UPDATE gold_coin_slots gs
SET batch_id = sub.bid
FROM (
  SELECT room_id, customer_id, created_at, gen_random_uuid() AS bid
  FROM   gold_coin_slots
  GROUP  BY room_id, customer_id, created_at
) sub
WHERE gs.room_id     = sub.room_id
  AND gs.customer_id = sub.customer_id
  AND gs.created_at  = sub.created_at;

ALTER TABLE gold_coin_slots ALTER COLUMN batch_id SET NOT NULL;

CREATE INDEX idx_gold_coin_slots_batch_id ON gold_coin_slots (batch_id);

-- ── lss_slots ────────────────────────────────────────────────────────────────

ALTER TABLE lss_slots ADD COLUMN batch_id UUID;

UPDATE lss_slots ls
SET batch_id = sub.bid
FROM (
  SELECT room_id, customer_id, created_at, gen_random_uuid() AS bid
  FROM   lss_slots
  GROUP  BY room_id, customer_id, created_at
) sub
WHERE ls.room_id     = sub.room_id
  AND ls.customer_id = sub.customer_id
  AND ls.created_at  = sub.created_at;

ALTER TABLE lss_slots ALTER COLUMN batch_id SET NOT NULL;

CREATE INDEX idx_lss_slots_batch_id ON lss_slots (batch_id);

COMMIT;
