-- Migration 057: Promote Builders packages from hardcoded TypeScript to a DB table.
--
-- Previously BUILDERS_PACKAGES was a plain object in builders.schema.ts.
-- Moving it to the DB lets the Management Control Center edit package amounts
-- without a code deploy. Existing enrolled plans are unaffected — amounts are
-- denormalised into builders_plans at enrollment time.

CREATE TABLE IF NOT EXISTS builders_packages (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  package_number      INTEGER       NOT NULL UNIQUE CHECK (package_number BETWEEN 1 AND 6),
  investment_amount   NUMERIC(14,2) NOT NULL CHECK (investment_amount > 0),
  monthly_payout      NUMERIC(12,2) NOT NULL CHECK (monthly_payout > 0),
  -- Additional monthly bonus for M51–60 on top of monthly_payout (cash path only)
  cash_final_monthly  NUMERIC(12,2) NOT NULL CHECK (cash_final_monthly > 0),
  house_worth         NUMERIC(14,2) NOT NULL CHECK (house_worth > 0),
  is_active           BOOLEAN       NOT NULL DEFAULT true,
  updated_at          TIMESTAMPTZ   DEFAULT now()
);

-- Seed from the current hardcoded values — idempotent
INSERT INTO builders_packages
  (package_number, investment_amount, monthly_payout, cash_final_monthly, house_worth)
VALUES
  (1,   500000,  20000, 120000, 1000000),
  (2,  1000000,  40000, 240000, 2000000),
  (3,  1500000,  60000, 360000, 3000000),
  (4,  2000000,  80000, 480000, 4000000),
  (5,  2500000, 100000, 600000, 5000000),
  (6,  3000000, 120000, 720000, 6000000)
ON CONFLICT (package_number) DO UPDATE
  SET investment_amount  = EXCLUDED.investment_amount,
      monthly_payout     = EXCLUDED.monthly_payout,
      cash_final_monthly = EXCLUDED.cash_final_monthly,
      house_worth        = EXCLUDED.house_worth,
      updated_at         = now();
