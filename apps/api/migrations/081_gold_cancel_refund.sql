-- Migration 081: Gold Savings cancel-card + refund-at-maturity tracking.
--
-- When a branch_admin cancels a card, the member transitions to 'cancelled'
-- with refund_status='pending'. The accumulated payments become payable once
-- the scheme term ends (start_date + total_months). At that point the admin
-- can settle the refund, recording who settled and the exact amount.
--
-- Commission credited at enrollment/renewal is deliberately kept (not reversed)
-- when a card is cancelled. Only the refund lifecycle is tracked here.
--
-- Safe to re-run: DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT is idempotent;
-- ADD COLUMN IF NOT EXISTS guards each new column; existing rows get NULL
-- on all new columns (they are not cancelled).

-- 1. Widen the status CHECK to include 'cancelled'.
--    Migration 064 last set this to: active / completed / withdrawn / voided.
ALTER TABLE gold_scheme_members
  DROP CONSTRAINT IF EXISTS gold_scheme_members_status_check;
ALTER TABLE gold_scheme_members
  ADD CONSTRAINT gold_scheme_members_status_check
  CHECK (status IN ('active', 'completed', 'withdrawn', 'voided', 'cancelled'));

-- 2. Cancellation audit: who cancelled it and why.
ALTER TABLE gold_scheme_members
  ADD COLUMN IF NOT EXISTS cancelled_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 3. Refund lifecycle: pending → refunded, computed at settle time.
--    All three columns are NULL on existing (non-cancelled) rows.
ALTER TABLE gold_scheme_members
  ADD COLUMN IF NOT EXISTS refund_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS refunded_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_by   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(12,2);

-- 4. Apply the CHECK on refund_status separately so the name is deterministic
--    and idempotent on re-runs (the ADD COLUMN IF NOT EXISTS is a no-op on
--    subsequent runs, so no constraint-name conflict can occur).
ALTER TABLE gold_scheme_members
  DROP CONSTRAINT IF EXISTS gold_scheme_members_refund_status_check;
ALTER TABLE gold_scheme_members
  ADD CONSTRAINT gold_scheme_members_refund_status_check
  CHECK (refund_status IN ('pending', 'refunded'));
