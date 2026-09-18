// Server-side mirror of frontend/src/lib/schemePeriod.js.
// The default period runs from the 7th of one month to the 6th of the next.
// Example: "Jun 2026 period" = 2026-06-07 to 2026-07-06
//
// Management can override any month's boundaries via the period_overrides table.
// When an override exists, that month's custom_start is used instead of the 7th,
// and the previous month's end is derived as (this month's start - 1 day) so
// the calendar stays contiguous.  No override row = default 7-to-6 math.
//
// Two exports:
//   getPeriodStartForDate — pure/sync, uses default math only.
//     Used as the fallback and by tests.
//   resolvePeriodStart — async, checks period_overrides then falls back to default.
//     Used everywhere a DB handle is available (guards, service queries).
//
// Keep the default logic in sync with frontend/src/lib/schemePeriod.js if the
// fallback boundary day ever changes.  The two files are intentionally decoupled
// (API has zero frontend dependencies); update both when the rule changes.

import type { Pool, PoolClient } from 'pg';

// TS: the default period cutoff day — still used as the fallback when no override exists.
// Exported so sibling modules (period-config service) can reference the same constant.
export const PERIOD_START_DAY = 7;

// Zero-pad a number to 2 digits.
const pad = (n: number): string => String(n).padStart(2, '0');

// Returns the period start date (YYYY-MM-07) of the period that contains the
// supplied ISO date string (YYYY-MM-DD) using the DEFAULT 7-to-6 math.
// Month in the returned string is 1-indexed.
//
// Examples (matching the frontend getPeriodForDate behaviour):
//   '2026-06-14' → '2026-06-07'   (day >= 7 → same month)
//   '2026-06-06' → '2026-05-07'   (day <  7 → previous month)
//   '2026-01-03' → '2025-12-07'   (year rollback)
//   '2026-06-07' → '2026-06-07'   (exactly the 7th = start of period)
export function getPeriodStartForDate(dateISO: string): string {
  // TS: destructure YYYY-MM-DD; month is 1-indexed throughout to avoid confusion.
  const parts = dateISO.split('-').map(Number);
  let year  = parts[0];
  let month = parts[1]; // 1–12
  const day = parts[2];

  if (day < PERIOD_START_DAY) {
    // Before the 7th → this date falls in the previous month's period
    month -= 1;
    if (month < 1) {
      month = 12;
      year  -= 1;
    }
  }

  return `${year}-${pad(month)}-${pad(PERIOD_START_DAY)}`;
}

// TS: builds the canonical period_key (YYYY-MM-07) for the default period that
// contains the given date.  This is the DB lookup key regardless of overrides.
function defaultPeriodKey(dateISO: string): string {
  return getPeriodStartForDate(dateISO);
}

// TS: adds N months to a 1-indexed month/year pair, handling year rollover.
function addMonth(year: number, month: number, delta: number): { year: number; month: number } {
  let m = month + delta;
  let y = year;
  while (m > 12) { m -= 12; y += 1; }
  while (m < 1)  { m += 12; y -= 1; }
  return { year: y, month: m };
}

// TS: builds a YYYY-MM-DD string from a 1-indexed month/year, using the default
// period start day (7th).  Used to generate DB lookup keys for neighbors.
function periodKeyFor(year: number, month: number): string {
  return `${year}-${pad(month)}-${pad(PERIOD_START_DAY)}`;
}

// TS: subtracts one calendar day from a YYYY-MM-DD string.
function subOneDay(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Async, override-aware resolver.  Used by the backdate guard and daily-collection
// service — both already hold a db/client handle so the async cost is negligible.
//
// Algorithm:
//   1. Compute the default candidate period containing dateISO (pure math).
//   2. Fetch override rows for the candidate and its two neighbors (3 rows max,
//      one indexed PK lookup each — fast).
//   3. Derive the resolved [start, end] for the candidate (override or default).
//   4. If dateISO falls outside [start, end], step once to the neighbor that
//      covers it (holiday shifts are at most a few days, so one step is enough).
//   5. Return the resolved start of the covering period.
//
// The function never loops more than twice — if both neighbors also miss, something
// is badly mis-configured and we fall back to the default.
export async function resolvePeriodStart(
  db: Pool | PoolClient,
  dateISO: string
): Promise<string> {
  // TS: parse the candidate period from default math (1-indexed month).
  const defaultKey = defaultPeriodKey(dateISO);
  const parts = defaultKey.split('-').map(Number);
  const candYear  = parts[0];
  const candMonth = parts[1]; // 1–12

  // TS: build keys for the candidate and its immediate neighbors.
  const prevNeighbor = addMonth(candYear, candMonth, -1);
  const nextNeighbor = addMonth(candYear, candMonth, +1);
  const nextNextNeighbor = addMonth(candYear, candMonth, +2);

  const keys = [
    periodKeyFor(prevNeighbor.year, prevNeighbor.month),
    defaultKey,
    periodKeyFor(nextNeighbor.year, nextNeighbor.month),
    periodKeyFor(nextNextNeighbor.year, nextNextNeighbor.month),
  ];

  // TS: single query fetches all needed override rows; PK-indexed scan.
  const res = await db.query<{ period_key: string; custom_start: string }>(
    `SELECT period_key::text, custom_start::text FROM period_overrides WHERE period_key = ANY($1::date[])`,
    [keys]
  );

  // TS: build a lookup map from period_key → custom_start (string 'YYYY-MM-DD').
  const overrideMap = new Map<string, string>();
  for (const row of res.rows) {
    overrideMap.set(row.period_key, row.custom_start);
  }

  // TS: resolve the actual start date for a given period_key, falling back to the
  // default 7th-of-month if no override exists.
  const resolveStart = (key: string): string => {
    return overrideMap.get(key) ?? key; // key is already 'YYYY-MM-07'
  };

  // TS: resolve the actual end date = (next period's start) - 1 day.
  const resolveEnd = (year: number, month: number): string => {
    const nm = addMonth(year, month, 1);
    return subOneDay(resolveStart(periodKeyFor(nm.year, nm.month)));
  };

  // TS: check if dateISO falls inside [start, end] for the candidate period.
  const candStart = resolveStart(defaultKey);
  const candEnd   = resolveEnd(candYear, candMonth);

  if (dateISO >= candStart && dateISO <= candEnd) {
    return candStart;
  }

  // Date is outside the candidate — check the previous period.
  const prevKey   = periodKeyFor(prevNeighbor.year, prevNeighbor.month);
  const prevStart = resolveStart(prevKey);
  const prevEnd   = resolveEnd(prevNeighbor.year, prevNeighbor.month);
  if (dateISO >= prevStart && dateISO <= prevEnd) {
    return prevStart;
  }

  // Check the next period.
  const nextKey   = periodKeyFor(nextNeighbor.year, nextNeighbor.month);
  const nextStart = resolveStart(nextKey);
  const nextEnd   = resolveEnd(nextNeighbor.year, nextNeighbor.month);
  if (dateISO >= nextStart && dateISO <= nextEnd) {
    return nextStart;
  }

  // TS: fallback — badly-misconfigured overrides; return the default period start
  // rather than throwing so callers always get a valid date.
  return defaultKey;
}

