-- Migration 032: Add Full-room packages to the Gold Coin scheme.
--
-- Before this migration, every package was a per-slot SKU (10 packages,
-- ₹12k–₹1.2L, slots_per_purchase implicitly 1). Selling a Full room meant
-- buying 16 slots of a Single package in one transaction.
--
-- This migration adds 10 new packages where one purchase IS a full room:
--   slots_per_purchase = 16
--   price              = full-room price (e.g. ₹1,92,000 = 16 × ₹12,000)
--   gold_grams         = full-room gold (e.g. 16GM)
--
-- The per-slot value stored on each gold_coin_slots row stays consistent
-- across both SKU types: price / slots_per_purchase (so a Full 16GM Pack
-- stores 12000/slot, same as a 1GM Single Pack).

ALTER TABLE gold_coin_packages
  ADD COLUMN IF NOT EXISTS slots_per_purchase INTEGER NOT NULL DEFAULT 1
    CHECK (slots_per_purchase IN (1, 16));

INSERT INTO gold_coin_packages (name, price, gold_grams, slots_per_purchase) VALUES
  ('Full 16GM Pack',    192000,  16, 16),
  ('Full 32GM Pack',    384000,  32, 16),
  ('Full 48GM Pack',    576000,  48, 16),
  ('Full 64GM Pack',    768000,  64, 16),
  ('Full 80GM Pack',    960000,  80, 16),
  ('Full 96GM Pack',   1152000,  96, 16),
  ('Full 112GM Pack',  1344000, 112, 16),
  ('Full 128GM Pack',  1536000, 128, 16),
  ('Full 144GM Pack',  1728000, 144, 16),
  ('Full 160GM Pack',  1920000, 160, 16)
ON CONFLICT (price) DO NOTHING;
