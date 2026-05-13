-- Migration 018: Seed commission rules for AGILAVETRI TRADING ACADEMY PVT LTD
-- Rates from the incentive structure document:
--   SO           → Rs.1,500
--   ABM          → Rs.750
--   Branch Manager → Rs.500
--   GM (Pillars) → Rs.250
--   Branch Admin → Rs.250

INSERT INTO scheme_commission_rules (project_id, role, amount)
SELECT p.id, v.role, v.amount
FROM projects p
CROSS JOIN (VALUES
  ('sales_officer',  1500.00),
  ('abm',             750.00),
  ('branch_manager',  500.00),
  ('gm',              250.00),
  ('branch_admin',    250.00)
) AS v(role, amount)
WHERE p.name = 'AGILAVETRI TRADING ACADEMY PVT LTD'
ON CONFLICT (project_id, role) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now();

-- Also fix the source_type constraint to include 'scheme' (done earlier via ALTER, captured here)
ALTER TABLE employee_incentives
  DROP CONSTRAINT IF EXISTS employee_incentives_source_type_check;

ALTER TABLE employee_incentives
  ADD CONSTRAINT employee_incentives_source_type_check
  CHECK (source_type IN ('collection', 'gold_scheme', 'direct_cash', 'scheme', 'other'));
