-- Gold Savings Scheme Members
-- Each row is one chit slot (a customer can hold multiple slots).
-- Monthly installments run for total_months (default 12), after which
-- the accumulated amount is returned to the member.

CREATE TABLE IF NOT EXISTS gold_scheme_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES branches(id),

  -- S.No from the physical ledger — unique per branch
  chit_number     VARCHAR(20) NOT NULL,

  member_name     VARCHAR(200) NOT NULL,
  member_phone    VARCHAR(20),
  member_address  TEXT,

  -- The employee who referred this member
  referrer_id     UUID REFERENCES users(id),
  -- Denormalised so the record survives even if the referrer is deactivated
  referrer_name   VARCHAR(200),

  monthly_amount  NUMERIC(12, 2) NOT NULL,
  start_date      DATE NOT NULL,
  total_months    INTEGER NOT NULL DEFAULT 12,

  -- active | completed | withdrawn
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'withdrawn')),

  notes           TEXT,
  entered_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Chit number must be unique within a branch
CREATE UNIQUE INDEX IF NOT EXISTS idx_gold_members_branch_chit
  ON gold_scheme_members(branch_id, chit_number);

CREATE INDEX IF NOT EXISTS idx_gold_members_branch
  ON gold_scheme_members(branch_id);

CREATE INDEX IF NOT EXISTS idx_gold_members_referrer
  ON gold_scheme_members(referrer_id);

CREATE INDEX IF NOT EXISTS idx_gold_members_status
  ON gold_scheme_members(status);
