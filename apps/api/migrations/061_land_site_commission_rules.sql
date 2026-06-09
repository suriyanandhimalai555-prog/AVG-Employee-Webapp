-- Migration 061: Per-site employee commission rules for the Land Sales scheme.
--
-- Each land site has its own fixed commission rates per role (SO / ABM / BM / GM).
-- "PILLARS" in the business documents = the 'gm' role in the system.
--
-- Two amounts per role per site:
--   spot_amount    — one-time credit distributed at booking creation
--   monthly_amount — credit distributed each time a buyback payout is marked paid
--
-- commission_months on land_sites controls how many buyback months generate
-- employee commission (e.g. VEPPUR = 36, most sites = 60).
--
-- This mirrors the builders_incentive_rules pattern (migration 054) but is
-- keyed by site_id rather than package_number.

-- 1. Add referrer_id to land_bookings — the employee who sold the plot.
--    Nullable: existing bookings had no referrer concept.
ALTER TABLE land_bookings
  ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_land_bookings_referrer ON land_bookings (referrer_id)
  WHERE referrer_id IS NOT NULL;

-- 2. Add commission_months to land_sites — how many buyback months generate
--    employee commission. Defaults to 60; set to 36 for sites like VEPPUR.
ALTER TABLE land_sites
  ADD COLUMN IF NOT EXISTS commission_months INTEGER NOT NULL DEFAULT 60
  CHECK (commission_months BETWEEN 1 AND 60);

-- 3. Create per-site per-role commission rules table.
CREATE TABLE IF NOT EXISTS land_site_commission_rules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID        NOT NULL REFERENCES land_sites(id) ON DELETE CASCADE,
  role           VARCHAR(30) NOT NULL
                 CHECK (role IN ('sales_officer','abm','branch_manager','gm')),
  spot_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spot_amount    >= 0),
  monthly_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  updated_by     UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site_id, role)
);

CREATE INDEX IF NOT EXISTS idx_land_commission_rules_site
  ON land_site_commission_rules (site_id);

-- 4. Seed 0-amount rules for every existing site (4 roles each).
--    Management configures the actual amounts via the Control Center UI.
INSERT INTO land_site_commission_rules (site_id, role)
SELECT s.id, r.role
FROM land_sites s
CROSS JOIN (VALUES
  ('sales_officer'),
  ('abm'),
  ('branch_manager'),
  ('gm')
) AS r(role)
ON CONFLICT (site_id, role) DO NOTHING;
