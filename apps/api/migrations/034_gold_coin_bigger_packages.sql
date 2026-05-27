-- Migration 034: Add 10 bigger per-slot packages to the Gold Coin scheme.
--
-- These are NORMAL packages (anyone can buy a slot — rooms still hold 16
-- customers). The pricing tier just extends upward:
--
--   Original (031): ₹12k–₹1.2L per slot, 1–10GM per slot
--   New      (034): ₹1.92L–₹19.2L per slot, 16–160GM per slot
--
-- For each new package, a Full room of 16 customers totals 16 × price,
-- and the chart on the landing page shows that automatically.

INSERT INTO gold_coin_packages (name, price, gold_grams) VALUES
  ('16GM Package',    192000,  16),
  ('32GM Package',    384000,  32),
  ('48GM Package',    576000,  48),
  ('64GM Package',    768000,  64),
  ('80GM Package',    960000,  80),
  ('96GM Package',   1152000,  96),
  ('112GM Package',  1344000, 112),
  ('128GM Package',  1536000, 128),
  ('144GM Package',  1728000, 144),
  ('160GM Package',  1920000, 160)
ON CONFLICT (price) DO NOTHING;
