-- Migration 072: WhatsApp notification outbox + has_whatsapp on customers
-- Adds:
--   customers.has_whatsapp      — customer opted in to WhatsApp messages
--   whatsapp_notifications      — transactional outbox (one row per purchase/renewal event)
--   app_settings seed           — business toggle, defaults OFF (management opts in)

-- ── 1. Customer opt-in flag ────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS has_whatsapp BOOLEAN NOT NULL DEFAULT false;

-- ── 2. Outbox table ────────────────────────────────────────────────────────────
-- One row per scheme purchase/renewal event.  Inserted INSIDE the same
-- database transaction as the purchase — so if the purchase rolls back, the
-- notification row rolls back too.  The worker reads the row, sends the
-- WhatsApp message, and marks it sent/failed/skipped.
CREATE TABLE IF NOT EXISTS whatsapp_notifications (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Scheme that generated this notification
  scheme_code          VARCHAR(50)  NOT NULL,
  -- 'enrollment' (new member/plan/slot/booking) or 'renewal' (gold month 2+)
  event                VARCHAR(20)  NOT NULL
                         CHECK (event IN ('enrollment', 'renewal')),
  -- Unique event handle — member_id, payment_id, slot_id, booking_id etc.
  -- The unique index below makes ON CONFLICT DO NOTHING safe for retries.
  source_id            UUID         NOT NULL,

  -- Customer to message (phone + has_whatsapp resolved fresh by the worker)
  customer_id          UUID         NOT NULL REFERENCES customers(id),
  branch_id            UUID         NOT NULL REFERENCES branches(id),

  -- Template fields — snapshotted at write time so the worker never needs to
  -- re-join scheme tables (amount, month number, etc. may be corrected later).
  template_name        VARCHAR(100) NOT NULL,
  template_params      JSONB        NOT NULL DEFAULT '{}',

  -- Lifecycle
  -- 'sending' is the in-flight claim state: claimed by one worker, not yet sent.
  -- This is the atomic lock that prevents duplicate sends when two workers race
  -- (sweep job + original retry both running at once).
  status               VARCHAR(20)  NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'skipped')),
  skip_reason          TEXT,           -- e.g. 'no_phone' | 'no_whatsapp' | 'messages_disabled' | 'infra_disabled'
  provider_message_id  VARCHAR(255),   -- WAMID returned by Meta on success
  last_error           TEXT,
  attempts             INT          NOT NULL DEFAULT 0,

  created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  sent_at              TIMESTAMPTZ
);

-- Deduplication: one notification per scheme+event+source combination.
-- INSERT ... ON CONFLICT DO NOTHING makes all write paths idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_event
  ON whatsapp_notifications (scheme_code, event, source_id);

-- Fast sweep for the scheduler recovery job: find pending/failed rows to retry.
CREATE INDEX IF NOT EXISTS ix_whatsapp_pending
  ON whatsapp_notifications (status, created_at)
  WHERE status IN ('pending', 'failed');

-- ── 3. Seed the business toggle (default OFF — management enables when ready) ─
INSERT INTO app_settings (key, value)
VALUES ('whatsapp_messages_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
