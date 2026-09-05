-- Migration 081: add a "cash + GPay" split payment mode to scheme payments.
-- Mirrors migration 076 (cash_bank) exactly, but for a cash + GPay split.
-- A customer sometimes settles one payment partly in cash and partly by GPay;
-- there was no way to record that split without corrupting the MD dashboard
-- cash/bank/gpay breakdown. The gpay_amount column stores the GPay portion —
-- a separate, semantically correct bucket alongside the existing cash_amount
-- (always the cash half) and bank_amount (always the bank half). A future
-- bank+gpay mode could reuse both bank_amount + gpay_amount with zero new columns.
--
-- Storage rule (uniform across tables): the split is PER ROW and must sum to
-- that row's own amount column. Columns stay NULL for non-split modes.
--
-- All ADD CONSTRAINT statements are preceded by DROP CONSTRAINT IF EXISTS so
-- the entire file is fully idempotent — safe to re-run after a partial failure
-- (defuses the run_migrations.js "already-exists → skip rest of file" footgun,
-- GAPS.md #2). ADD COLUMN IF NOT EXISTS is natively idempotent.
--
-- Land scheme is intentionally excluded: it uses a different payment_mode enum
-- (full_payment / advance_full_payment) and per-channel advance/full columns,
-- consistent with migration 076.

-- ─── gold_scheme_payments (total column: amount) ──────────────────────────────
ALTER TABLE gold_scheme_payments
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE gold_scheme_payments DROP CONSTRAINT IF EXISTS gold_scheme_payments_payment_mode_check;
ALTER TABLE gold_scheme_payments
  ADD CONSTRAINT gold_scheme_payments_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE gold_scheme_payments DROP CONSTRAINT IF EXISTS gold_scheme_payments_cash_gpay_sum_check;
ALTER TABLE gold_scheme_payments
  ADD CONSTRAINT gold_scheme_payments_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount));

-- ─── trading_academy_members (total column: amount) ───────────────────────────
ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE trading_academy_members DROP CONSTRAINT IF EXISTS trading_academy_members_payment_mode_check;
ALTER TABLE trading_academy_members
  ADD CONSTRAINT trading_academy_members_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE trading_academy_members DROP CONSTRAINT IF EXISTS trading_academy_members_cash_gpay_sum_check;
ALTER TABLE trading_academy_members
  ADD CONSTRAINT trading_academy_members_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount));

-- ─── gold_coin_slots (per-slot column: amount_paid) ───────────────────────────
ALTER TABLE gold_coin_slots
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE gold_coin_slots DROP CONSTRAINT IF EXISTS gold_coin_slots_payment_mode_check;
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE gold_coin_slots DROP CONSTRAINT IF EXISTS gold_coin_slots_cash_gpay_sum_check;
ALTER TABLE gold_coin_slots
  ADD CONSTRAINT gold_coin_slots_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount_paid));

-- ─── lss_slots (per-slot column: amount_paid) ─────────────────────────────────
ALTER TABLE lss_slots
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE lss_slots DROP CONSTRAINT IF EXISTS lss_slots_payment_mode_check;
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE lss_slots DROP CONSTRAINT IF EXISTS lss_slots_cash_gpay_sum_check;
ALTER TABLE lss_slots
  ADD CONSTRAINT lss_slots_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount_paid));

-- ─── agila_chit_payments (total column: amount) ───────────────────────────────
ALTER TABLE agila_chit_payments
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE agila_chit_payments DROP CONSTRAINT IF EXISTS agila_chit_payments_payment_mode_check;
ALTER TABLE agila_chit_payments
  ADD CONSTRAINT agila_chit_payments_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE agila_chit_payments DROP CONSTRAINT IF EXISTS agila_chit_payments_cash_gpay_sum_check;
ALTER TABLE agila_chit_payments
  ADD CONSTRAINT agila_chit_payments_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount));

-- ─── builders_payouts (total column: amount) ──────────────────────────────────
ALTER TABLE builders_payouts
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);
ALTER TABLE builders_payouts DROP CONSTRAINT IF EXISTS builders_payouts_payment_mode_check;
ALTER TABLE builders_payouts
  ADD CONSTRAINT builders_payouts_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE builders_payouts DROP CONSTRAINT IF EXISTS builders_payouts_cash_gpay_sum_check;
ALTER TABLE builders_payouts
  ADD CONSTRAINT builders_payouts_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount));

-- ─── builders_plans lump-sum (total column: investment_amount) ────────────────
-- The customer's one-time lump sum into the scheme. Its own mode column is
-- lump_sum_mode, so the split column is prefixed to match (lump_sum_gpay_amount).
ALTER TABLE builders_plans
  ADD COLUMN IF NOT EXISTS lump_sum_gpay_amount NUMERIC(12, 2);
ALTER TABLE builders_plans DROP CONSTRAINT IF EXISTS builders_plans_lump_sum_mode_check;
ALTER TABLE builders_plans
  ADD CONSTRAINT builders_plans_lump_sum_mode_check
  CHECK (lump_sum_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));
ALTER TABLE builders_plans DROP CONSTRAINT IF EXISTS builders_plans_lump_sum_cash_gpay_sum_check;
ALTER TABLE builders_plans
  ADD CONSTRAINT builders_plans_lump_sum_cash_gpay_sum_check
  CHECK (lump_sum_mode <> 'cash_gpay'
         OR (lump_sum_cash_amount > 0 AND lump_sum_gpay_amount > 0
             AND lump_sum_cash_amount + lump_sum_gpay_amount = investment_amount));
