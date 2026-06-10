-- Migration 064: Make soft-void actually work at the DB level.
--
-- Every scheme's voidXxx service method writes status='voided', but none of
-- the original CREATE TABLE CHECK constraints allow that value — so voids
-- fail with a CHECK violation. This migration widens each status CHECK to
-- include 'voided', and adds the status column to trading_academy_members
-- (which never had one despite voidMember writing to it).
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent,
-- and ADD COLUMN IF NOT EXISTS guards the trading academy change.

-- 1. Trading Academy: the table has no status column at all.
ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

ALTER TABLE trading_academy_members
  DROP CONSTRAINT IF EXISTS trading_academy_members_status_check;
ALTER TABLE trading_academy_members
  ADD CONSTRAINT trading_academy_members_status_check
  CHECK (status IN ('active', 'voided'));

-- 2. Gold scheme members: ('active','completed','withdrawn') + voided
ALTER TABLE gold_scheme_members
  DROP CONSTRAINT IF EXISTS gold_scheme_members_status_check;
ALTER TABLE gold_scheme_members
  ADD CONSTRAINT gold_scheme_members_status_check
  CHECK (status IN ('active', 'completed', 'withdrawn', 'voided'));

-- 3. Agila chit members: ('active','cancelled') + voided
ALTER TABLE agila_chit_members
  DROP CONSTRAINT IF EXISTS agila_chit_members_status_check;
ALTER TABLE agila_chit_members
  ADD CONSTRAINT agila_chit_members_status_check
  CHECK (status IN ('active', 'cancelled', 'voided'));

-- 4. Gold coin slots: ('held','won','refunded') + voided
ALTER TABLE gold_coin_slots
  DROP CONSTRAINT IF EXISTS gold_coin_slots_status_check;
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_status_check
  CHECK (status IN ('held', 'won', 'refunded', 'voided'));

-- 5. LSS slots: ('held','won','refunded') + voided
ALTER TABLE lss_slots
  DROP CONSTRAINT IF EXISTS lss_slots_status_check;
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_status_check
  CHECK (status IN ('held', 'won', 'refunded', 'voided'));

-- 6. Gold coin rooms: lifecycle list + voided
ALTER TABLE gold_coin_rooms
  DROP CONSTRAINT IF EXISTS gold_coin_rooms_status_check;
ALTER TABLE gold_coin_rooms
  ADD CONSTRAINT gold_coin_rooms_status_check
  CHECK (status IN ('filling', 'pending_combine', 'combined_into', 'expired', 'active', 'completed', 'voided'));

-- 7. LSS rooms: lifecycle list + voided
ALTER TABLE lss_rooms
  DROP CONSTRAINT IF EXISTS lss_rooms_status_check;
ALTER TABLE lss_rooms
  ADD CONSTRAINT lss_rooms_status_check
  CHECK (status IN ('filling', 'pending_combine', 'combined_into', 'expired', 'active', 'completed', 'voided'));

-- 8. Builders plans: lifecycle list + voided
ALTER TABLE builders_plans
  DROP CONSTRAINT IF EXISTS builders_plans_status_check;
ALTER TABLE builders_plans
  ADD CONSTRAINT builders_plans_status_check
  CHECK (status IN ('cooling', 'active', 'decision_pending', 'house', 'cash', 'completed', 'cancelled', 'voided'));

-- 9. Land bookings: lifecycle list + voided
ALTER TABLE land_bookings
  DROP CONSTRAINT IF EXISTS land_bookings_status_check;
ALTER TABLE land_bookings
  ADD CONSTRAINT land_bookings_status_check
  CHECK (status IN ('booked', 'advance_paid', 'full_paid', 'cancelled', 'completed', 'voided'));
