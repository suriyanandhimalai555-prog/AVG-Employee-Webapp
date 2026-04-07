import { Pool } from 'pg';
import { getSubtreeIds, getOversightScopeIds } from './hierarchy';
import { resolveBranchAdminBranchId } from './attendance-scope';

type Viewer = {
  id: string;
  role: string;
  branchId: string | null | undefined;
};

const HIERARCHY_CHAIN = [
  'md',
  'director',
  'gm',
  'branch_manager',
  'abm',
  'sales_officer',
  'client',
] as const;

function getDescendantRoles(role: string): string[] {
  const idx = HIERARCHY_CHAIN.indexOf(role as (typeof HIERARCHY_CHAIN)[number]);
  if (idx < 0) return [];
  return HIERARCHY_CHAIN.slice(idx + 1) as unknown as string[];
}

async function getBranchUserIdsByRoles(
  db: Pool,
  branchId: string,
  roles: string[],
): Promise<string[]> {
  if (roles.length === 0) return [];
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM users
     WHERE branch_id = $1
       AND role = ANY($2::text[])
       AND is_active = true`,
    [branchId, roles]
  );
  return result.rows.map((r) => r.id);
}

export async function getHierarchyVisibleUserIds(
  db: Pool,
  viewer: Viewer,
  options?: { includeSelf?: boolean; allowAbmBranchFallback?: boolean }
): Promise<string[]> {
  const includeSelf = options?.includeSelf ?? false;
  const allowAbmBranchFallback = options?.allowAbmBranchFallback ?? true;

  let ids: string[] = [];

  if (viewer.role === 'md') {
    const r = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE role != 'md' AND is_active = true`
    );
    ids = r.rows.map((row) => row.id);
  } else if (viewer.role === 'branch_admin') {
    const branchId = await resolveBranchAdminBranchId(db, viewer.id, viewer.branchId);
    const r = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE branch_id = $1 AND is_active = true`,
      [branchId]
    );
    ids = r.rows.map((row) => row.id);
  } else if (viewer.role === 'director' || viewer.role === 'gm') {
    ids = await getOversightScopeIds(db, viewer.id);
  } else {
    ids = await getSubtreeIds(viewer.id);
    const canFallbackByBranch = allowAbmBranchFallback && ['branch_manager', 'abm'].includes(viewer.role);
    if (canFallbackByBranch && ids.length <= 1 && viewer.branchId) {
      const descendants = getDescendantRoles(viewer.role);
      ids = await getBranchUserIdsByRoles(db, viewer.branchId, descendants);
    }
  }

  const uniqueIds = [...new Set(ids)];
  if (includeSelf) {
    return uniqueIds;
  }
  return uniqueIds.filter((id) => id !== viewer.id);
}

