// Canonical role identifiers and reusable role-sets. Source of truth for the
// Zod enum is users/user.schema.ts — this file mirrors it as plain constants
// so route handlers can do role checks without importing Zod schemas.
import { ForbiddenError } from './errors';

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
  MANAGEMENT:     'management',
} as const;

export type RoleValue = typeof Role[keyof typeof Role];

// Roles allowed to administer attendance corrections + admin marks
export const ADMIN_MARK_ROLES: readonly RoleValue[] = [Role.BRANCH_ADMIN, Role.MD, Role.GM];

// Roles with cross-branch read access (hierarchy oversight)
export const OVERSIGHT_ROLES: readonly RoleValue[] = [Role.MD, Role.DIRECTOR, Role.GM];

// Roles permitted to create entries in scheme modules (Gold, Trading Academy)
export const WRITER_ROLES: readonly RoleValue[] = [Role.BRANCH_ADMIN];

// Roles permitted to CREATE or RECORD scheme data (branch_admin + management).
// Management has no branch_id — branch must come from the request body.
export const SCHEME_WRITER_ROLES: readonly RoleValue[] = [Role.BRANCH_ADMIN, Role.MANAGEMENT];

// Roles permitted to CONFIGURE scheme data (packages, commission rates, plan amounts).
// MD and Director can configure from their own pages; Management uses the Control Center.
export const CONFIG_ROLES: readonly RoleValue[] = [Role.MD, Role.DIRECTOR, Role.MANAGEMENT];

// Roles with full authority to CREATE, EDIT, and CORRECT scheme / site data.
// Management has equal-or-greater authority to MD — they can correct any record,
// including MD-entered ones.  Director is excluded (config-only).
export const SCHEME_ADMIN_ROLES: readonly RoleValue[] = [Role.MD, Role.MANAGEMENT];

// Roles that may view AND reactivate auto-deactivated (chronic-absentee) accounts.
// Management-only: it owns the auto-deactivation toggle/threshold, so it also
// manages the fallout. MD deliberately excluded — this is a back-office concern.
export const DEACTIVATED_USERS_MANAGE_ROLES: readonly RoleValue[] = [Role.MANAGEMENT];

// Roles permitted to read scheme listings (everyone except OA/CLIENT)
export const READER_ROLES: readonly RoleValue[] = [
  Role.MD, Role.DIRECTOR, Role.GM, Role.BRANCH_MANAGER,
  Role.ABM, Role.SALES_OFFICER, Role.BRANCH_ADMIN, Role.MANAGEMENT,
];

// Roles whose scheme reads must be scoped to entries THEY referred — across ALL
// branches (match on referrer_id, ignore branch). Everyone in the reporting chain
// below Management. Branch Admin (full branch view) and MD/Management (full org view)
// are intentionally excluded.
export const REFERRER_ONLY_ROLES: readonly RoleValue[] = [
  Role.DIRECTOR, Role.GM, Role.BRANCH_MANAGER, Role.ABM, Role.SALES_OFFICER,
];

// Roles allowed to view Gold Coin rooms (oversight roles + branch_admin + management)
export const GOLD_COIN_VIEWER_ROLES: readonly RoleValue[] = [
  Role.MD, Role.DIRECTOR, Role.GM, Role.BRANCH_ADMIN, Role.MANAGEMENT,
];

// Roles allowed to EDIT customer records (contact details + WhatsApp consent)
// via PATCH /customers/:id. Deliberately narrower than customer create/search:
// enrollment staff (abm/oa/…) create customers, but only branch leadership and
// the management back-office may change consent or contact data afterwards.
export const CUSTOMER_EDITOR_ROLES: readonly RoleValue[] = [
  Role.BRANCH_MANAGER, Role.BRANCH_ADMIN, Role.MANAGEMENT,
];

