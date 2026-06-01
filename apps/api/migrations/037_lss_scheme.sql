-- Migration 037: LSS SCHEME
--
-- Customers buy LSS plans (5 price points: ₹5k–₹25k). Each room has exactly
-- 20 slots; one slot is eliminated per monthly draw on the 12th. Payout grows
-- with draw number: value(level, plan) = plan × (1.5 + level × 0.025).
--
-- Lifecycle (identical to Gold Coin):
--   filling          → slots are being collected (deadline = created_at + 30d)
--   pending_combine  → deadline passed without 20 slots; awaits head-branch action
--   combined_into    → absorbed by another room via head-branch combine
--   expired          → head-branch refunded; slots flagged refunded
--   active           → admin activated a 20-slot room; draws begin
--   completed        → all 20 draws done
--
-- is_head_branch on branches is already present (added by migration 030).

-- 1. Plans — the 5 price points. Seeded in migration 038.
CREATE TABLE IF NOT EXISTS lss_plans (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  price       NUMERIC(12, 2) NOT NULL CHECK (price > 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (price)
);

-- 2. Rooms — 20-slot containers.
CREATE TABLE IF NOT EXISTS lss_rooms (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id                UUID NOT NULL REFERENCES lss_plans(id),
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
  combined_into_room_id  UUID REFERENCES lss_rooms(id),
  notes                  TEXT,
  created_by             UUID NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ DEFAULT now(),
  UNIQUE (plan_id, branch_id, room_number)
);

CREATE INDEX IF NOT EXISTS idx_lss_rooms_status         ON lss_rooms(status);
CREATE INDEX IF NOT EXISTS idx_lss_rooms_branch         ON lss_rooms(branch_id);
CREATE INDEX IF NOT EXISTS idx_lss_rooms_plan           ON lss_rooms(plan_id);
CREATE INDEX IF NOT EXISTS idx_lss_rooms_pending_combine
  ON lss_rooms(status, fill_deadline) WHERE status IN ('filling','pending_combine');

-- 3. Slots — one row per customer purchase. Up to 20 per room.
CREATE TABLE IF NOT EXISTS lss_slots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id         UUID NOT NULL REFERENCES lss_rooms(id),
  slot_number     INTEGER NOT NULL CHECK (slot_number BETWEEN 1 AND 20),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  amount_paid     NUMERIC(12, 2) NOT NULL CHECK (amount_paid > 0),
  paid_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  payment_mode    VARCHAR(20) NOT NULL DEFAULT 'cash'
                  CHECK (payment_mode IN ('cash','gpay','bank_receipt')),
  referrer_id     UUID REFERENCES users(id),
  status          VARCHAR(15) NOT NULL DEFAULT 'held'
                  CHECK (status IN ('held','won','refunded')),
  won_in_draw_id  UUID,                    -- FK added after lss_draws exists
  notes           TEXT,
  entered_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (room_id, slot_number)
);

CREATE INDEX IF NOT EXISTS idx_lss_slots_room      ON lss_slots(room_id);
CREATE INDEX IF NOT EXISTS idx_lss_slots_customer  ON lss_slots(customer_id);
CREATE INDEX IF NOT EXISTS idx_lss_slots_referrer  ON lss_slots(referrer_id);
CREATE INDEX IF NOT EXISTS idx_lss_slots_branch    ON lss_slots(branch_id);
CREATE INDEX IF NOT EXISTS idx_lss_slots_status    ON lss_slots(status);

-- 4. Draws — one per month, up to 20 per room.
--    payout_amount is denormalised for audit: plan.price × (1.5 + draw_number × 0.025).
--    Stored so the payout record survives any future formula changes.
CREATE TABLE IF NOT EXISTS lss_draws (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id          UUID NOT NULL REFERENCES lss_rooms(id),
  draw_number      INTEGER NOT NULL CHECK (draw_number BETWEEN 1 AND 20),
  draw_date        DATE NOT NULL,
  winning_slot_id  UUID NOT NULL REFERENCES lss_slots(id),
  payout_amount    NUMERIC(12, 2) NOT NULL CHECK (payout_amount > 0),
  drawn_by         UUID NOT NULL REFERENCES users(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (room_id, draw_number),
  UNIQUE (winning_slot_id)
);

CREATE INDEX IF NOT EXISTS idx_lss_draws_room ON lss_draws(room_id);
CREATE INDEX IF NOT EXISTS idx_lss_draws_date ON lss_draws(draw_date);

-- 5. Now the slot→draw FK (added after both tables exist)
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_won_in_draw_fk
    FOREIGN KEY (won_in_draw_id) REFERENCES lss_draws(id);

-- 6. Invariant: a won slot must have a draw pointer; a held/refunded slot must not.
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_won_invariant
    CHECK (
      (status = 'won' AND won_in_draw_id IS NOT NULL) OR
      (status <> 'won' AND won_in_draw_id IS NULL)
    );
