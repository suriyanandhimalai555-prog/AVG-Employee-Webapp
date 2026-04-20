-- Migration 011: Auto-deactivation tracking for chronic absentees
-- Adds two columns to users so we can distinguish auto-deactivated accounts
-- from manually deactivated ones and record when it happened.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deactivated_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deactivation_reason VARCHAR(50);

-- deactivation_reason values:
--   'auto_absent_60d' — system deactivated after 60 consecutive absent days
--   NULL              — manually deactivated by admin (existing behaviour)

-- Fast lookup: find all auto-deactivated users quickly (used by MD dashboard)
CREATE INDEX IF NOT EXISTS idx_users_deactivated
  ON users (is_active, deactivation_reason)
  WHERE is_active = false;
