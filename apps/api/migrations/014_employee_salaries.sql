-- Migration 014: Employee salary assignments
-- Stores salary history per employee; only one row with effective_to = NULL (the current salary)

CREATE TABLE IF NOT EXISTS employee_salaries (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id),
  base_salary    NUMERIC(12, 2) NOT NULL CHECK (base_salary >= 0),
  effective_from DATE NOT NULL,
  effective_to   DATE,             -- NULL means "currently active"
  set_by         UUID NOT NULL REFERENCES users(id),
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Enforce at most one open-ended (active) salary per employee
CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_user_active
  ON employee_salaries(user_id) WHERE effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_salaries_user
  ON employee_salaries(user_id);

CREATE INDEX IF NOT EXISTS idx_salaries_effective
  ON employee_salaries(effective_from);
