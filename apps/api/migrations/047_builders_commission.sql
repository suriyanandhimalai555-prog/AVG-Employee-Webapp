-- Migration 047: Scaffold commission rule for the Builders Scheme.
--
-- Amount is 0.00% — a placeholder so the referrer_id column and the
-- IncentiveService.distributeIncentives(...) call can be wired up later without
-- needing another schema migration. Setting rate=0 means no incentive rows are
-- created until the business decides on the percentage.
--
-- 'referrer_direct' is already an allowed role in scheme_commission_rules.role
-- (added by migration 031), so no CHECK constraint change is needed.

INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, 'referrer_direct', 0.00, 'percent'
FROM projects p
WHERE p.code = 'builders_scheme'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = EXCLUDED.amount, rate_type = 'percent', updated_at = now();
