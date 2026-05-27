-- Migration 027: Fix project codes that were auto-slugged from the display name.
--
-- Migration 026 tried to backfill gold_scheme and trading_academy by project name,
-- but if the admin had already renamed the project the name-match failed and the
-- auto-slug fallback ran instead (e.g. 'Monthly card' → 'monthly_card').
--
-- We identify each system project by its commission rule structure — which is
-- structural and name-independent — and correct the code column.

-- Gold project: uniquely identified by having a 'referrer_new' commission rule
-- (only gold uses percentage-based referrer pseudo-roles).
UPDATE projects
SET code = 'gold_scheme'
WHERE id = (
  SELECT project_id
  FROM scheme_commission_rules
  WHERE role = 'referrer_new'
  LIMIT 1
)
AND code <> 'gold_scheme';

-- Trading Academy: uniquely identified by having a 'sales_officer' fixed-rate rule
-- (chain-distribution model; only trading academy uses fixed amounts per deal).
UPDATE projects
SET code = 'trading_academy'
WHERE id = (
  SELECT project_id
  FROM scheme_commission_rules
  WHERE role = 'sales_officer' AND rate_type = 'fixed'
  LIMIT 1
)
AND code <> 'trading_academy';
