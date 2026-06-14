-- Migration 069: payment proof keys become arrays (support multiple images per proof).
-- 068 added a single VARCHAR(255) proof key per payment event. A collector may have
-- more than one receipt/screenshot, so each proof column becomes TEXT[] (a list of
-- S3 keys, all living under money/{mode}/…). Column NAMES are unchanged so every
-- read query, route and frontend reference keeps working — only the type widens.
-- Existing single values are preserved as one-element arrays.

ALTER TABLE gold_scheme_payments
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE gold_coin_slots
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE lss_slots
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE trading_academy_members
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE agila_chit_payments
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE builders_plans
  ALTER COLUMN lump_sum_proof_key TYPE TEXT[]
  USING (CASE WHEN lump_sum_proof_key IS NULL THEN NULL ELSE ARRAY[lump_sum_proof_key] END);

ALTER TABLE builders_payouts
  ALTER COLUMN proof_key TYPE TEXT[]
  USING (CASE WHEN proof_key IS NULL THEN NULL ELSE ARRAY[proof_key] END);

ALTER TABLE land_bookings
  ALTER COLUMN advance_proof_key TYPE TEXT[]
  USING (CASE WHEN advance_proof_key IS NULL THEN NULL ELSE ARRAY[advance_proof_key] END);

ALTER TABLE land_bookings
  ALTER COLUMN full_proof_key TYPE TEXT[]
  USING (CASE WHEN full_proof_key IS NULL THEN NULL ELSE ARRAY[full_proof_key] END);

ALTER TABLE land_buyback_payouts
  ALTER COLUMN paid_proof_key TYPE TEXT[]
  USING (CASE WHEN paid_proof_key IS NULL THEN NULL ELSE ARRAY[paid_proof_key] END);
