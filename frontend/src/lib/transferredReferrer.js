/**
 * Utilities for handling transferred-out referrers in scheme entry pickers.
 *
 * After a staff member is transferred out of a branch they remain visible in
 * the referrer picker (so the branch admin can backfill pre-transfer scheme
 * entries) but are flagged as `transferred` by the API.  These helpers drive
 * the UI restrictions:
 *   • label "(Transferred)" shown in the <select> option
 *   • entry-date input capped at `maxEntryDate` (day before transfer)
 *   • submit guard shows an inline error if the date is out of range
 *
 * The authoritative enforcement is server-side (transferred-referrer-guard.ts).
 * These helpers are UI polish only.
 */

/**
 * Given the employees array from useGetGoldEmployeesQuery and a selected
 * referrerId, returns restriction info for the selected referrer.
 *
 * @param {Array}  employees   - array of {id, name, role, transferred, transferred_at}
 * @param {string} referrerId  - the currently selected referrer id (or '')
 * @returns {{ transferred: boolean, transferredAt: string|null, maxEntryDate: string|null }}
 *   transferred:  true if the referrer was transferred out of this branch
 *   transferredAt: 'YYYY-MM-DD' IST date of the transfer (null if not transferred)
 *   maxEntryDate:  last allowed entry date (day before transferredAt, null if not transferred)
 */
export function getTransferredReferrerInfo(employees, referrerId) {
  if (!referrerId) return { transferred: false, transferredAt: null, maxEntryDate: null };

  const emp = employees.find(e => e.id === referrerId);
  if (!emp || !emp.transferred || !emp.transferred_at) {
    return { transferred: false, transferredAt: null, maxEntryDate: null };
  }

  // Convert the UTC timestamp returned by the API to an IST date string.
  // en-CA locale always formats as YYYY-MM-DD; timeZone shifts UTC → IST (+05:30).
  const transferredAt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' })
    .format(new Date(emp.transferred_at));

  // maxEntryDate = the day before the transfer date (last valid entry day).
  // Treat transferredAt as UTC midnight so arithmetic is timezone-neutral.
  const d = new Date(transferredAt + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const maxEntryDate = d.toISOString().slice(0, 10);

  return { transferred: true, transferredAt, maxEntryDate };
}

/**
 * Returns the display label for a referrer option in a <select>.
 * Appends " (Transferred)" when the employee was transferred out.
 *
 * @param {{ name: string, role: string, transferred: boolean }} emp
 * @returns {string}
 */
export function referrerOptionLabel(emp) {
  const roleLabel = emp.role.replace(/_/g, ' ').toUpperCase();
  return emp.transferred
    ? `${emp.name} (Transferred) — ${roleLabel}`
    : `${emp.name} (${roleLabel})`;
}

/**
 * Returns an inline error string when the chosen entry date violates the
 * transferred-referrer cutoff, or null when the date is acceptable.
 *
 * @param {boolean}     transferred  - from getTransferredReferrerInfo
 * @param {string|null} transferredAt - 'YYYY-MM-DD' cutoff from getTransferredReferrerInfo
 * @param {string}      entryDate    - 'YYYY-MM-DD' date the user picked
 * @returns {string|null}
 */
export function checkTransferredReferrerDate(transferred, transferredAt, entryDate) {
  if (!transferred || !transferredAt || !entryDate) return null;
  if (entryDate >= transferredAt) {
    return `This referrer was transferred out on ${transferredAt} — choose a date before that day.`;
  }
  return null;
}
