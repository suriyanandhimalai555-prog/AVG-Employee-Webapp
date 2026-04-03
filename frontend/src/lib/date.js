/**
 * Returns today's date as a YYYY-MM-DD string in IST (Asia/Kolkata, UTC+05:30).
 *
 * Using new Date().toISOString() always returns UTC, which shifts the date back one
 * calendar day for anyone east of UTC — e.g. IST midnight shows as the previous UTC day.
 * This helper mirrors getCompanyToday() on the backend so date comparisons are consistent.
 */
export const getISTToday = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
