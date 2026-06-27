-- Migration 077: partial / installment enrollment staging layer.
--
-- Customers sometimes pay only a deposit toward a scheme enrollment and clear the
-- balance later, across any number of part-payments. Until the running total reaches
-- the required amount the scheme must NOT start: no member/slot/plan, no incentive,
-- no slot/member counted toward a room/group. This is held in a generic staging area;
-- when the balance clears, the real scheme entity is created by replaying the stored
-- enrollment payload through the scheme's existing create function (exactly once).
--
-- Land is intentionally excluded — it already has its own advance/full payment flow.

-- ─── Pending enrollment (one per held enrollment) ─────────────────────────────
CREATE TABLE IF NOT EXISTS pending_enrollments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scheme_code       TEXT NOT NULL
                      CHECK (scheme_code IN (
                        'gold_scheme', 'trading_academy', 'builders_scheme',
                        'agila_chit_scheme', 'gold_coin_scheme', 'lss_scheme'
                      )),
  branch_id         UUID NOT NULL REFERENCES branches(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  referrer_id       UUID REFERENCES users(id),          -- nullable: some schemes allow no referrer
  required_amount   NUMERIC(12, 2) NOT NULL CHECK (required_amount > 0),
  amount_paid       NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status            TEXT NOT NULL DEFAULT 'collecting'
                      CHECK (status IN (
                        'collecting',          -- still taking part-payments
                        'completing',          -- transient claim during completion
                        'completed',           -- balance cleared; scheme entity created
                        'cancelled',           -- abandoned; deposit leaves the pending bucket
                        'completion_failed'    -- balance cleared but the replay failed (admin resolves)
                      )),
  payload           JSONB NOT NULL,            -- the create-fn payload (payment fields stripped), replayed at completion
  created_entity_id UUID,                      -- the new member/slot/plan id, set on completion
  failure_reason    TEXT,                      -- set when status = 'completion_failed'
  entered_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_enrollments_status_branch
  ON pending_enrollments (status, branch_id);
CREATE INDEX IF NOT EXISTS idx_pending_enrollments_referrer
  ON pending_enrollments (referrer_id);

-- ─── Installment ledger (one row per part-payment) ────────────────────────────
-- Mirrors the payment-proof + cash_bank shape of migration 076. Each row is fully
-- attributable: when (paid_date), how much (amount), in which mode (+ split + proof).
CREATE TABLE IF NOT EXISTS pending_enrollment_payments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pending_enrollment_id UUID NOT NULL REFERENCES pending_enrollments(id) ON DELETE CASCADE,
  amount                NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  payment_mode          VARCHAR(20) NOT NULL DEFAULT 'cash'
                          CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt', 'cash_bank')),
  cash_amount           NUMERIC(12, 2),
  bank_amount           NUMERIC(12, 2),
  proof_key             TEXT[],
  transaction_id        TEXT[],
  paid_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  entered_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- same cash_bank integrity guard as migration 076
  CONSTRAINT pending_enrollment_payments_cash_bank_sum_check
    CHECK (payment_mode <> 'cash_bank'
           OR (cash_amount > 0 AND bank_amount > 0 AND cash_amount + bank_amount = amount))
);

CREATE INDEX IF NOT EXISTS idx_pending_enrollment_payments_parent
  ON pending_enrollment_payments (pending_enrollment_id);
CREATE INDEX IF NOT EXISTS idx_pending_enrollment_payments_paid_date
  ON pending_enrollment_payments (paid_date);

-- ─── Exactly-once link on each entity table ───────────────────────────────────
-- The UNIQUE column is the DB-enforced guard: at most one scheme entity per pending
-- enrollment. The completion transaction writes it in the SAME tx that creates the
-- entity + distributes incentives, so a racing/retried completion rolls back wholesale.
ALTER TABLE gold_scheme_members
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
ALTER TABLE trading_academy_members
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
ALTER TABLE builders_plans
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
ALTER TABLE agila_chit_members
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
ALTER TABLE gold_coin_slots
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
ALTER TABLE lss_slots
  ADD COLUMN IF NOT EXISTS pending_enrollment_id UUID UNIQUE REFERENCES pending_enrollments(id);
