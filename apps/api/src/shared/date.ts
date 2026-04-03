/**
 * Returns today's date as YYYY-MM-DD in the company's operating timezone (IST = Asia/Kolkata, UTC+5:30).
 *
 * Using new Date().toISOString() is wrong for Indian users — it returns UTC time,
 * so at 2 AM IST the UTC date is still the previous day, breaking attendance deduplication
 * and the "today" summary check. All server-side "today" computations must use this function.
 */
export const getCompanyToday = (): string =>
  // en-CA locale always formats as YYYY-MM-DD, matching the PostgreSQL DATE column format
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
