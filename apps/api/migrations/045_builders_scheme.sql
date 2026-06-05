-- Migration 045: Builders Scheme
--
-- Agila Vetri Groups Builders Scheme:
--   - 1 member per plan (individual investment, no group pooling)
--   - 6 fixed packages (₹5L / ₹10L / ₹15L / ₹20L / ₹25L / ₹30L)
--   - One-time lump sum payment upfront
--   - 60-day cooling period after lump sum before payouts begin
--   - Month 1-50 → fixed monthly payout to customer
--   - Month 50 → customer chooses: House (needs land) or Cash (higher payout M51-60)
--   - Month 51-60 → house gets built (company) OR higher monthly cash payout
--   - Plans are independent; one customer can hold multiple plans simultaneously
--
-- Tables: builders_plans (one row per enrollment) + builders_payouts (≤60 rows per plan)

CREATE TABLE IF NOT EXISTS builders_plans (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID        NOT NULL REFERENCES branches(id),
  customer_id         UUID        NOT NULL REFERENCES customers(id),
  package_number      INTEGER     NOT NULL CHECK (package_number BETWEEN 1 AND 6),

  -- All package amounts denormalised at enrollment so future package changes do not affect
  -- existing plans. Derived from BUILDERS_PACKAGES in the service layer.
  investment_amount   NUMERIC(12,2) NOT NULL CHECK (investment_amount > 0),
  monthly_payout      NUMERIC(12,2) NOT NULL CHECK (monthly_payout > 0),   -- M1-50 fixed amount
  cash_final_monthly  NUMERIC(12,2) NOT NULL CHECK (cash_final_monthly > 0), -- M51-60 (cash path)
  house_worth         NUMERIC(12,2) NOT NULL CHECK (house_worth > 0),       -- house value (house path)

  -- Enrollment timeline
  lump_sum_date       DATE        NOT NULL,
  lump_sum_mode       VARCHAR(20) NOT NULL DEFAULT 'cash'
                      CHECK (lump_sum_mode IN ('cash', 'gpay', 'bank_receipt')),
  -- cooling_end_date = lump_sum_date + 60 days; payout_start_date = same
  cooling_end_date    DATE        NOT NULL,
  payout_start_date   DATE        NOT NULL,

  -- Lifecycle tracking
  -- current_month tracks the last recorded payout month (0 = none yet / still cooling)
  current_month       INTEGER     NOT NULL DEFAULT 0 CHECK (current_month BETWEEN 0 AND 60),
  -- reward_choice is set at month 50 when customer picks house or cash
  reward_choice       VARCHAR(10) CHECK (reward_choice IN ('house', 'cash')),
  choice_made_at      TIMESTAMPTZ,
  choice_made_by      UUID        REFERENCES users(id),
  -- land_provided is required to be true when choosing house
  land_provided       BOOLEAN     NOT NULL DEFAULT false,
  status              VARCHAR(20) NOT NULL DEFAULT 'cooling'
                      CHECK (status IN (
                        'cooling',           -- within 60-day cooling window
                        'active',            -- payouts running M1-50
                        'decision_pending',  -- month 50 done; awaiting house/cash choice
                        'house',             -- chose house; company building
                        'cash',              -- chose cash; paying M51-60 at higher rate
                        'completed',         -- all done (cash path: M60 paid | house path: admin confirms)
                        'cancelled'          -- terminated early
                      )),

  -- Referrer scaffold — amounts are 0% until incentive logic is designed (migration 047).
  -- referrer_name is denormalised so it survives referrer deactivation.
  referrer_id         UUID        REFERENCES users(id),
  referrer_name       VARCHAR(200),

  notes               TEXT,
  entered_by          UUID        NOT NULL REFERENCES users(id),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builders_plans_branch   ON builders_plans(branch_id);
CREATE INDEX IF NOT EXISTS idx_builders_plans_customer ON builders_plans(customer_id);
CREATE INDEX IF NOT EXISTS idx_builders_plans_status   ON builders_plans(status);
CREATE INDEX IF NOT EXISTS idx_builders_plans_referrer ON builders_plans(referrer_id);

-- ─── Payout ledger ────────────────────────────────────────────────────────────
-- Up to 60 rows per plan (one per month).
-- Cash path uses all 60; house path uses only M1-50 (no M51-60 payouts).

CREATE TABLE IF NOT EXISTS builders_payouts (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id       UUID        NOT NULL REFERENCES builders_plans(id),
  month_number  INTEGER     NOT NULL CHECK (month_number BETWEEN 1 AND 60),
  amount        NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payout_date   DATE        NOT NULL,
  payment_mode  VARCHAR(20) NOT NULL DEFAULT 'cash'
                CHECK (payment_mode IN ('cash', 'gpay', 'bank_receipt')),
  notes         TEXT,
  entered_by    UUID        NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  -- Prevents duplicate months for the same plan
  UNIQUE (plan_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_builders_payouts_plan ON builders_payouts(plan_id);
