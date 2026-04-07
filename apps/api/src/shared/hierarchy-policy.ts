import { Pool } from 'pg';
import { ValidationError } from './errors';

type RequesterContext = {
  id: string;
  role: string;
};

type CreateHierarchyInput = {
  role: string;
  managerId?: string | null;
  branchId?: string | null;
};

// Primary reporting-line rules (manager_id). Oversight visibility is handled separately.
const ALLOWED_MANAGER_ROLES: Record<string, string[]> = {
  director: ['md'],
  gm: ['director'],
  branch_manager: ['gm', 'director'],
  abm: ['branch_manager'],
  sales_officer: ['abm', 'branch_manager'],
  client: ['sales_officer', 'abm', 'branch_manager'],
};

const MANAGER_REQUIRED_ROLES = new Set([
  'director',
  'gm',
  'abm',
  'sales_officer',
  'client',
]);

function getAllowedManagerRoles(role: string): string[] {
  return ALLOWED_MANAGER_ROLES[role] ?? [];
}

export async function resolveAndValidateManagerId(
  db: Pool,
  requester: RequesterContext,
  input: CreateHierarchyInput
): Promise<string | null> {
  const allowedManagerRoles = getAllowedManagerRoles(input.role);
  if (allowedManagerRoles.length === 0) {
    return input.managerId ?? null;
  }

  // Convenience: when requester is itself a valid direct manager, auto-link.
  const managerId = input.managerId ?? (allowedManagerRoles.includes(requester.role) ? requester.id : null);

  if (MANAGER_REQUIRED_ROLES.has(input.role) && !managerId) {
    throw new ValidationError(`"${input.role}" must have a direct manager assigned`);
  }

  if (!managerId) {
    return null;
  }

  const managerResult = await db.query<{
    id: string;
    role: string;
    branch_id: string | null;
  }>(
    `SELECT id, role, branch_id
     FROM users
     WHERE id = $1 AND is_active = true`,
    [managerId]
  );

  if (managerResult.rows.length === 0) {
    throw new ValidationError('Selected manager was not found');
  }

  const manager = managerResult.rows[0];
  if (!allowedManagerRoles.includes(manager.role)) {
    throw new ValidationError(
      `"${input.role}" must report to one of: ${allowedManagerRoles.join(', ')}`
    );
  }

  // For branch-scoped roles, manager must either be in same branch OR (gm/director)
  // explicitly oversee that branch.
  if (input.branchId && manager.branch_id !== input.branchId) {
    if (manager.role === 'gm' || manager.role === 'director') {
      const oversight = await db.query(
        `SELECT 1
         FROM user_oversight_branches
         WHERE user_id = $1 AND branch_id = $2
         LIMIT 1`,
        [manager.id, input.branchId]
      );
      if (oversight.rows.length === 0) {
        throw new ValidationError('Selected manager does not oversee the selected branch');
      }
    } else {
      throw new ValidationError('Selected manager must belong to the same branch');
    }
  }

  return manager.id;
}

