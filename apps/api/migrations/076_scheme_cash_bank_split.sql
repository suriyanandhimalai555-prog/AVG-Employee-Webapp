-- Migration 076: add a "cash + bank" split payment mode to scheme payments.
-- Until now a payment row carried a single payment_mode (cash | gpay | bank_receipt).
-- A customer sometimes settles one payment partly in cash and partly by bank transfer;
-- there was no way to record that split. This adds a 4th mode 'cash_bank' to every
-- in-scope scheme payment table and two nullable columns that record how the row's own
-- amount divides between cash and bank. The existing proof_key / transaction_id arrays
-- carry the bank portion's proof + references (cash needs none).
--
-- Storage rule (uniform across tables): the split is PER ROW and must sum to that row's
-- own amount column. Single-payment rows (gold/trading/chit/builders) check against the
-- payment amount; gold-coin / lss rows are per-slot, so the split checks against the
-- per-slot amount_paid. Columns stay NULL for the non-split modes — no backfill needed.
--
-- Land scheme is intentionally excluded: it uses a different payment_mode enum
-- (full_payment / advance_full_payment) and separate advance/full channels.

-- ─── gold_scheme_payments (total column: amount) ──────────────────────────────
ALTER TABLE gold_scheme_payments
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE gold_scheme_payments DROP CONSTRAINT IF EXISTS gold_scheme_payments_payment_mode_check;
ALTER TABLE gold_scheme_payments
  ADD CONSTRAINT gold_scheme_payments_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE gold_scheme_payments
  ADD CONSTRAINT gold_scheme_payments_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount));

-- ─── trading_academy_members (total column: amount) ───────────────────────────
ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE trading_academy_members DROP CONSTRAINT IF EXISTS trading_academy_members_payment_mode_check;
ALTER TABLE trading_academy_members
  ADD CONSTRAINT trading_academy_members_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE trading_academy_members
  ADD CONSTRAINT trading_academy_members_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount));

-- ─── gold_coin_slots (per-slot column: amount_paid) ───────────────────────────
ALTER TABLE gold_coin_slots
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE gold_coin_slots DROP CONSTRAINT IF EXISTS gold_coin_slots_payment_mode_check;
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount_paid));

-- ─── lss_slots (per-slot column: amount_paid) ─────────────────────────────────
ALTER TABLE lss_slots
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE lss_slots DROP CONSTRAINT IF EXISTS lss_slots_payment_mode_check;
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount_paid));

-- ─── agila_chit_payments (total column: amount) ───────────────────────────────
ALTER TABLE agila_chit_payments
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE agila_chit_payments DROP CONSTRAINT IF EXISTS agila_chit_payments_payment_mode_check;
ALTER TABLE agila_chit_payments
  ADD CONSTRAINT agila_chit_payments_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE agila_chit_payments
  ADD CONSTRAINT agila_chit_payments_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount));

-- ─── builders_payouts (total column: amount) ──────────────────────────────────
ALTER TABLE builders_payouts
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS bank_amount NUMERIC(12, 2);
ALTER TABLE builders_payouts DROP CONSTRAINT IF EXISTS builders_payouts_payment_mode_check;
ALTER TABLE builders_payouts
  ADD CONSTRAINT builders_payouts_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE builders_payouts
  ADD CONSTRAINT builders_payouts_cash_bank_sum_check
  CHECK (payment_mode <> 'cash_bank'
         OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount));

-- ─── builders_plans lump-sum (total column: investment_amount) ────────────────
-- The customer's one-time lump sum into the scheme. Its own mode column is
-- lump_sum_mode, so the split columns are prefixed to match (lump_sum_cash_amount …).
ALTER TABLE builders_plans
  ADD COLUMN IF NOT EXISTS lump_sum_cash_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS lump_sum_bank_amount NUMERIC(12, 2);
ALTER TABLE builders_plans DROP CONSTRAINT IF EXISTS builders_plans_lump_sum_mode_check;
ALTER TABLE builders_plans
  ADD CONSTRAINT builders_plans_lump_sum_mode_check
  CHECK (lump_sum_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank'));
ALTER TABLE builders_plans
  ADD CONSTRAINT builders_plans_lump_sum_cash_bank_sum_check
  CHECK (lump_sum_mode <> 'cash_bank'
         OR (lump_sum_cash_amount > 0 AND lump_sum_bank_amount > 0
             AND lump_sum_cash_amount + lump_sum_bank_amount = investment_amount));
