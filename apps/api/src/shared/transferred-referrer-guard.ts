// Guard for transferred-referrer scheme entries.
//
// When a referrer (e.g. Sales Officer) is transferred out of a branch they
// remain selectable as a referrer in the OLD branch but ONLY for entries dated
// strictly BEFORE their transfer date.  Going forward (current/future) they
// belong only to the new branch, so new entries with them as referrer are
// rejected.
//
// This is a data-integrity rule, NOT a permission toggle — management is NOT
// exempt (unlike assertBackdateAllowed).  Both guards must independently pass
// on every scheme write.
//
// Source of truth: MAX(decided_at) from user_transfer_requests where
//   previous_branch_id = branchId AND kind='transfer' AND status='approved'.
// Entry dates are 'YYYY-MM-DD' IST strings; the transfer timestamp (UTC) is
// converted to IST before comparison so the cutoff aligns with business dates.
//
// No-ops silently when:
//   • referrerId is absent (payment route without referrer field)
//   • referrer currently belongs to this branch (still resident — no restriction)
//   • no transfer-out record exists for this referrer in this branch
//     (e.g. MD, GM, Director added to the picker via oversight, not branch_id)
//
// Called from route handlers immediately after resolveWriterBranch, alongside
// assertBackdateAllowed.  Service signatures are unchanged.

import { Pool, PoolClient } from 'pg';
import { ForbiddenError } from './errors';

// TS: converts a pg-returned timestamptz (Date object or ISO string) to an
// IST 'YYYY-MM-DD' string using the same locale trick as getCompanyToday().
// Inline here to avoid importing ./date and keep this file self-contained.
function toISTDate(ts: Date | string): string {
  // TS: en-CA locale always yields YYYY-MM-DD; timeZone converts UTC → IST (+05:30)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ts as string));
}

// Throws ForbiddenError('REFERRER_TRANSFERRED') when any supplied entry date
// falls on or after the referrer's transfer-out date for the given branch.
// Params:
//   db        — pool or transaction client (reads fresh; no cache)
//   branchId  — the branch being written to (resolved by resolveWriterBranch)
//   referrerId — the chosen referrer UUID from the request body; null/undefined = no-op
//   dates     — the same 'YYYY-MM-DD' date array passed to assertBackdateAllowed
export async function assertReferrerAllowedOnDates(
  db: Pool | PoolClient,
  branchId: string,
  referrerId: string | null | undefined,
  dates: Array<string | null | undefined>
): Promise<void> {
  // TS: no referrer field on this request (e.g. a payment-only route) — nothing to check
  if (!referrerId) return;

  // TS: single round-trip: fetch the referrer's current branch and their
  // latest transfer-out timestamp for this specific branch in one query.
  // The subquery returns NULL when no qualifying transfer row exists.
  const res = await (db as Pool).query<{ current_branch_id: string | null; transferred_at: Date | null }>(
    `SELECT u.branch_id AS current_branch_id,
            (SELECT MAX(t.decided_at)
               FROM user_transfer_requests t
              WHERE t.user_id   = $1
                AND t.previous_branch_id = $2
                AND t.kind      = 'transfer'
                AND t.status    = 'approved') AS transferred_at
       FROM users u
      WHERE u.id = $1`,
    [referrerId, branchId]
  );

  // TS: referrer row not found — tolerate gracefully; the service layer's
  // FK or explicit referrer-exists check will produce the authoritative error.
  if (res.rows.length === 0) return;

  const { current_branch_id, transferred_at } = res.rows[0];

  // Still a resident of this branch — no date restriction applies
  if (current_branch_id === branchId) return;

  // No transfer-out record for this branch — oversight/MD referrer, unrestricted
  if (!transferred_at) return;

  // Convert the UTC transfer timestamp to an IST business date for comparison
  // against the ISO date strings the client supplies (which are already IST).
  const cutoffDate = toISTDate(transferred_at);

  // Every non-null entry date must be strictly before the transfer cutoff.
  // An entry ON the transfer day itself is rejected (same-day is ambiguous
  // as to whether they were still employed in that branch).
  const violatingDate = dates.find(d => !!d && d >= cutoffDate);
  if (violatingDate) {
    throw new ForbiddenError(
      `This referrer was transferred out of the branch on ${cutoffDate} — ` +
      `only entries dated before that day can use them as referrer`,
      'REFERRER_TRANSFERRED'
    );
  }
}
