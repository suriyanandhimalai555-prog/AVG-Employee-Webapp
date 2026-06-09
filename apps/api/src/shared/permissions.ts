// Import the Role type definition from your central workforce shared types package
import { Role } from '@attendance/shared-types';
// Import the custom ForbiddenError from our shared errors utility
import { ForbiddenError } from './errors';
// Import the canonical scheme-admin role set so this file is the single assertion point
import { SCHEME_ADMIN_ROLES } from './role-constants';

// Return true if the user's role is permitted to mark their own attendance
export const canMarkAttendance = (role: Role): boolean => {
  // management is a data-entry-only account — it never marks attendance
  return role !== 'client' && role !== 'management';
};

// Return true if the user's role is permitted to correct/admin-mark attendance records for others
export const canCorrectAttendance = (role: Role): boolean => {
  // branch_admin, md, and gm may all mark or correct attendance for employees
  return ['branch_admin', 'md', 'gm'].includes(role);
};

// Return true if the user's role is permitted to manage smartphone device status
export const canManageSmartphone = (role: Role): boolean => {
  // Access to manage device status is restricted exclusively to the 'branch_admin'
  return role === 'branch_admin';
};

// Return true if the user's role is permitted to see data across all company branches
export const canViewAllBranches = (role: Role): boolean => {
  // This high-level access is restricted to the 'md' (Managing Director) role
  return role === 'md';
};

// Return true if the user's role is permitted to view data across multiple branches
export const canViewMultipleBranches = (role: Role): boolean => {
  // Check if the current role is included in the list of high-level management roles
  return ['md', 'director', 'gm'].includes(role);
};

// Return true if the role is part of the standard organizational reporting hierarchy
export const isHierarchyRole = (role: Role): boolean => {
  // Standard roles are all roles except for 'client' and 'branch_admin'
  return role !== 'client' && role !== 'branch_admin';
};

// Enforce that the user's role allows marking attendance, throwing a ForbiddenError if not
export const assertCanMarkAttendance = (role: Role): void => {
  // Call our boolean permission checker to verify the user's access
  if (!canMarkAttendance(role)) {
    // Throw a 403 Forbidden error with a detailed message to stop execution
    throw new ForbiddenError('You are not allowed to mark attendance');
  }
};

// Enforce that the role is allowed to correct/admin-mark attendance, throwing a ForbiddenError if not
export const assertCanCorrectAttendance = (role: Role): void => {
  // Trigger the permission check specifically for correcting attendance
  if (!canCorrectAttendance(role)) {
    // Throw a 403 Forbidden error with a descriptive explanation if the check fails
    throw new ForbiddenError('Only branch admins, GMs, and MD can correct attendance');
  }
};

// Enforce that only branch admins can manage smartphone status, throwing a ForbiddenError if not
export const assertCanManageSmartphone = (role: Role): void => {
  // Check whether the user's current role is permitted to manage devices
  if (!canManageSmartphone(role)) {
    // Prevent the action by throwing a 403 error and informing the user
    throw new ForbiddenError('Only branch admins can manage smartphone status');
  }
};

// Return true if the role may CREATE, EDIT, or CORRECT scheme and site data.
// Management has full authority (≥ MD) over all scheme records.
export const canManageSchemeData = (role: Role): boolean =>
  (SCHEME_ADMIN_ROLES as readonly string[]).includes(role);

// Throw ForbiddenError when the caller lacks scheme-data management rights.
export const assertCanManageSchemeData = (role: Role): void => {
  if (!canManageSchemeData(role)) {
    throw new ForbiddenError('Only MD or Management can create, edit, or correct scheme data');
  }
};
