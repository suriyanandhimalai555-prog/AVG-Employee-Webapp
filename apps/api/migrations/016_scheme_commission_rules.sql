-- Migration 016: Commission rules per scheme per role
-- Defines the fixed incentive amount each role earns per deal in a given project/scheme.
-- Roles that can earn: sales_officer, abm, branch_manager, gm, branch_admin
-- MD and Director are excluded by design (enforced in the service layer).

CREATE TABLE IF NOT EXISTS scheme_commission_rules (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role       VARCHAR(30) NOT NULL
             CHECK (role IN ('sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin')),
  amount     NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (project_id, role)
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_project
  ON scheme_commission_rules(project_id);
