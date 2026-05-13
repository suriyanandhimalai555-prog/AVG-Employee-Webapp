// Canonical role identifiers and reusable role-sets. Source of truth for the
// Zod enum is users/user.schema.ts — this file mirrors it as plain constants
// so route handlers can do role checks without importing Zod schemas.

export const Role = {
  MD:             'md',
  DIRECTOR:       'director',
  GM:             'gm',
  BRANCH_MANAGER: 'branch_manager',
  ABM:            'abm',
  SALES_OFFICER:  'sales_officer',
  BRANCH_ADMIN:   'branch_admin',
  OA:             'oa',
  CLIENT:         'client',
} as const;

export type RoleValue = typeof Role[keyof typeof Role];

// Roles allowed to administer attendance corrections + admin marks
export const ADMIN_MARK_ROLES: readonly RoleValue[] = [Role.BRANCH_ADMIN, Role.MD, Role.GM];

// Roles with cross-branch read access (hierarchy oversight)
export const OVERSIGHT_ROLES: readonly RoleValue[] = [Role.MD, Role.DIRECTOR, Role.GM];

// Roles permitted to create entries in scheme modules (Gold, Trading Academy)
export const WRITER_ROLES: readonly RoleValue[] = [Role.BRANCH_ADMIN];

// Roles permitted to read scheme listings (everyone except OA/CLIENT)
export const READER_ROLES: readonly RoleValue[] = [
  Role.MD, Role.DIRECTOR, Role.GM, Role.BRANCH_MANAGER,
  Role.ABM, Role.SALES_OFFICER, Role.BRANCH_ADMIN,
];

// Roles whose scheme reads must be scoped to entries THEY enrolled
export const REFERRER_ONLY_ROLES: readonly RoleValue[] = [
  Role.BRANCH_MANAGER, Role.ABM, Role.SALES_OFFICER,
];

// Helper: O(1) membership test against any of the sets above.
export const hasRole = (
  role: string,
  set: readonly RoleValue[],
): boolean => (set as readonly string[]).includes(role);
