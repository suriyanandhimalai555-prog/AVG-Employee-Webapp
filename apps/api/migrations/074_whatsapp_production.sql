-- Migration 074: Production-grade WhatsApp infrastructure
--
-- 1. app_settings_history — append-only audit log for every toggle change.
-- 2. whatsapp_dispatch_cursors — per-(scheme, event) watermark for the worker
--    dispatch sweep. The sweep queries scheme tables for records newer than
--    the cursor, inserts outbox rows, and advances the cursor.  Seeded to
--    now() so only purchases made after this migration get notifications
--    (no retroactive spam to existing customers).

-- ── 1. Settings audit trail ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings_history (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL,
  old_value   JSONB,                          -- null on first write for a key
  new_value   JSONB       NOT NULL,
  changed_by  UUID        REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup: "who changed the WhatsApp toggle, and when?"
CREATE INDEX IF NOT EXISTS ix_app_settings_history_key_time
  ON app_settings_history (key, changed_at DESC);

-- ── 2. Dispatch cursors ────────────────────────────────────────────────────────
-- One row per (scheme_code, event) pair.  The dispatch sweep reads records
-- created strictly after dispatched_through and before now()-30s (buffer for
-- in-flight transactions), then advances dispatched_through.
CREATE TABLE IF NOT EXISTS whatsapp_dispatch_cursors (
  scheme_code        TEXT        NOT NULL,
  event              TEXT        NOT NULL
                       CHECK (event IN ('enrollment', 'renewal')),
  dispatched_through TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (scheme_code, event)
);

-- ── 3. Delivery tracking columns on whatsapp_notifications ───────────────────────
-- Meta sends POST callbacks when a message is delivered or read.
-- We store the timestamps here (status stays 'sent'; these are additive metadata).
-- 'failed_delivery' is a new terminal status for messages rejected by Meta after send.
ALTER TABLE whatsapp_notifications
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at      TIMESTAMPTZ;

-- ── 4. Seed cursors for all current schemes ───────────────────────────────────
-- Only new purchases trigger notifications.
-- Update dispatched_through to an earlier timestamp to backfill historical purchases.
INSERT INTO whatsapp_dispatch_cursors (scheme_code, event, dispatched_through)
VALUES
  ('gold_scheme',        'enrollment', now()),
  ('gold_scheme',        'renewal',    now()),
  ('trading_academy',    'enrollment', now()),
  ('gold_coin_scheme',   'enrollment', now()),
  ('lss_scheme',         'enrollment', now()),
  ('agila_chit_scheme',  'enrollment', now()),
  ('builders_scheme',    'enrollment', now()),
  ('land_scheme',        'enrollment', now())
ON CONFLICT (scheme_code, event) DO NOTHING;
