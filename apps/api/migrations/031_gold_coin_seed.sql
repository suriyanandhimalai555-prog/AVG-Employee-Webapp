-- Migration 031: Seed the Gold Coin scheme registry, commission rule, packages.
--
--   - projects                 : one row, stable code 'gold_coin_scheme'
--   - scheme_commission_rules  : referrer_direct → 20% (allows the role first)
--   - gold_coin_packages       : 10 rows from the One Time Investment chart
--                                (₹12k/1GM through ₹1.2L/10GM)

-- 1. Extend the role CHECK on scheme_commission_rules to allow 'referrer_direct'
ALTER TABLE scheme_commission_rules
  DROP CONSTRAINT IF EXISTS scheme_commission_rules_role_check;

ALTER TABLE scheme_commission_rules
  ADD CONSTRAINT scheme_commission_rules_role_check
  CHECK (role IN (
    'sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin',
    'referrer_new', 'referrer_renewal',
    'referrer_direct'
  ));

-- 2. Register the scheme in projects
INSERT INTO projects (name, code)
VALUES ('ONE TIME INVESTMENT GOLD COIN SCHEME', 'gold_coin_scheme')
ON CONFLICT (code) DO NOTHING;

-- 3. Seed the 20% direct-referrer commission rule
INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, 'referrer_direct', 20.00, 'percent'
FROM projects p
WHERE p.code = 'gold_coin_scheme'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = EXCLUDED.amount, rate_type = 'percent', updated_at = now();

-- 4. Seed the 10 packages
INSERT INTO gold_coin_packages (name, price, gold_grams) VALUES
  ('1GM Package',   12000,   1),
  ('2GM Package',   24000,   2),
  ('3GM Package',   36000,   3),
  ('4GM Package',   48000,   4),
  ('5GM Package',   60000,   5),
  ('6GM Package',   72000,   6),
  ('7GM Package',   84000,   7),
  ('8GM Package',   96000,   8),
  ('9GM Package',  108000,   9),
  ('10GM Package', 120000,  10)
ON CONFLICT (price) DO NOTHING;
