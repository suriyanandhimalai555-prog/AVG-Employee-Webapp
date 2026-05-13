-- Migration 017: Agilavetri Trading Academy scheme members
-- Records individual enrollments. When a member is added, incentives are
-- auto-distributed to the selling SO and their chain via IncentiveService.

CREATE TABLE IF NOT EXISTS trading_academy_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id       UUID NOT NULL REFERENCES branches(id),
  project_id      UUID NOT NULL REFERENCES projects(id),
  member_name     VARCHAR(200) NOT NULL,
  member_phone    VARCHAR(20),
  member_address  TEXT,
  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  enrolled_by     UUID NOT NULL REFERENCES users(id),  -- the SO who brought the deal
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_mode    VARCHAR(20) NOT NULL DEFAULT 'cash'
                  CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt')),
  notes           TEXT,
  entered_by      UUID NOT NULL REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trading_branch   ON trading_academy_members(branch_id);
CREATE INDEX IF NOT EXISTS idx_trading_project  ON trading_academy_members(project_id);
CREATE INDEX IF NOT EXISTS idx_trading_enrolled ON trading_academy_members(enrolled_by);
CREATE INDEX IF NOT EXISTS idx_trading_date     ON trading_academy_members(enrollment_date DESC);
