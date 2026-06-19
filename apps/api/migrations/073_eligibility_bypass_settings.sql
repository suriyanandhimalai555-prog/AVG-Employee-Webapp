-- Migration 073: Seed management toggles to bypass the 30-day draw eligibility wait
-- in LSS and Gold-Coin schemes.
--
-- Both flags default to FALSE so the existing safeguard remains in place until
-- management explicitly enables a bypass via the Control Center.
-- The app_settings table already exists (migration 066).

INSERT INTO app_settings (key, value)
VALUES
  ('lss_eligibility_bypass_enabled',       'false'::jsonb),
  ('gold_coin_eligibility_bypass_enabled', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;
