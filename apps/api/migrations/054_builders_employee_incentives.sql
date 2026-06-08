-- Migration 054: Builders Scheme — Employee Incentive Rules
--
-- Decoupled tier×role matrix so the MD can set different ₹ amounts per
-- package tier (1–6) per role, for two incentive types:
--   one_time  → credited to the selling chain at plan enrollment
--   monthly   → credited to the SO only, once per recorded customer payout (60 max)
--
-- Written separately from scheme_commission_rules because that table is
-- UNIQUE (project_id, role) — 1-D, not able to express a tier×role matrix.

CREATE TABLE IF NOT EXISTS builders_incentive_rules (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number  INTEGER       NOT NULL CHECK (package_number BETWEEN 1 AND 6),
  role            VARCHAR(30)   NOT NULL
                  CHECK (role IN ('sales_officer', 'abm', 'branch_manager', 'gm')),
  incentive_type  VARCHAR(20)   NOT NULL
                  CHECK (incentive_type IN ('one_time', 'monthly')),
  amount          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  updated_by      UUID          REFERENCES users(id),
  created_at      TIMESTAMPTZ   DEFAULT now(),
  updated_at      TIMESTAMPTZ   DEFAULT now(),
  UNIQUE (package_number, role, incentive_type)
);

CREATE INDEX IF NOT EXISTS idx_builders_incentive_rules_pkg  ON builders_incentive_rules(package_number);
CREATE INDEX IF NOT EXISTS idx_builders_incentive_rules_role ON builders_incentive_rules(role);

-- ─── Seed: one_time incentives ────────────────────────────────────────────────
-- Role        Tier1   Tier2   Tier3   Tier4   Tier5   Tier6
-- SO          20,000  40,000  60,000  80,000 100,000 120,000
-- ABM         15,000  30,000  45,000  60,000  75,000  90,000
-- BM          10,000  20,000  30,000  40,000  50,000  60,000
-- GM           5,000  10,000  15,000  20,000  25,000  30,000

INSERT INTO builders_incentive_rules (package_number, role, incentive_type, amount) VALUES
  (1, 'sales_officer',  'one_time',  20000),
  (2, 'sales_officer',  'one_time',  40000),
  (3, 'sales_officer',  'one_time',  60000),
  (4, 'sales_officer',  'one_time',  80000),
  (5, 'sales_officer',  'one_time', 100000),
  (6, 'sales_officer',  'one_time', 120000),

  (1, 'abm',            'one_time',  15000),
  (2, 'abm',            'one_time',  30000),
  (3, 'abm',            'one_time',  45000),
  (4, 'abm',            'one_time',  60000),
  (5, 'abm',            'one_time',  75000),
  (6, 'abm',            'one_time',  90000),

  (1, 'branch_manager', 'one_time',  10000),
  (2, 'branch_manager', 'one_time',  20000),
  (3, 'branch_manager', 'one_time',  30000),
  (4, 'branch_manager', 'one_time',  40000),
  (5, 'branch_manager', 'one_time',  50000),
  (6, 'branch_manager', 'one_time',  60000),

  (1, 'gm',             'one_time',   5000),
  (2, 'gm',             'one_time',  10000),
  (3, 'gm',             'one_time',  15000),
  (4, 'gm',             'one_time',  20000),
  (5, 'gm',             'one_time',  25000),
  (6, 'gm',             'one_time',  30000)
ON CONFLICT (package_number, role, incentive_type) DO NOTHING;

-- ─── Seed: monthly incentives (SO only) ──────────────────────────────────────
-- Tier1  Tier2  Tier3  Tier4  Tier5  Tier6
--  2,000  4,000  6,000  8,000 10,000 12,000

INSERT INTO builders_incentive_rules (package_number, role, incentive_type, amount) VALUES
  (1, 'sales_officer', 'monthly',  2000),
  (2, 'sales_officer', 'monthly',  4000),
  (3, 'sales_officer', 'monthly',  6000),
  (4, 'sales_officer', 'monthly',  8000),
  (5, 'sales_officer', 'monthly', 10000),
  (6, 'sales_officer', 'monthly', 12000)
ON CONFLICT (package_number, role, incentive_type) DO NOTHING;
