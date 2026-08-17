-- Migration 085: Auto-deactivation management controls
--
-- Makes the chronic-absentee auto-deactivation sweep management-configurable via
-- app_settings, replacing the hard-coded ABSENCE_THRESHOLD_DAYS = 60 constant in
-- the worker (apps/worker/src/processors/autoDeactivate.ts).
--
--   auto_deactivation_enabled        — boolean master switch (seed ON to preserve
--                                       today's behaviour; Management can pause it)
--   auto_deactivation_threshold_days — number of days with no present/half_day/field
--                                       attendance before an account is deactivated
--                                       (seed 90; Management edits it in the UI)
--
-- Both are stored the same way as the existing boolean flags (066/072/073/079).

INSERT INTO app_settings (key, value) VALUES
  ('auto_deactivation_enabled',        'true'::jsonb),
  ('auto_deactivation_threshold_days', '90'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Decouple the deactivation_reason sentinel from the (now variable) threshold.
-- The worker, the deactivated-users list, and the reactivate query all key off
-- this string; going forward they use the generic 'auto_absent'. Backfill any
-- rows written by the old '60d' sweep so they stay visible/reactivatable.
-- Idempotent: no-ops on databases that never ran the old sweep.
UPDATE users
SET deactivation_reason = 'auto_absent'
WHERE deactivation_reason = 'auto_absent_60d';
