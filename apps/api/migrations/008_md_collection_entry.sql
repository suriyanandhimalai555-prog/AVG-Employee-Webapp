-- Migration 008: MD direct collection entries
-- Adds override_branch_id so MD can submit collections attributed to a specific branch.
-- Adds notes field for optional context on any collection.
-- Adds idempotency_key to prevent duplicate submissions on network retries.

ALTER TABLE money_collections ADD COLUMN IF NOT EXISTS override_branch_id uuid REFERENCES branches(id);
ALTER TABLE money_collections ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE money_collections ADD COLUMN IF NOT EXISTS idempotency_key varchar(64);

-- Partial unique index: idempotency is only enforced when a key is provided (MD entries).
-- Regular worker entries have idempotency_key = NULL and are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS idx_money_collections_idempotency_key
  ON money_collections(idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Fast branch-scoped lookup for MD override entries
CREATE INDEX IF NOT EXISTS idx_money_collections_override_branch
  ON money_collections(override_branch_id)
  WHERE override_branch_id IS NOT NULL;
