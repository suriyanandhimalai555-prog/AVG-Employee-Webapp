-- Migration 025: Add rate_type to scheme_commission_rules and seed gold scheme commission rates
--
-- Gold commission is percentage-based (referrer-only), not fixed-amount chain distribution.
-- We extend the table with:
--   rate_type  — 'fixed' (₹ per deal, like Trading Academy) or 'percent' (% of amount)
--   Two new pseudo-roles for gold: 'referrer_new' and 'referrer_renewal'

-- 1. Add rate_type column (default 'fixed' so existing Trading Academy rows are unaffected)
ALTER TABLE scheme_commission_rules
  ADD COLUMN IF NOT EXISTS rate_type VARCHAR(10) DEFAULT 'fixed'
  CHECK (rate_type IN ('fixed', 'percent'));

-- 2. Expand the role CHECK to include the two gold referrer pseudo-roles
ALTER TABLE scheme_commission_rules
  DROP CONSTRAINT IF EXISTS scheme_commission_rules_role_check;

ALTER TABLE scheme_commission_rules
  ADD CONSTRAINT scheme_commission_rules_role_check
  CHECK (role IN (
    'sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin',
    'referrer_new', 'referrer_renewal'
  ));

-- 3. Seed gold commission rules
--    referrer_new     → 20% of monthly_amount on enrollment (month 1)
--    referrer_renewal → 15% of payment on months 2+
INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, v.role, v.amount, 'percent'
FROM projects p
CROSS JOIN (VALUES
  ('referrer_new',     20.00),
  ('referrer_renewal', 15.00)
) AS v(role, amount)
WHERE p.name = 'Monthly gold new'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = EXCLUDED.amount, rate_type = 'percent', updated_at = now();
