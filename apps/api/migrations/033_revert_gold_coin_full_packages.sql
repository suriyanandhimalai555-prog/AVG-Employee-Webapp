-- Migration 033: Revert migration 032.
--
-- Migration 032 added 10 "Full-room" SKUs and a slots_per_purchase column.
-- That model was the wrong interpretation of the customer requirement, so
-- this migration removes both. After this runs the table is back to the
-- 10 per-slot packages seeded in migration 031.

-- Safe because: no gold_coin_rooms or gold_coin_slots reference these
-- packages yet (verified before writing the migration).
DELETE FROM gold_coin_packages WHERE slots_per_purchase = 16;

ALTER TABLE gold_coin_packages DROP COLUMN IF EXISTS slots_per_purchase;
