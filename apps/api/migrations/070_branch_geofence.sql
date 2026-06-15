-- 070_branch_geofence.sql
-- Adds geofencing support to branches.
-- latitude/longitude: nullable — NULL means "no geofence configured for this branch".
-- geofence_radius_m: default 150 m (generous enough for browser GPS accuracy jitter
--   while still confining check-in to the immediate premises).
-- ADD COLUMN IF NOT EXISTS makes this migration idempotent.
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS latitude          DECIMAL(9,6),          -- matches attendance.check_in_lat/lng precision
  ADD COLUMN IF NOT EXISTS longitude         DECIMAL(9,6),
  ADD COLUMN IF NOT EXISTS geofence_radius_m INTEGER NOT NULL DEFAULT 150;
