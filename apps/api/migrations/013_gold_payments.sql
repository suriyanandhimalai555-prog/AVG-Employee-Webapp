-- Monthly payment records for each gold scheme chit slot.
-- One row = one installment paid by a member for their specific chit.
-- UNIQUE(member_id, month_number) ensures a month cannot be double-recorded.

CREATE TABLE IF NOT EXISTS gold_scheme_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id    UUID NOT NULL REFERENCES gold_scheme_members(id) ON DELETE CASCADE,
  month_number INTEGER NOT NULL CHECK (month_number >= 1),
  paid_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount       NUMERIC(12, 2) NOT NULL,
  payment_mode VARCHAR(20) NOT NULL DEFAULT 'cash'
               CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt')),
  notes        TEXT,
  entered_by   UUID NOT NULL REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (member_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_gold_payments_member
  ON gold_scheme_payments(member_id);
