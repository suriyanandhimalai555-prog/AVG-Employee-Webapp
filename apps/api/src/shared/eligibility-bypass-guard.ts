// Guard for the management-controlled draw-eligibility bypass toggles.
//
// Each scheme (LSS, Gold-Coin) has its own flag in app_settings so management
// can bypass the 30-day slot wait independently per scheme.
//
// Read directly from app_settings every time — no cache — so a management
// toggle takes effect on the very next draw attempt.
import { Pool, PoolClient } from 'pg';

// TS: stable key constants so the service, routes, and draw services never disagree on spelling
export const LSS_ELIGIBILITY_BYPASS_KEY       = 'lss_eligibility_bypass_enabled';
export const GOLD_COIN_ELIGIBILITY_BYPASS_KEY = 'gold_coin_eligibility_bypass_enabled';

/**
 * Returns true when the named bypass flag is ON in app_settings.
 * Accepts a Pool or an in-flight PoolClient so it can be called from
 * inside an open transaction (the draw services use a PoolClient).
 * Returns false when the row is missing (safe default: wait enforced).
 */
export async function isEligibilityBypassEnabled(
  db: Pool | PoolClient,
  key: string
): Promise<boolean> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [key]
  );
  // TS: JSONB 'false' arrives parsed as boolean false; missing row = disabled
  return res.rows[0]?.value === true;
}