// Roles allowed to list users via GET /users (the personnel directory).
// MD + management see the whole org; director/gm see their subtrees;
// branch_admin sees their branch.
export const USER_DIRECTORY_ROLES: readonly RoleValue[] = [
  Role.MD, Role.MANAGEMENT, Role.DIRECTOR, Role.GM, Role.BRANCH_ADMIN,
];

// Roles allowed to SUBMIT a promotion/transfer request on behalf of their subordinate.
// Approver ≠ requester (enforced in service) — segregation of duties.
export const TRANSFER_REQUEST_ROLES: readonly RoleValue[] = [
  Role.GM, Role.BRANCH_MANAGER, Role.BRANCH_ADMIN,
];

// Roles allowed to APPROVE or REJECT a pending transfer/promotion request.
// MD and Management only — they have org-wide authority over org structure.
export const TRANSFER_APPROVE_ROLES: readonly RoleValue[] = [
  Role.MD, Role.MANAGEMENT,
];

// Helper: O(1) membership test against any of the sets above.
export const hasRole = (
  role: string,
  set: readonly RoleValue[],
): boolean => (set as readonly string[]).includes(role);

// Helper for scheme ADMIN actions (create/edit/correct, MD ≤ Management).
// Throws ForbiddenError (AppError) when the caller is not an admin role.
export function assertSchemeAdmin(userRole: string): void {
  if (!(SCHEME_ADMIN_ROLES as readonly string[]).includes(userRole)) {
    throw new ForbiddenError('Only MD or Management can perform this action');
  }
}

// Helper for scheme CORRECTION routes: resolves the effective branchId without
// forcing the caller to re-supply it when they just want to fix a field.
// Priority: body branchId (explicit override) → record's own branchId → 403.
// Management must pass one of the two; MD may rely on the record's branch.
export function resolveCorrectionBranch(
  userRole:      string,
  userBranchId:  string | null,
  recordBranchId: string,
  bodyBranchId?: string,
): string {
  // Management has no branchId on their JWT — accept body or fall back to record branch
  if (userRole === Role.MANAGEMENT) {
    return bodyBranchId || recordBranchId;
  }
  // MD sees all branches; use body override if supplied, else the record's branch
  if (userRole === Role.MD) {
    return bodyBranchId || recordBranchId;
  }
  throw new ForbiddenError('Only MD or Management can correct scheme records');
}

// Helper for scheme READ routes accessed by Management (branch_id = NULL on the account).
// branch_admin / branch-scoped roles → use their own JWT branchId as normal.
// md / management (no branchId on JWT) → use the branchId supplied as a query param.
// Any authenticated reader that somehow has no branchId but is not admin → 403.
export function resolveReadBranch(
  userRole:     string,
  userBranchId: string | null,
  queryBranchId?: string,
): string {
  // Most readers have their own branchId — use it directly.
  if (userBranchId) return userBranchId;
  // MD / Management have no branchId on the JWT; they pass it as a query param.
  if (hasRole(userRole, SCHEME_ADMIN_ROLES) && queryBranchId) return queryBranchId;
  throw new ForbiddenError('branchId query parameter is required for this account type');
}

// Helper for scheme write routes: resolves the effective branchId for an operation.
// branch_admin → their own branchId from the JWT.
// management   → branchId MUST come from the request body (null branchId on the account).
// Throws a ForbiddenError when the caller is not an allowed writer.
export function resolveWriterBranch(
  userRole: string,
  userBranchId: string | null,
  bodyBranchId?: string
): string {
  if (userRole === Role.BRANCH_ADMIN) {
    if (!userBranchId) throw new Error('Branch Admin has no branch assigned');
    return userBranchId;
  }
  if (userRole === Role.MANAGEMENT) {
    if (!bodyBranchId) {
      throw new ForbiddenError('branchId is required in the request body for management entry');
    }
    return bodyBranchId;
  }
  throw new ForbiddenError('Only Branch Admin or Management can perform this action');
}
