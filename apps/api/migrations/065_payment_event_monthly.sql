-- Migration 065: allow payment_event = 'monthly' on employee_incentives
--
-- Migration 028 added payment_event with CHECK (payment_event IN
-- ('enrollment', 'renewal')) and no later migration widened it. The land
-- scheme (LandIncentivesService.distributeMonthly) and the builders scheme
-- (BuildersIncentivesService monthly payouts) both insert
-- payment_event = 'monthly', so marking a land buyback payout paid (or a
-- builders payout) failed with a CHECK violation → 500.
--
-- This widens the constraint to the three events the code actually writes.
-- NULL still passes the CHECK (legacy collection/direct_cash rows).

ALTER TABLE employee_incentives
  DROP CONSTRAINT IF EXISTS employee_incentives_payment_event_check;

ALTER TABLE employee_incentives
  ADD CONSTRAINT employee_incentives_payment_event_check
  CHECK (payment_event IN ('enrollment', 'renewal', 'monthly'));
