// Guard for backdated scheme entry.
//
// Branch admins may submit entries dated before today ONLY while the
// 'backdated_entry_enabled' app setting is on. The management account is
// exempt — it exists precisely for historical data entry (migration 056)
// and can always backdate. Same-day and future-period dates never require
// the flag.
//
// Called from route handlers (alongside the other permission checks) so
// service signatures stay unchanged.
import { Pool, PoolClient } from 'pg';
import { ForbiddenError } from './errors';
import { Role } from './role-constants';

export const BACKDATED_ENTRY_KEY = 'backdated_entry_enabled';

// Today's date as YYYY-MM-DD in server-local time (matches how the
// frontend produces its date strings — never UTC-shifted).
export function todayISO(): string {
  return new Date().toLocaleDateString('en-CA');
}

// Reads the flag straight from app_settings — one indexed PK lookup, only
// on write paths, so no cache layer (a toggle must take effect immediately).
export async function isBackdatedEntryEnabled(
  db: Pool | PoolClient
): Promise<boolean> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [BACKDATED_ENTRY_KEY]
  );
  // TS: JSONB 'true' arrives parsed as boolean true; missing row = disabled
  return res.rows[0]?.value === true;
}

// Throws ForbiddenError when any supplied business date is before today and
// the caller is not allowed to backdate. Dates are 'YYYY-MM-DD' strings;
// null/undefined entries are skipped.
export async function assertBackdateAllowed(
  db: Pool | PoolClient,
  userRole: string,
  dates: Array<string | null | undefined>
): Promise<void> {
  if (userRole === Role.MANAGEMENT) return;

  const today = todayISO();
  const hasPastDate = dates.some(d => !!d && d < today);
  if (!hasPastDate) return;

  const enabled = await isBackdatedEntryEnabled(db);
  if (!enabled) {
    throw new ForbiddenError(
      'Backdated entry is currently disabled — ask Management to enable it',
      'BACKDATE_DISABLED'
    );
  }
}
