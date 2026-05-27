-- Migration 028: Unify scheme incentive bookkeeping
--
-- Today two divergent code paths write to employee_incentives:
--   - Trading Academy → IncentiveService.distributeIncentives (source_type='scheme')
--   - Gold scheme    → inline INSERT inside GoldService    (source_type='gold_scheme')
-- And the gold summary uses fragile `source_description LIKE 'Gold ...'` matching.
--
-- This migration:
--   1. Adds scheme_code on employee_incentives (joins straight to projects.code).
--   2. Adds payment_event so gold can distinguish new vs renewal commission
--      without LIKE-matching descriptions.
--   3. Backfills both columns from existing rows.
--   4. Collapses source_type — every scheme row becomes source_type='scheme',
--      and the CHECK constraint drops 'gold_scheme'.
--   5. Enforces scheme_code IS NOT NULL when source_type='scheme'.

-- 1. New columns
ALTER TABLE employee_incentives
  ADD COLUMN IF NOT EXISTS scheme_code   VARCHAR(50);

ALTER TABLE employee_incentives
  ADD COLUMN IF NOT EXISTS payment_event VARCHAR(20)
    CHECK (payment_event IN ('enrollment', 'renewal'));

-- 2. Backfill gold rows
UPDATE employee_incentives
SET scheme_code   = 'gold_scheme',
    payment_event = CASE
      WHEN source_description LIKE 'Gold enrollment:%' THEN 'enrollment'
      WHEN source_description LIKE 'Gold M%'           THEN 'renewal'
      ELSE NULL
    END
WHERE source_type = 'gold_scheme'
  AND scheme_code IS NULL;

-- 3. Backfill trading-academy rows.
-- Everything else with source_type='scheme' came from distributeIncentives,
-- which until now had only one caller: TradingAcademyService.addMember.
UPDATE employee_incentives
SET scheme_code   = 'trading_academy',
    payment_event = 'enrollment'
WHERE source_type = 'scheme'
  AND scheme_code IS NULL;

-- 4. Collapse source_type — gold rows fold into 'scheme'
UPDATE employee_incentives
SET source_type = 'scheme'
WHERE source_type = 'gold_scheme';

-- 5. Tighten the source_type CHECK
ALTER TABLE employee_incentives
  DROP CONSTRAINT IF EXISTS employee_incentives_source_type_check;

ALTER TABLE employee_incentives
  ADD CONSTRAINT employee_incentives_source_type_check
  CHECK (source_type IN ('collection', 'scheme', 'direct_cash', 'other'));

-- 6. Enforce scheme_code presence whenever source_type='scheme'
ALTER TABLE employee_incentives
  DROP CONSTRAINT IF EXISTS employee_incentives_scheme_code_check;

ALTER TABLE employee_incentives
  ADD CONSTRAINT employee_incentives_scheme_code_check
  CHECK (
    (source_type = 'scheme' AND scheme_code IS NOT NULL)
    OR source_type <> 'scheme'
  );

-- 7. Index for scheme-scoped summaries
CREATE INDEX IF NOT EXISTS idx_incentives_scheme
  ON employee_incentives(scheme_code, payment_event);
