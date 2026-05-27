-- Migration 026: Add stable `code` column to projects
--
-- Problem: gold.service.ts and trading-academy.service.ts identify their project
-- by the user-editable `name` column. If an admin renames a project through the UI,
-- the service constant breaks and no commissions are credited.
--
-- Solution: A `code` column — set once at creation, never updated.
-- Services reference `code`; admins freely rename `name` without consequence.
--
-- Format: lowercase letters, digits, underscores only (validated in app layer too).

-- 1. Add nullable first so we can backfill before enforcing NOT NULL
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS code VARCHAR(50);

-- 2. Assign canonical codes to the two known system projects
UPDATE projects SET code = 'gold_scheme'    WHERE name = 'Monthly gold new'              AND code IS NULL;
UPDATE projects SET code = 'trading_academy' WHERE name = 'AGILAVETRI TRADING ACADEMY PVT LTD' AND code IS NULL;

-- 3. Auto-generate a slug for any other existing projects so NOT NULL can be enforced.
--    Strategy: lowercase the name, replace non-alphanumeric runs with underscores,
--    trim leading/trailing underscores, truncate to 50 chars.
UPDATE projects
SET code = SUBSTRING(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      LOWER(name),
      '[^a-z0-9]+', '_', 'g'  -- replace non-alphanumeric runs with _
    ),
    '^_+|_+$', '', 'g'         -- strip leading/trailing underscores
  ),
  1, 50
)
WHERE code IS NULL;

-- 4. Enforce NOT NULL, UNIQUE, and format constraint
ALTER TABLE projects
  ALTER COLUMN code SET NOT NULL;

ALTER TABLE projects
  ADD CONSTRAINT projects_code_unique UNIQUE (code);

ALTER TABLE projects
  ADD CONSTRAINT projects_code_format
  CHECK (code ~ '^[a-z0-9_]+$');
