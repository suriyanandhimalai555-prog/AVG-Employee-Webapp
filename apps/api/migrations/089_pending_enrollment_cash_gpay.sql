-- Migration 089: add "cash + GPay" split payment mode to pending_enrollment_payments.
--
-- Migration 081 added cash_gpay (+ gpay_amount column + sum-check) to seven scheme
-- payment tables but missed pending_enrollment_payments (created in migration 077).
-- The result: depositing via cash_gpay on any pending enrollment triggers a Postgres
-- CHECK-constraint violation (23514) on payment_mode_check, because the allowed set
-- was still only (cash, gpay, bank_receipt, cash_bank).
--
-- All ADD CONSTRAINT statements are preceded by DROP CONSTRAINT IF EXISTS so the
-- entire file is fully idempotent — safe to re-run after a partial failure (defuses
-- the run_migrations.js "already-exists → skip rest of file" footgun, GAPS.md #2).
-- ADD COLUMN IF NOT EXISTS is natively idempotent.
--
-- The gpay_amount column mirrors 081's convention: cash_amount stores the cash half,
-- gpay_amount stores the GPay half, and both must be positive and sum to amount when
-- payment_mode = 'cash_gpay'. Columns are NULL for all other modes.

-- ─── Add gpay_amount split column ─────────────────────────────────────────────
ALTER TABLE pending_enrollment_payments
  ADD COLUMN IF NOT EXISTS gpay_amount NUMERIC(12, 2);

-- ─── Widen the payment_mode CHECK to include cash_gpay ────────────────────────
ALTER TABLE pending_enrollment_payments
  DROP CONSTRAINT IF EXISTS pending_enrollment_payments_payment_mode_check;
ALTER TABLE pending_enrollment_payments
  ADD CONSTRAINT pending_enrollment_payments_payment_mode_check
  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay'));

-- ─── Integrity guard: cash_gpay split must sum to row amount ──────────────────
-- Mirrors the cash_bank guard added in migration 077 (lines 63–65 of that file)
-- and the per-table cash_gpay guards migration 081 added to scheme tables.
ALTER TABLE pending_enrollment_payments
  DROP CONSTRAINT IF EXISTS pending_enrollment_payments_cash_gpay_sum_check;
ALTER TABLE pending_enrollment_payments
  ADD CONSTRAINT pending_enrollment_payments_cash_gpay_sum_check
  CHECK (payment_mode <> 'cash_gpay'
         OR (cash_amount > 0 AND gpay_amount > 0 AND cash_amount + gpay_amount = amount));
