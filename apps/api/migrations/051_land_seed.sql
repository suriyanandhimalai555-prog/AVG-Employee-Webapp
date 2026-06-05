-- Migration 051: Register the Land Sales scheme in the projects table.
--
-- Stable project code 'land_scheme' matches LandService.schemeCode.
-- Commission rule is 0% — land sales pay buyback directly to customers,
-- not to employees via the incentive ledger.

INSERT INTO projects (name, code)
VALUES ('Land Sales', 'land_scheme')
ON CONFLICT (code) DO NOTHING;

INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, 'referrer_direct', 0.00, 'percent'
FROM projects p
WHERE p.code = 'land_scheme'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = 0.00, rate_type = 'percent', updated_at = now();
