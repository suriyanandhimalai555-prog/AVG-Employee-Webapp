-- Migration 038: Seed the LSS scheme registry, commission rule, and plans.
--
--   - projects                 : one row, stable code 'lss_scheme'
--   - scheme_commission_rules  : referrer_direct → 20% (role already allowed by migration 031)
--   - lss_plans                : 5 rows (₹5k through ₹25k)

-- 1. Register the scheme in projects
INSERT INTO projects (name, code)
VALUES ('LSS', 'lss_scheme')
ON CONFLICT (code) DO NOTHING;

-- 2. Seed the 20% direct-referrer commission rule
INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, 'referrer_direct', 20.00, 'percent'
FROM projects p
WHERE p.code = 'lss_scheme'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = EXCLUDED.amount, rate_type = 'percent', updated_at = now();

-- 3. Seed the 5 plans
INSERT INTO lss_plans (name, price) VALUES
  ('LSS 5000',   5000.00),
  ('LSS 10000', 10000.00),
  ('LSS 15000', 15000.00),
  ('LSS 20000', 20000.00),
  ('LSS 25000', 25000.00)
ON CONFLICT (price) DO NOTHING;
