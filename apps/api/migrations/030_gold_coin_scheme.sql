-- Migration 030: ONE TIME INVESTMENT GOLD COIN SCHEME
--
-- Customers buy gold-coin packages (10 price points: ₹12k / 1GM through
-- ₹1.2L / 10GM). Each room has exactly 16 slots; one slot is eliminated
-- per monthly draw on the 12th. A member may hold multiple slots.
--
-- Lifecycle:
--   filling          → slots are being collected (deadline = created_at + 30d)
--   pending_combine  → deadline passed without 16 slots; awaits head-branch action
--   combined_into    → absorbed by another room via head-branch combine
--   expired          → head-branch refunded; slots flagged refunded
--   active           → admin activated a 16-slot room; draws begin
--   completed        → all 16 draws done
--
-- Combined rooms live on the head branch (rooms.branch_id = head_branch.id,
-- is_combined = true) but each slot keeps its source branch_id so referral
-- commissions and per-branch reports still attribute correctly.

-- 1. Mark head-branch(es). Branch admin at a head branch unlocks combine/
--    refund/extend on cross-branch rooms.
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS is_head_branch BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_branches_head ON branches(is_head_branch) WHERE is_head_branch;

-- 2. Packages — the 10 price points. Seeded in migration 031.
CREATE TABLE IF NOT EXISTS gold_coin_packages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  price       NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  gold_grams  NUMERIC(8, 3)  NOT NULL CHECK (gold_grams > 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (price)
);

-- 3. Rooms — 16-slot containers.
CREATE TABLE IF NOT EXISTS gold_coin_rooms (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id             UUID NOT NULL REFERENCES gold_coin_packages(id),
  branch_id              UUID NOT NULL REFERENCES branches(id),
  room_number            INTEGER NOT NULL CHECK (room_number > 0),
  is_combined            BOOLEAN NOT NULL DEFAULT false,
  status                 VARCHAR(20) NOT NULL DEFAULT 'filling'
                         CHECK (status IN ('filling','pending_combine','combined_into','expired','active','completed')),
  fill_deadline          TIMESTAMPTZ NOT NULL,
  activated_at           TIMESTAMPTZ,
  activated_by           UUID REFERENCES users(id),
  first_draw_date        DATE,
  completed_at           TIMESTAMPTZ,
  combined_into_room_id  UUID REFERENCES gold_coin_rooms(id),
  notes                  TEXT,
  created_by             UUID NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (package_id, branch_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_gc_rooms_status         ON gold_coin_rooms(status);
CREATE INDEX IF NOT EXISTS idx_gc_rooms_branch         ON gold_coin_rooms(branch_id);
CREATE INDEX IF NOT EXISTS idx_gc_rooms_package        ON gold_coin_rooms(package_id);
CREATE INDEX IF NOT EXISTS idx_gc_rooms_pending_combine
  ON gold_coin_rooms(status, fill_deadline) WHERE status IN ('filling','pending_combine');

-- 4. Slots — one row per customer purchase. Up to 16 per room.
CREATE TABLE IF NOT EXISTS gold_coin_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES gold_coin_rooms(id),
  slot_number     INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 16),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  amount_paid     NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_mode    VARCHAR(20) NOT NULL DEFAULT 'cash'
                  CHECK (payment_mode IN ('cash','gpay','bank_receipt')),
  referrer_id     UUID REFERENCES users(id),
  status          VARCHAR(15) NOT NULL DEFAULT 'held'
                  CHECK (status IN ('held','won','refunded')),
  won_in_draw_id  UUID,                    -- FK added after gold_coin_draws exists
  notes           TEXT,
  entered_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (room_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_gc_slots_room      ON gold_coin_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_gc_slots_customer  ON gold_coin_slots(customer_id);
CREATE INDEX IF NOT EXISTS idx_gc_slots_referrer  ON gold_coin_slots(referrer_id);
CREATE INDEX IF NOT EXISTS idx_gc_slots_branch    ON gold_coin_slots(branch_id);
CREATE INDEX IF NOT EXISTS idx_gc_slots_status    ON gold_coin_slots(status);

-- 5. Draws — one per month, up to 16 per room.
CREATE TABLE IF NOT EXISTS gold_coin_draws (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          UUID NOT NULL REFERENCES gold_coin_rooms(id),
  draw_number      INTEGER NOT NULL CHECK (draw_number BETWEEN 1 AND 16),
  draw_date        DATE NOT NULL,
  winning_slot_id  UUID NOT NULL REFERENCES gold_coin_slots(id),
  drawn_by         UUID NOT NULL REFERENCES users(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (room_id, draw_number),
  UNIQUE (winning_slot_id)
);

CREATE INDEX IF NOT EXISTS idx_gc_draws_room ON gold_coin_draws(room_id);
CREATE INDEX IF NOT EXISTS idx_gc_draws_date ON gold_coin_draws(draw_date);

-- 6. Now the slot→draw FK (added after both tables exist)
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_won_in_draw_fk
    FOREIGN KEY (won_in_draw_id) REFERENCES gold_coin_draws(id);

-- 7. Invariant: a won slot must have a draw pointer; a held/refunded slot must not.
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_won_invariant
    CHECK (
      (status = 'won' AND won_in_draw_id IS NOT NULL) OR
      (status <> 'won' AND won_in_draw_id IS NULL)
    );
