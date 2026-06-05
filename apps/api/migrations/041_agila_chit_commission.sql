-- Migration 041: Add referrer columns to agila_chit_members + seed the 20% direct commission.
--
-- referrer_id / referrer_name allow the branch admin to record which employee referred
-- each chit member. On enrollment the service calls IncentiveService.distributeIncentives
-- (mode='percent_referrer', percentRole='referrer_direct') to credit the referrer.
--
-- 'referrer_direct' is already an allowed role value (added by migration 031), so no
-- CHECK-constraint change is needed here.

ALTER TABLE agila_chit_members
  ADD COLUMN IF NOT EXISTS referrer_id   UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS referrer_name VARCHAR(200);

CREATE INDEX IF NOT EXISTS idx_agila_chit_members_referrer
  ON agila_chit_members(referrer_id);

-- Seed the 20% direct-referrer commission rule for the Agila Chit project.
-- Mirrors the pattern in 038_lss_seed.sql.
INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
SELECT p.id, 'referrer_direct', 20.00, 'percent'
FROM projects p
WHERE p.code = 'agila_chit_scheme'
ON CONFLICT (project_id, role)
DO UPDATE SET amount = EXCLUDED.amount, rate_type = 'percent', updated_at = now();
