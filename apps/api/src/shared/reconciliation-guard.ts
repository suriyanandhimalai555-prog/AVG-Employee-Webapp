// Guard for daily branch collection reconciliation.
//
// When 'daily_collection_reconciliation_enabled' is on, branch admins must
// submit a Daily Collection Summary before making any scheme entry for the day.
// Management is always exempt (same pattern as backdate-guard.ts).
//
// Called from route handlers immediately after branchId is resolved, right
// after the assertBackdateAllowed call, so service signatures stay unchanged.
import { Pool, PoolClient } from 'pg';
import { ForbiddenError } from './errors';
import { Role } from './role-constants';
// TS: IST-aware "today" — never use new Date() on UTC servers; gives wrong date
//     for 5.5 hours every day in India.
import { getCompanyToday } from './date';

export const RECONCILIATION_KEY = 'daily_collection_reconciliation_enabled';

// Reads the flag from app_settings — no cache (toggle must take effect immediately).
export async function isReconciliationEnabled(
  db: Pool | PoolClient
): Promise<boolean> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [RECONCILIATION_KEY]
  );
  // TS: JSONB 'true' arrives parsed as boolean true; missing row = disabled
  return res.rows[0]?.value === true;
}

// Throws ForbiddenError when the feature is enabled and the branch has no
// Daily Collection Summary submitted for today.
// Management is always exempt — they handle corrections and out-of-hours ops.
export async function assertReconciliationSubmitted(
  db: Pool | PoolClient,
  userRole: string,
  branchId: string
): Promise<void> {
  // TS: management is always exempt — same exemption pattern as assertBackdateAllowed
  if (userRole === Role.MANAGEMENT) return;

  const enabled = await isReconciliationEnabled(db);
  if (!enabled) return;

  const today = getCompanyToday();
  const res = await db.query(
    `SELECT 1 FROM daily_collection_summaries
     WHERE branch_id = $1 AND business_date = $2`,
    [branchId, today]
  );
  if (res.rows.length === 0) {
    throw new ForbiddenError(
      "Complete today's Daily Collection Summary before entering scheme data",
      'DAILY_RECONCILIATION_REQUIRED'
    );
  }
}
