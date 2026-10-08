-- Add branch_id to agila_chit_members so the original branch is preserved after
-- a group is sent to the head branch and combined.
--
-- Without this column, once groups are combined the member's original branch is
-- structurally lost (it could only be derived from the source group, which is now
-- status='combined_into'). The new column lets the original branch admin view and
-- update their own members' payment details in the combined group.
--
-- Idempotent:
--   • IF NOT EXISTS on ALTER TABLE — safe to re-run if partially applied.
--   • WHERE branch_id IS NULL on UPDATE — backfill is a no-op on second run.
--   • CREATE INDEX IF NOT EXISTS — always safe to re-run.

ALTER TABLE agila_chit_members
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

-- Backfill existing rows from the member's current group branch_id.
-- For members already in a combined group (branch_id = head branch), this is the
-- best available backfill — the true original branch is unrecoverable post-combine.
UPDATE agila_chit_members m
SET    branch_id = g.branch_id
FROM   agila_chit_groups g
WHERE  g.id           = m.group_id
  AND  m.branch_id IS NULL;

-- Index for combine-visibility lookups and branch-scoped payment writes.
CREATE INDEX IF NOT EXISTS idx_agila_chit_members_branch_id
  ON agila_chit_members(branch_id);
