-- Migration 048: Fix builders_plans.cash_final_monthly.
--
-- The Builders Scheme pays the same fixed monthly amount for ALL 60 months (1-60).
-- The original migration seeded cash_final_monthly with a higher value (6× monthly_payout)
-- which was incorrect. This corrects existing rows so cash_final_monthly = monthly_payout.
-- New plans created after this migration already insert cash_final_monthly = monthly_payout.

UPDATE builders_plans
SET cash_final_monthly = monthly_payout
WHERE cash_final_monthly <> monthly_payout;
