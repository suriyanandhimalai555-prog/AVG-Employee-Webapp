// Guard/readers for the chronic-absentee auto-deactivation sweep.
//
// The daily worker job (apps/worker/src/processors/autoDeactivate.ts) deactivates
// ABM/Sales Officer/OA accounts that have had no present/half_day/field attendance
// for a configurable number of days. Both the master switch and the threshold live
// in app_settings so Management can change them at runtime without a redeploy.
//
// Read straight from app_settings — one indexed PK lookup, no cache, so a toggle
// takes effect immediately (same convention as the other feature-flag guards).
import { Pool, PoolClient } from 'pg';

export const AUTO_DEACTIVATION_ENABLED_KEY = 'auto_deactivation_enabled';
export const AUTO_DEACTIVATION_THRESHOLD_KEY = 'auto_deactivation_threshold_days';

// Fallback used whenever the threshold row is missing or holds a non-positive /
// non-numeric value — keeps the sweep sane if the seed ever goes missing.
export const AUTO_DEACTIVATION_DEFAULT_DAYS = 90;

// True only when the master switch is explicitly on. Missing row = disabled.
export async function isAutoDeactivationEnabled(
  db: Pool | PoolClient
): Promise<boolean> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [AUTO_DEACTIVATION_ENABLED_KEY]
  );
  // TS: JSONB 'true' arrives parsed as boolean true; missing row = disabled
  return res.rows[0]?.value === true;
}

// The absence threshold in days. JSONB numbers come back as JS numbers; anything
// invalid (missing / not a positive number) falls back to the default.
export async function getAutoDeactivationThresholdDays(
  db: Pool | PoolClient
): Promise<number> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [AUTO_DEACTIVATION_THRESHOLD_KEY]
  );
  const value = res.rows[0]?.value;
  // TS: guard against a corrupted / missing seed so the query never gets NaN or 0
  return typeof value === 'number' && value > 0 ? value : AUTO_DEACTIVATION_DEFAULT_DAYS;
}
