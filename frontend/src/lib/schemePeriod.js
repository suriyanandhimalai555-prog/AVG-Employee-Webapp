// 7-to-7 business period utilities
// The default period runs from the 7th of one month to the 6th of the next.
// Example: "May 2026 period" = 2026-05-07 to 2026-06-06
//
// Management can override any month's start and end via the Business Calendar
// in the Management Control Center.  Overrides are stored in period_overrides
// (API) and loaded at bootstrap via GET /period-config into the module-level
// `overrides` map below.  All helpers here remain synchronous — only the data
// source changes.  For any month with no override, default 7-to-6 math applies.
//
// Server-side mirror: apps/api/src/shared/scheme-period.ts — the two files are
// intentionally decoupled (API has zero frontend dependencies).  If the default
// cutoff day ever changes, update BOTH files.

const pad = (n) => String(n).padStart(2, '0');

// ─── Override map ─────────────────────────────────────────────────────────────

// Module-level map: 'YYYY-MM' (0-indexed month as two digits) → 'YYYY-MM-DD' (custom start).
// Keys use 0-indexed months to align with JavaScript's Date.getMonth().
// Populated once at bootstrap by setPeriodOverrides(); empty = all default math.
let overrides = {};

// Called by the authenticated Layout when GET /period-config returns data.
// rows is the API response array: [{ periodYear, periodMonth, customStart }, ...]
// periodMonth in the API response is already 0-indexed.
export const setPeriodOverrides = (rows) => {
  const map = {};
  for (const r of rows) {
    const key = `${r.periodYear}-${pad(r.periodMonth)}`;
    map[key] = r.customStart;
  }
  overrides = map;
};

// Returns the resolved start date (YYYY-MM-DD) for a given 0-indexed month/year.
// Falls back to the default 7th-of-month if no override is set.
const startFor = (month, year) => {
  const key = `${year}-${pad(month)}`;
  return overrides[key] ?? `${year}-${pad(month + 1)}-07`;
};

// Returns the day-of-month integer from a YYYY-MM-DD string.
const dayOf = (dateStr) => parseInt(dateStr.slice(8, 10), 10);

// ─── Core helpers ─────────────────────────────────────────────────────────────

// Build a period object from a given month (0-indexed) and year.
// Uses override data when available; falls back to the default 7-to-6 math.
export const buildPeriod = (month, year) => {
  // Resolved start of this period.
  const startDate = startFor(month, year);

  // End is derived as (next period's start) - 1 day, so contiguity is guaranteed.
  let endMonth = month + 1;
  let endYear  = year;
  if (endMonth > 11) { endMonth = 0; endYear = year + 1; }
  const nextStart = startFor(endMonth, endYear);

  // Subtract one day from nextStart.
  const d = new Date(`${nextStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const endDate = d.toISOString().slice(0, 10);

  // Build the human label from the actual start/end day numbers so it reflects
  // custom dates (e.g. "8 May – 5 Jun 2026" instead of always "7 May – 6 Jun").
  const startDay = dayOf(startDate);
  const endDay   = dayOf(endDate);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const label = endYear !== year
    ? `${startDay} ${monthNames[month]} ${year} - ${endDay} ${monthNames[endMonth]} ${endYear}`
    : `${startDay} ${monthNames[month]} - ${endDay} ${monthNames[endMonth]} ${year}`;

  return {
    label,
    startDate,
    endDate,
    periodMonth: month,
    periodYear:  year,
  };
};

// Get the period that contains a given date.
// Steps to a neighboring period when an override shifts the boundary past the date.
// Returns { label, startDate, endDate, periodMonth, periodYear }
export const getPeriodForDate = (date = new Date()) => {
  const d     = new Date(date);
  const day   = d.getDate();
  const month = d.getMonth(); // 0-indexed
  const year  = d.getFullYear();
  const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;

  // Default candidate: same month if day >= 7, previous month otherwise.
  let candMonth, candYear;
  if (day >= 7) {
    candMonth = month;
    candYear  = year;
  } else {
    if (month === 0) { candMonth = 11; candYear = year - 1; }
    else             { candMonth = month - 1; candYear = year; }
  }

  const candidate = buildPeriod(candMonth, candYear);
  if (dateStr >= candidate.startDate && dateStr <= candidate.endDate) {
    return candidate;
  }

  // Date is outside the candidate — check the previous period.
  let prevMonth = candMonth - 1;
  let prevYear  = candYear;
  if (prevMonth < 0) { prevMonth = 11; prevYear -= 1; }
  const prev = buildPeriod(prevMonth, prevYear);
  if (dateStr >= prev.startDate && dateStr <= prev.endDate) return prev;

  // Check the next period.
  let nextMonth = candMonth + 1;
  let nextYear  = candYear;
  if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
  const next = buildPeriod(nextMonth, nextYear);
  if (dateStr >= next.startDate && dateStr <= next.endDate) return next;

  // Fallback — shouldn't be reached with well-formed overrides.
  return candidate;
};

// Navigate to the next period.
export const getNextPeriod = (periodMonth, periodYear) => {
  let m = periodMonth + 1;
  let y = periodYear;
  if (m > 11) { m = 0; y += 1; }
  return buildPeriod(m, y);
};

// Navigate to the previous period.
export const getPrevPeriod = (periodMonth, periodYear) => {
  let m = periodMonth - 1;
  let y = periodYear;
  if (m < 0) { m = 11; y -= 1; }
  return buildPeriod(m, y);
};

// Get the current period (based on the device's local date, matching prior behaviour).
export const getCurrentPeriod = () => getPeriodForDate(new Date());
