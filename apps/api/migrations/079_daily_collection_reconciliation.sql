-- Migration 079: Daily Collection Reconciliation
-- Adds the management toggle and two tables for the daily branch collection
-- reconciliation workflow. Defaults to disabled so existing branches are unaffected.
--
-- daily_collection_summaries      — one per (branch, business_date); the
--   branch admin's morning declaration of expected cash per scheme.
-- daily_collection_summary_lines  — one row per scheme inside a summary.
-- Toggle is seeded false; management enables via settings endpoint.

-- Seed the feature toggle (app_settings already exists from migration 066)
INSERT INTO app_settings (key, value)
VALUES ('daily_collection_reconciliation_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Summary header — one per branch per business day
CREATE TABLE IF NOT EXISTS daily_collection_summaries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id     UUID        NOT NULL REFERENCES branches(id),
  business_date DATE        NOT NULL,
  submitted_by  UUID        NOT NULL REFERENCES users(id),
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID        REFERENCES users(id),
  updated_at    TIMESTAMPTZ,
  UNIQUE (branch_id, business_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_collection_summaries_branch_date
  ON daily_collection_summaries (branch_id, business_date);

-- Per-scheme declared amounts within a summary
CREATE TABLE IF NOT EXISTS daily_collection_summary_lines (
  id              UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_id      UUID           NOT NULL
                  REFERENCES daily_collection_summaries(id) ON DELETE CASCADE,
  scheme_code     TEXT           NOT NULL,
  expected_amount NUMERIC(12, 2) NOT NULL DEFAULT 0
                  CHECK (expected_amount >= 0),
  UNIQUE (summary_id, scheme_code)
);

CREATE INDEX IF NOT EXISTS idx_daily_collection_summary_lines_summary
  ON daily_collection_summary_lines (summary_id);
