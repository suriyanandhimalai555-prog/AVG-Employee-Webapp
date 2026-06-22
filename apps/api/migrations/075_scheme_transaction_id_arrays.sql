-- Migration 075: transaction_id columns become arrays (support multiple references per payment).
-- 071 added a single VARCHAR(100) transaction id per payment event. A customer who splits a
-- payment across several UPI/bank transfers now needs to record each reference separately, so
-- each transaction_id column becomes TEXT[] (a list of reference strings). Column NAMES are
-- unchanged so every read query, route and frontend reference keeps working — only the type widens.
-- Existing single values are preserved as one-element arrays. Matches the same widening 069 did
-- for proof_key columns.

ALTER TABLE gold_scheme_payments
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

ALTER TABLE gold_coin_slots
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

ALTER TABLE lss_slots
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

ALTER TABLE trading_academy_members
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

ALTER TABLE agila_chit_payments
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

-- builders_plans: lump-sum payment from customer to company
ALTER TABLE builders_plans
  ALTER COLUMN lump_sum_transaction_id TYPE TEXT[]
  USING (CASE WHEN lump_sum_transaction_id IS NULL THEN NULL ELSE ARRAY[lump_sum_transaction_id] END);

-- builders_payouts: monthly disbursement from company to customer
ALTER TABLE builders_payouts
  ALTER COLUMN transaction_id TYPE TEXT[]
  USING (CASE WHEN transaction_id IS NULL THEN NULL ELSE ARRAY[transaction_id] END);

-- land_bookings: each money event (advance / full) gets its own transaction id array,
-- mirroring its own channel + proof key.
ALTER TABLE land_bookings
  ALTER COLUMN advance_transaction_id TYPE TEXT[]
  USING (CASE WHEN advance_transaction_id IS NULL THEN NULL ELSE ARRAY[advance_transaction_id] END);

ALTER TABLE land_bookings
  ALTER COLUMN full_transaction_id TYPE TEXT[]
  USING (CASE WHEN full_transaction_id IS NULL THEN NULL ELSE ARRAY[full_transaction_id] END);

ALTER TABLE land_buyback_payouts
  ALTER COLUMN paid_transaction_id TYPE TEXT[]
  USING (CASE WHEN paid_transaction_id IS NULL THEN NULL ELSE ARRAY[paid_transaction_id] END);
