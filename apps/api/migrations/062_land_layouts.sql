-- Migration 062: Introduce land_layouts between sites and plots.
--
-- Correct hierarchy: land_sites → land_layouts → land_plots → land_bookings
--
-- Before: site had layout_name + commission rules per site.
-- After:  each site can have many layouts, each layout owns its pricing,
--         buyback schedule, and per-role commission rules (spot + monthly).
--
-- "PILLARS" in business docs = 'gm' role in the system.
-- monthly_months is per role per layout — some roles get null (no monthly at all).

-- ═══════════════════════════════════════════════════════════
-- 1. Create land_layouts
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS land_layouts (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id               UUID        NOT NULL REFERENCES land_sites(id) ON DELETE CASCADE,
  layout_name           VARCHAR(200),
  location_detail       TEXT,
  plot_price            NUMERIC(14,2) CHECK (plot_price > 0),          -- standard price per plot
  plot_size_sqft        NUMERIC(12,2) CHECK (plot_size_sqft > 0),
  price_per_sqft        NUMERIC(12,2) CHECK (price_per_sqft > 0),
  buyback_bonus_monthly NUMERIC(12,2) CHECK (buyback_bonus_monthly >= 0),
  buyback_months        INTEGER CHECK (buyback_months BETWEEN 1 AND 120),
  incentive_type        VARCHAR(30) NOT NULL DEFAULT 'spot_commission'
                        CHECK (incentive_type IN ('spot_incentive','spot_commission')),
  status                VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive')),
  created_by            UUID        NOT NULL REFERENCES users(id),
  updated_by            UUID        REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_land_layouts_site   ON land_layouts (site_id);
CREATE INDEX IF NOT EXISTS idx_land_layouts_status ON land_layouts (status);

-- ═══════════════════════════════════════════════════════════
-- 2. Migrate existing sites → layouts
--    Each site had one implicit layout (stored as layout_name on the site row).
--    Promote it into land_layouts so existing plots keep their connection.
-- ═══════════════════════════════════════════════════════════

INSERT INTO land_layouts (site_id, layout_name, created_by, created_at)
SELECT id, layout_name, created_by, created_at
FROM land_sites
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 3. Add layout_id to land_plots; backfill; make it NOT NULL.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE land_plots ADD COLUMN IF NOT EXISTS layout_id UUID REFERENCES land_layouts(id);

UPDATE land_plots p
SET layout_id = (
  SELECT l.id
  FROM land_layouts l
  WHERE l.site_id = p.site_id
  LIMIT 1
)
WHERE p.layout_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_land_plots_layout ON land_plots (layout_id);

-- ═══════════════════════════════════════════════════════════
-- 4. Per-layout per-role commission rules
--    monthly_months is nullable — null means no monthly commission for that role.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS land_layout_commission_rules (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id      UUID        NOT NULL REFERENCES land_layouts(id) ON DELETE CASCADE,
  role           VARCHAR(30) NOT NULL
                 CHECK (role IN ('sales_officer','abm','branch_manager','gm')),
  spot_amount    NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (spot_amount    >= 0),
  monthly_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (monthly_amount >= 0),
  monthly_months INTEGER CHECK (monthly_months BETWEEN 1 AND 120),
  updated_by     UUID        REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layout_id, role)
);

CREATE INDEX IF NOT EXISTS idx_land_layout_commission_rules_layout
  ON land_layout_commission_rules (layout_id);

-- ═══════════════════════════════════════════════════════════
-- 5. Clean up migration-061 additions that are now superseded
-- ═══════════════════════════════════════════════════════════

DROP TABLE IF EXISTS land_site_commission_rules;
ALTER TABLE land_sites DROP COLUMN IF EXISTS commission_months;
ALTER TABLE land_bookings DROP COLUMN IF EXISTS referrer_id;  -- will be re-added below with correct FK

-- Re-add referrer_id cleanly
ALTER TABLE land_bookings ADD COLUMN IF NOT EXISTS referrer_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_land_bookings_referrer ON land_bookings (referrer_id)
  WHERE referrer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 6. Seed canonical layouts + commission rules from business data
--    Insert or update by name so re-runs are safe.
-- ═══════════════════════════════════════════════════════════

-- Ensure the 7 canonical sites exist (create if not present)
INSERT INTO land_sites (name, status, loan_enabled, created_by)
SELECT s.name, 'active', false, (SELECT id FROM users WHERE role = 'management' LIMIT 1)
FROM (VALUES
  ('Mailam'),
  ('Tirupathi'),
  ('Nellore'),
  ('Chithoor'),
  ('Veppur'),
  ('Melmalayanur')
) AS s(name)
WHERE NOT EXISTS (SELECT 1 FROM land_sites WHERE name = s.name)
  AND EXISTS (SELECT 1 FROM users WHERE role = 'management');

-- Insert canonical layouts (idempotent: on conflict update pricing)
WITH site_ids AS (
  SELECT id, name FROM land_sites
),
mgmt AS (
  SELECT id FROM users WHERE role = 'management' LIMIT 1
),
layout_data(site_name, layout_name, plot_price, plot_size_sqft, price_per_sqft,
            buyback_bonus_monthly, buyback_months, incentive_type) AS (
  VALUES
    ('Mailam',       NULL,                  450000::numeric, NULL,   NULL,  NULL,    NULL, 'spot_incentive'),
    ('Tirupathi',    'Hare Rama Layout',   2400000::numeric, 1200.0, 2000.0, 40000, 60,   'spot_commission'),
    ('Tirupathi',    'S R Grand City 2',   2000000::numeric, 1000.0, 2000.0, 33334, 60,   'spot_commission'),
    ('Nellore',      'Sri Krishna Brindavanam', 1440000::numeric, 2400.0, NULL, 24000, 60, 'spot_commission'),
    ('Chithoor',     'Sunrise City',       1800000::numeric, 1500.0, NULL, 30000, 60,     'spot_commission'),
    ('Veppur',       'Shree Narayanapuram',540000::numeric,  NULL,   NULL,  NULL,    NULL, 'spot_incentive'),
    ('Melmalayanur', 'VRJ City',           NULL,             NULL,   NULL, 30000, 60,     'spot_commission')
)
INSERT INTO land_layouts
  (site_id, layout_name, plot_price, plot_size_sqft, price_per_sqft,
   buyback_bonus_monthly, buyback_months, incentive_type, created_by)
