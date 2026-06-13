-- Migration 067: Enforce unique chit group names per branch (case-insensitive)
--
-- A manually-created group name must be unique within a branch forever so that
-- branch admins and members can never confuse two groups with identical names.
-- Combined groups (is_combined = true) are auto-named ("Combined: A + B") and
-- are excluded from the constraint so the combine flow is never blocked.
--
-- Step 1: Rename pre-existing duplicates before adding the unique index.
--   All but the earliest group in each (branch_id, LOWER(group_name)) bucket
--   are renamed to "<original> (<n>)" using ROW_NUMBER ordering by created_at.
--   The suffix keeps the total within VARCHAR(100).
UPDATE agila_chit_groups
SET group_name = LEFT(group_name, 90) || ' (' || rn || ')'
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY branch_id, LOWER(group_name)
      ORDER BY created_at, id
    ) AS rn
  FROM agila_chit_groups
  WHERE is_combined = false
) ranked
WHERE agila_chit_groups.id = ranked.id
  AND ranked.rn > 1;

-- Step 2: Partial unique index — only non-combined groups, case-insensitive
CREATE UNIQUE INDEX IF NOT EXISTS uq_agila_chit_group_name_per_branch
  ON agila_chit_groups (branch_id, LOWER(group_name))
  WHERE is_combined = false;

