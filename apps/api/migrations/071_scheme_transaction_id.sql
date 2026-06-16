-- Migration 071: Add transaction_id columns to all scheme payment tables.
-- When a customer pays via gpay or bank_receipt, the collector must now also
-- record the payment reference (UPI transaction id / bank reference number)
-- alongside the proof image. Single scalar text per payment event.
-- All columns nullable — existing rows and cash payments carry no transaction id.

ALTER TABLE gold_scheme_payments
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

ALTER TABLE gold_coin_slots
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

ALTER TABLE lss_slots
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

ALTER TABLE agila_chit_payments
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

-- builders_plans: lump-sum payment from customer to company
ALTER TABLE builders_plans
  ADD COLUMN IF NOT EXISTS lump_sum_transaction_id VARCHAR(100);

-- builders_payouts: monthly disbursement from company to customer
ALTER TABLE builders_payouts
  ADD COLUMN IF NOT EXISTS transaction_id VARCHAR(100);

-- land_bookings: each money event (advance / full) gets its own transaction id,
-- mirroring its own channel + proof key.
ALTER TABLE land_bookings
  ADD COLUMN IF NOT EXISTS advance_transaction_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS full_transaction_id    VARCHAR(100);

ALTER TABLE land_buyback_payouts
  ADD COLUMN IF NOT EXISTS paid_transaction_id VARCHAR(100);
