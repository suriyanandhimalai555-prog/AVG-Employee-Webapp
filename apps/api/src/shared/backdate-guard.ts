// Guard for backdated scheme entry.
//
// Branch admins may submit entries dated before the START of the current
// 7-to-6 business period ONLY while the 'backdated_entry_enabled' app
// setting is on. Entries dated within the current period (i.e. >= period
// start, even if before today) are always allowed — they are same-period
// entries, not true backdates. The management account is exempt from the
// flag for all past dates. Future dates (> today) are not blocked here;
// the frontend caps them via PeriodDateInput.max = period.endDate.
//
// Called from route handlers (alongside the other permission checks) so
// service signatures stay unchanged.
import { Pool, PoolClient } from 'pg';
import { ForbiddenError } from './errors';
import { Role } from './role-constants';
// TS: period helper keeps the 7-to-6 boundary in one place (shared/scheme-period.ts
// mirrors frontend/src/lib/schemePeriod.js — update both if the cutoff changes).
import { getPeriodStartForDate } from './scheme-period';

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

// Throws ForbiddenError when any supplied business date falls before the start
// of the current 7-to-6 period AND the caller is not allowed to backdate.
// Entries within the current period (including dates between the period start
// and today) are always permitted — only cross-period dates need the flag.
// Dates are 'YYYY-MM-DD' strings; null/undefined entries are skipped.
export async function assertBackdateAllowed(
  db: Pool | PoolClient,
  userRole: string,
  dates: Array<string | null | undefined>
): Promise<void> {
  // TS: management is always exempt — it exists for historical data entry.
  if (userRole === Role.MANAGEMENT) return;

  // Compute the start of the period containing today (e.g. '2026-06-07').
  // Dates on or after this are same-period entries and never require the flag.
  const periodStart = getPeriodStartForDate(todayISO());
  const hasPriorPeriodDate = dates.some(d => !!d && d < periodStart);
  if (!hasPriorPeriodDate) return;

  const enabled = await isBackdatedEntryEnabled(db);
  if (!enabled) {
    throw new ForbiddenError(
      'Backdating before the current period is disabled — ask Management to enable it',
      'BACKDATE_DISABLED'
    );
  }
}
