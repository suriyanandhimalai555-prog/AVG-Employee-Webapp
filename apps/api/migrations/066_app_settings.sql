-- Migration 066: app_settings key/value store + backdated-entry flag.
--
-- Backdated entry: branch admins may submit scheme entries whose business
-- date (start/enrollment/payment/sale date) is in the past ONLY while
-- 'backdated_entry_enabled' is true. The management account is exempt and
-- can always backdate. Seeded TRUE because historical data entry is in
-- progress — management flips it off from the Control Center once done.

CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO app_settings (key, value)
VALUES ('backdated_entry_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;
