-- Migration 088: Employee rename audit trail
-- Stores a permanent record of every name change made via the Management
-- rename tool. Append-only — never updated; corrections get a new row.

CREATE TABLE IF NOT EXISTS user_rename_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id),
  previous_name VARCHAR(200) NOT NULL,
  new_name      VARCHAR(200) NOT NULL,
  reason        TEXT,
  renamed_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Newest-first lookup for the management history panel (covers all renames).
CREATE INDEX IF NOT EXISTS idx_user_rename_audit_recent
  ON user_rename_audit (created_at DESC);

-- Per-user history (used to show rename history on a specific employee's record).
CREATE INDEX IF NOT EXISTS idx_user_rename_audit_user
  ON user_rename_audit (user_id, created_at DESC);
