// Server-side mirror of frontend/src/lib/schemePeriod.js.
// A "period" runs from the 7th of one month to the 6th of the next.
// Example: "Jun 2026 period" = 2026-06-07 to 2026-07-06
//
// Keep PERIOD_START_DAY in sync with the frontend helper if the business ever
// changes the period boundary. The two files are intentionally decoupled so
// the API has zero frontend dependencies; update both when the rule changes.

// TS: single constant for the cutoff day — one place to update if it ever changes.
const PERIOD_START_DAY = 7;

// Zero-pad a number to 2 digits.
const pad = (n: number): string => String(n).padStart(2, '0');

// Returns the period start date (YYYY-MM-07) of the period that contains the
// supplied ISO date string (YYYY-MM-DD). Month in the returned string is 1-indexed.
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
