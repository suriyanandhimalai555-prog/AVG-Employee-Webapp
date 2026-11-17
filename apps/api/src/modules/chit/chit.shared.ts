// Agila Chit — constants and small helpers shared by the chit sub-services.
// Scheme code, group sizing, the prize formula, stale-group promotion and the
// head-branch guard. Nothing here writes on its own behalf except promoteStaleFormingGroups.

import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';

export const SCHEME_CODE     = 'agila_chit_scheme';
// One slot in every group is reserved for the company (takes month 1 payout);
// the remaining 19 slots are real customers who each win once in months 2–20.
export const MAX_MEMBERS     = 19;
export const FILL_WINDOW_DAYS = 30;

// ─── Prize formula ─────────────────────────────────────────────────────────────
// winnerAmount = fullAmount × (9 + monthWon / 2)
// Verified against the full prize table in the scheme spec.
export function computeWinnerAmount(fullAmount: number, monthWon: number): number {
  return fullAmount * (9 + monthWon / 2);
}

// ─── Stale-forming check ───────────────────────────────────────────────────────
// A forming group whose fill deadline has passed is lazily promoted on the next
// read, exactly as GoldCoin/LSS do with pending_combine promotion.
export function isStaleForming(status: string, deadline: string | null): boolean {
  if (status !== 'forming' || !deadline) return false;
  return new Date(deadline) <= new Date();
}

// ─── Head-branch permission guard ─────────────────────────────────────────────
// Mirrors gold-coin/combine.service.ts:assertHeadBranchAdmin. The head branch
// is set via migration (035/036) and is read-only at runtime.
export async function assertHeadBranchAdmin(
  db: Pool | PoolClient,
  userId: string
): Promise<{ headBranchId: string }> {
  const result = await db.query(
    `SELECT u.role, u.branch_id, b.is_head_branch
     FROM users u LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [userId]
  );
  if (result.rows.length === 0) throw new NotFoundError('User not found');
  const { role, branch_id, is_head_branch } = result.rows[0];
  if (role !== 'branch_admin' || !is_head_branch || !branch_id) {
    throw new ForbiddenError(
      'Only branch admins at the head branch can perform this action',
      'CHIT_HEAD_PERM'
    );
  }
  return { headBranchId: branch_id };
}

// ─── Bulk stale-forming promotion (run at the top of list operations) ──────────
export async function promoteStaleFormingGroups(db: Pool | PoolClient): Promise<void> {
  await db.query(
    `UPDATE agila_chit_groups
     SET status = 'pending_combine'
     WHERE status = 'forming' AND fill_deadline IS NOT NULL AND fill_deadline <= NOW()`
  );
}
