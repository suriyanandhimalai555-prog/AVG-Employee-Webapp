-- Migration 049: Restore correct cash_final_monthly (bonus) amounts for builders_plans.
--
-- The Builders Scheme structure:
--   M1-60  : customer receives monthly_payout every month (all 60 months)
--   M51-60 : if cash path, customer ALSO receives cash_final_monthly as an additional bonus
--   Total per month for M51-60 (cash) = monthly_payout + cash_final_monthly
--
-- Migration 048 incorrectly set cash_final_monthly = monthly_payout.
-- This restores cash_final_monthly to the correct per-package bonus amounts.

UPDATE builders_plans
SET cash_final_monthly = CASE package_number
  WHEN 1 THEN 120000.00
  WHEN 2 THEN 240000.00
  WHEN 3 THEN 360000.00
  WHEN 4 THEN 480000.00
  WHEN 5 THEN 600000.00
  WHEN 6 THEN 720000.00
END;
