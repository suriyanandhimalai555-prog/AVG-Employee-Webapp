-- Migration 068: Add proof_key columns to all scheme payment tables.
-- When a customer pays via gpay or bank_receipt, the collector must attach
-- a receipt photo. The S3 key is stored here; the file lives in money/{mode}/…
-- (reusing the existing money upload/download endpoints).
-- All columns nullable — existing rows and cash payments carry no proof.

ALTER TABLE gold_scheme_payments
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

ALTER TABLE gold_coin_slots
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

ALTER TABLE lss_slots
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

ALTER TABLE agila_chit_payments
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

-- builders_plans: lump-sum payment from customer to company
ALTER TABLE builders_plans
  ADD COLUMN IF NOT EXISTS lump_sum_proof_key VARCHAR(255);

-- builders_payouts: monthly disbursement from company to customer
ALTER TABLE builders_payouts
  ADD COLUMN IF NOT EXISTS proof_key VARCHAR(255);

-- land_bookings: payment_mode is the PLAN TYPE (full_payment / advance_full_payment),
-- not a tender. Each money event gets its own channel + proof key.
ALTER TABLE land_bookings
  ADD COLUMN IF NOT EXISTS advance_channel   VARCHAR(20)
    CHECK (advance_channel   IN ('cash', 'gpay', 'bank_receipt')),
  ADD COLUMN IF NOT EXISTS advance_proof_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS full_channel      VARCHAR(20)
    CHECK (full_channel      IN ('cash', 'gpay', 'bank_receipt')),
  ADD COLUMN IF NOT EXISTS full_proof_key    VARCHAR(255);

ALTER TABLE land_buyback_payouts
  ADD COLUMN IF NOT EXISTS paid_channel    VARCHAR(20)
    CHECK (paid_channel    IN ('cash', 'gpay', 'bank_receipt')),
  ADD COLUMN IF NOT EXISTS paid_proof_key  VARCHAR(255);
