// Land bookings — timing constants and date helpers shared by the booking sub-services.
// Cooling period, buyback length, advance window, and day/month date arithmetic.

// Number of days before buyback payments start after full payment is received
export const COOLING_DAYS   = 60;
// How many monthly buyback payout rows are created for the customer (fixed per booking)
export const BUYBACK_MONTHS = 60;
// Initial window (days) for the customer to pay the full amount after advance
export const ADVANCE_DAYS   = 30;

// ─── helpers ──────────────────────────────────────────────────────────────────

export function addDays(date: string, days: number): string {
  // TS: compute a new ISO date string by adding days to an existing YYYY-MM-DD date
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function addMonths(date: string, months: number): string {
  // TS: add calendar months to a YYYY-MM-DD string (handles month-end correctly)
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}
