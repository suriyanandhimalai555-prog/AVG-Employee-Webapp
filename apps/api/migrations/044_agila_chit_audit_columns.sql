-- Migration 044: Add audit columns to agila_chit_groups + tighten member invariants.
--
-- Audit columns (mirrors gold_coin_rooms pattern):
--   activated_at / activated_by  → when/who triggered the forming → active transition
--   completed_at                 → when the final (month 20) winner was selected
--
-- Member invariant improvement:
--   A CHECK constraint ties has_won to won_month / winner_amount so those three
--   columns can never be in a partially-written state even with a direct DB insert.
--
-- Redundant group_id denormalisation note (not changed here):
--   agila_chit_payments.group_id is kept for query performance (avoids a join
--   through members on every summary query). The combineGroups service updates
--   both member and payment group_ids atomically inside a transaction, so the
--   denormalisation is safe. A comment is added for future maintainers.

-- 1. Audit columns on groups
ALTER TABLE agila_chit_groups
  ADD COLUMN IF NOT EXISTS activated_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_by  UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS completed_at  TIMESTAMPTZ;

-- 2. Backfill activated_at for groups already in active/completed state
--    (best-effort: use created_at as a proxy since the exact moment is unknown)
UPDATE agila_chit_groups
SET activated_at = created_at
WHERE status IN ('active', 'completed') AND activated_at IS NULL;

UPDATE agila_chit_groups
SET completed_at = created_at + INTERVAL '20 months'
WHERE status = 'completed' AND completed_at IS NULL;

-- 3. Member invariant: has_won = true ↔ won_month IS NOT NULL ↔ winner_amount IS NOT NULL
--    Prevents partially-written won state from a direct INSERT/UPDATE.
ALTER TABLE agila_chit_members
  DROP CONSTRAINT IF EXISTS agila_chit_members_won_invariant;

ALTER TABLE agila_chit_members
  ADD CONSTRAINT agila_chit_members_won_invariant
  CHECK (
    (has_won = true  AND won_month IS NOT NULL AND winner_amount IS NOT NULL) OR
    (has_won = false AND won_month IS NULL     AND winner_amount IS NULL)
  );

-- 4. Comment on the intentional group_id denormalisation in payments
COMMENT ON COLUMN agila_chit_payments.group_id IS
  'Denormalised from agila_chit_members.group_id for query performance. '
  'combineGroups updates both member and payment group_ids atomically. '
  'Always keep in sync with agila_chit_members.group_id.';
