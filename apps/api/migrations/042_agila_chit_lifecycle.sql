-- Migration 042: Full Agila Chit group lifecycle.
--
-- Adds two new columns and widens the status CHECK constraint to mirror the
-- Gold Coin / LSS room lifecycle (filling → active → completed, plus the
-- head-branch combine path: pending_combine → combined_into / expired).
--
-- Lifecycle:
--   forming         → group is collecting members (initial state, deadline-gated)
--   active          → exactly 20 members enrolled; winner selection is open
--   completed       → all 20 winner selections done
--   pending_combine → sent to head branch because the deadline passed or admin
--                     manually forwarded the group
--   combined_into   → terminal: members absorbed by a head-branch combined group
--   expired         → terminal: head branch refunded / dissolved the group

-- 1. New columns
ALTER TABLE agila_chit_groups
  ADD COLUMN IF NOT EXISTS fill_deadline          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS combined_into_group_id UUID REFERENCES agila_chit_groups(id);

-- 2. Widen the status CHECK (drop old constraint, add new one)
ALTER TABLE agila_chit_groups
  DROP CONSTRAINT IF EXISTS agila_chit_groups_status_check;

ALTER TABLE agila_chit_groups
  ADD CONSTRAINT agila_chit_groups_status_check
  CHECK (status IN ('forming','active','completed','pending_combine','combined_into','expired'));

-- 3. Change the column DEFAULT so new groups start in 'forming'
ALTER TABLE agila_chit_groups
  ALTER COLUMN status SET DEFAULT 'forming';

-- 4. Data migration: all existing 'active' groups had < 20 members (test data).
--    Move them to 'forming' and set a 30-day fill window from their creation date.
UPDATE agila_chit_groups
SET   status       = 'forming',
      fill_deadline = created_at + INTERVAL '30 days'
WHERE status = 'active';

-- 5. Promote back any group that genuinely has 20 members already.
UPDATE agila_chit_groups g
SET   status = 'active'
WHERE status = 'forming'
  AND (SELECT COUNT(*) FROM agila_chit_members WHERE group_id = g.id) = 20;

-- 6. Partial index for the head-branch inbox query
CREATE INDEX IF NOT EXISTS idx_agila_chit_groups_pending
  ON agila_chit_groups(status, fill_deadline)
  WHERE status IN ('forming', 'pending_combine');
