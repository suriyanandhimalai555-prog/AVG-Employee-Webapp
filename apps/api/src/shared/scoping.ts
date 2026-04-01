import { Pool } from 'pg';
import { getSubtreeIds } from './hierarchy';

export interface ScopeTarget {
  type: 'global' | 'branch' | 'users';
  branchId?: string;
  userIds?: string[];
}

/**
 * Evaluates the requester role, branch, and requested query params
 * to determine the explicit SQL scope they are allowed to read.
 * 
 * - branch_admin: Can ONLY view their own branch.
 * - md/gm/director: Can view ALL branches (global view), OR a specific branch if requested.
 * - regular user: Can ONLY view themselves and their subtree (subordinates).
 */
export async function getDataScope(
  db: Pool,
  requesterId: string,
  requesterRole: string,
  requesterBranchId: string | null,
  requestedBranchId?: string
): Promise<ScopeTarget> {
  // 1. Branch Admin: Strictly locked to their own branch
  if (requesterRole === 'branch_admin') {
    if (!requesterBranchId) {
      throw new Error('Branch Admin attempting to query without an assigned branch');
    }
    return { type: 'branch', branchId: requesterBranchId };
  }

  // 2. MD/GM/Director: Global view by default, but can filter by requestedBranchId
  if (['md', 'gm', 'director'].includes(requesterRole)) {
    if (requestedBranchId) {
      return { type: 'branch', branchId: requestedBranchId };
    }
    return { type: 'global' };
  }

  // 3. Regular employees / Subtree logic: Only view subordinates
  const subtreeIds = await getSubtreeIds(requesterId);
  return { type: 'users', userIds: subtreeIds };
}