SELECT
  si.id,
  ld.layout_name,
  ld.plot_price,
  ld.plot_size_sqft,
  ld.price_per_sqft,
  ld.buyback_bonus_monthly,
  ld.buyback_months,
  ld.incentive_type,
  (SELECT id FROM mgmt)
FROM layout_data ld
JOIN site_ids si ON si.name = ld.site_name
WHERE (SELECT id FROM mgmt) IS NOT NULL
ON CONFLICT DO NOTHING;

-- Seed commission rules per layout
-- (spot_amount, monthly_amount, monthly_months) per role
WITH layout_ids AS (
  SELECT ll.id AS layout_id, ls.name AS site_name, ll.layout_name
  FROM land_layouts ll
  JOIN land_sites ls ON ls.id = ll.site_id
),
rule_data(site_name, layout_name, role, spot, monthly, months) AS (
  VALUES
    -- Mailam (spot only)
    ('Mailam', NULL::text, 'sales_officer',  10000::numeric, 0::numeric, NULL::integer),
    ('Mailam', NULL,       'abm',             5000,           0,          NULL),
    ('Mailam', NULL,       'branch_manager',  4000,           0,          NULL),
    ('Mailam', NULL,       'gm',              3000,           0,          NULL),
    -- Tirupathi – Hare Rama Layout
    ('Tirupathi', 'Hare Rama Layout', 'sales_officer',  75000, 5000, 60),
    ('Tirupathi', 'Hare Rama Layout', 'abm',            25000, 3000, 60),
    ('Tirupathi', 'Hare Rama Layout', 'branch_manager', 15000, 2000, 60),
    ('Tirupathi', 'Hare Rama Layout', 'gm',             10000, 1000, 60),
    -- Tirupathi – S R Grand City 2
    ('Tirupathi', 'S R Grand City 2', 'sales_officer',  150000, 10000, 60),
    ('Tirupathi', 'S R Grand City 2', 'abm',             75000,  7500, 60),
    ('Tirupathi', 'S R Grand City 2', 'branch_manager',  50000,  5000, 60),
    ('Tirupathi', 'S R Grand City 2', 'gm',              25000,  2500, 60),
    -- Nellore – Sri Krishna Brindavanam (SO monthly only)
    ('Nellore', 'Sri Krishna Brindavanam', 'sales_officer',  40000, 6000, 60),
    ('Nellore', 'Sri Krishna Brindavanam', 'abm',            25000,    0, NULL),
    ('Nellore', 'Sri Krishna Brindavanam', 'branch_manager', 15000,    0, NULL),
    ('Nellore', 'Sri Krishna Brindavanam', 'gm',             10000,    0, NULL),
    -- Chithoor – Sunrise City (SO monthly only)
    ('Chithoor', 'Sunrise City', 'sales_officer',  100000, 7000, 60),
    ('Chithoor', 'Sunrise City', 'abm',             70000,    0, NULL),
    ('Chithoor', 'Sunrise City', 'branch_manager',  30000,    0, NULL),
    ('Chithoor', 'Sunrise City', 'gm',              20000,    0, NULL),
    -- Veppur – Shree Narayanapuram (SO 36mo only)
    ('Veppur', 'Shree Narayanapuram', 'sales_officer',  12000, 4000, 36),
    ('Veppur', 'Shree Narayanapuram', 'abm',             7000,    0, NULL),
    ('Veppur', 'Shree Narayanapuram', 'branch_manager',  5000,    0, NULL),
    ('Veppur', 'Shree Narayanapuram', 'gm',              3000,    0, NULL),
    -- Melmalayanur – VRJ City (SO monthly only)
    ('Melmalayanur', 'VRJ City', 'sales_officer',  15000, 5000, 60),
    ('Melmalayanur', 'VRJ City', 'abm',            10000,    0, NULL),
    ('Melmalayanur', 'VRJ City', 'branch_manager',  7500,    0, NULL),
    ('Melmalayanur', 'VRJ City', 'gm',              5000,    0, NULL)
)
INSERT INTO land_layout_commission_rules
  (layout_id, role, spot_amount, monthly_amount, monthly_months)
SELECT
  li.layout_id,
  rd.role,
  rd.spot,
  rd.monthly,
  rd.months
FROM rule_data rd
JOIN layout_ids li
  ON li.site_name    = rd.site_name
  AND (li.layout_name = rd.layout_name OR (li.layout_name IS NULL AND rd.layout_name IS NULL))
ON CONFLICT (layout_id, role)
DO UPDATE SET
  spot_amount    = EXCLUDED.spot_amount,
  monthly_amount = EXCLUDED.monthly_amount,
  monthly_months = EXCLUDED.monthly_months,
  updated_at     = now();

-- Seed 0-amount placeholder rules for any other layouts without rules yet
INSERT INTO land_layout_commission_rules (layout_id, role)
SELECT l.id, r.role
FROM land_layouts l
CROSS JOIN (VALUES ('sales_officer'),('abm'),('branch_manager'),('gm')) AS r(role)
ON CONFLICT (layout_id, role) DO NOTHING;
