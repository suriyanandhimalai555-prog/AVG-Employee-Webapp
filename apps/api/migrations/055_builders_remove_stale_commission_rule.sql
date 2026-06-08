-- Migration 055: Remove stale Builders commission-rule placeholder.
--
-- Migration 047 seeded a 'referrer_direct 0%' row in scheme_commission_rules
-- as a temporary scaffold before the incentive structure was designed.
-- The Builders scheme now uses the dedicated builders_incentive_rules table
-- (migration 054) for its tier×role×type matrix. The old row is dead and
-- misleading — remove it so no admin endpoint or audit query is confused.
--
-- Idempotent: safe to run even if the row was already removed.

DELETE FROM scheme_commission_rules
WHERE project_id = (SELECT id FROM projects WHERE code = 'builders_scheme')
  AND role = 'referrer_direct';
