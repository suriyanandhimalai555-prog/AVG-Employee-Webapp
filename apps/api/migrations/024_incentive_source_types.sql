-- Migration 024: Expand employee_incentives source_type CHECK constraint
--
-- Migration 015 created the constraint with ('collection', 'gold_scheme', 'direct_cash', 'other').
-- The trading academy service (added later) inserts with 'scheme', which is not in that list.
-- Gold scheme incentives use 'gold_scheme'.
-- This migration drops the old constraint and re-adds it with all valid values.

ALTER TABLE employee_incentives
  DROP CONSTRAINT IF EXISTS employee_incentives_source_type_check;

ALTER TABLE employee_incentives
  ADD CONSTRAINT employee_incentives_source_type_check
  CHECK (source_type IN ('collection', 'gold_scheme', 'scheme', 'direct_cash', 'other'));
