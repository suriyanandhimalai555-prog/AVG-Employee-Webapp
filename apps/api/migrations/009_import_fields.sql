-- Migration 009: Fields needed for Excel-based bulk import
--
-- 1. users.employee_code  — human-friendly unique ID printed on IDs / payslips.
--    Branches reference this in the Excel to identify who submitted a collection.
--    NULL is allowed so existing rows are not affected.
--
-- 2. money_collections.reference_number — payment reference from GPay/bank receipts.
--    Kept separate from notes so it can be indexed and searched independently.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS employee_code VARCHAR(30) UNIQUE;

-- Partial index: only index rows that have a code (sparse, cheap)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_code
  ON users(employee_code)
  WHERE employee_code IS NOT NULL;

ALTER TABLE money_collections
  ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

-- Index for audit / fraud checks — "find all entries with this UPI ref"
CREATE INDEX IF NOT EXISTS idx_money_collections_reference_number
  ON money_collections(reference_number)
  WHERE reference_number IS NOT NULL;
