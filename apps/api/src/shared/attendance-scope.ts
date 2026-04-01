import { Pool } from 'pg';
import { ForbiddenError, NotFoundError } from './errors';
import { getSubtreeIds } from './hierarchy';

/** Identity needed to compute dashboard / roster visibility (JWT may omit or stale-branch branch_id). */
export type AttendanceRequester = {
  id: string;
  role: string;
  branchId: string | null | undefined;
};

export type EmployeeDashboardScope =
  | { kind: 'branch'; branchId: string }
  | { kind: 'subtree'; userIds: string[] }
  | { kind: 'global_exclude_md' };

/**
 * Canonical branch for a branch admin: JWT branchId first, then users.branch_id,
 * then branch row where branches.admin_id = user (covers MD assigning admin in UI without setting user.branch_id).
 */
export async function resolveBranchAdminBranchId(
  db: Pool,
  userId: string,
  jwtBranchId: string | null | undefined
): Promise<string> {
  if (jwtBranchId) {
    return jwtBranchId;
  }

  const r = await db.query<{
    branch_id: string | null;
    admin_branch_id: string | null;
  }>(
    `SELECT u.branch_id, b.id AS admin_branch_id
     FROM users u
     LEFT JOIN branches b ON b.admin_id = u.id AND b.is_active = true
     WHERE u.id = $1`,
    [userId]
  );

  if (r.rows.length === 0) {
    throw new NotFoundError('User not found');
  }

  const row = r.rows[0];
  const resolved = row.branch_id ?? row.admin_branch_id;
  if (!resolved) {
    throw new ForbiddenError('Branch admin is not assigned to a branch. Contact MD.');
  }
  return resolved;
}

/**
 * Who may appear on the admin "today" roster: MD = all branch staff; branch_admin = one branch;
 * others (gm, director, …) = own branch if set, else reporting subtree (never whole org by accident).
 */
export async function resolveEmployeeDashboardScope(
  db: Pool,
  requester: AttendanceRequester
): Promise<EmployeeDashboardScope> {
  const { id, role, branchId: jwtBranchId } = requester;

  if (role === 'branch_admin') {
    const branchId = await resolveBranchAdminBranchId(db, id, jwtBranchId);
    return { kind: 'branch', branchId };
  }

  if (role === 'md') {
    return { kind: 'global_exclude_md' };
  }

  if (jwtBranchId) {
    return { kind: 'branch', branchId: jwtBranchId };
  }

  const userIds = await getSubtreeIds(id);
  return { kind: 'subtree', userIds };
}

/** Fills branchId / branchName on login/me when admin is linked via branches.admin_id but users.branch_id was never set. */
export async function hydrateBranchAdminProfile(
  db: Pool,
  profile: {
    id: string;
    role: string;
    branchId: string | null;
    branchName: string | null;
  }
): Promise<void> {
  if (profile.role !== 'branch_admin') {
    return;
  }
  const branchId = await resolveBranchAdminBranchId(db, profile.id, profile.branchId);
  profile.branchId = branchId;
  if (!profile.branchName) {
    const r = await db.query<{ name: string }>(
      'SELECT name FROM branches WHERE id = $1',
      [branchId]
    );
    profile.branchName = r.rows[0]?.name ?? null;
  }
}
