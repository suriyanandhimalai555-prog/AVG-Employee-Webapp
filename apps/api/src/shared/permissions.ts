// Import the Role type definition from your central workforce shared types package
import { Role } from '@attendance/shared-types';
// Import the custom ForbiddenError from our shared errors utility
import { ForbiddenError } from './errors';

// Return true if the user's role is permitted to mark their own attendance
export const canMarkAttendance = (role: Role): boolean => {
  // Allow all roles except for the 'client' role to mark attendance
  return role !== 'client';
};

// Return true if the user's role is permitted to correct attendance records for others
export const canCorrectAttendance = (role: Role): boolean => {
  // Only users with the 'branch_admin' role have permission to correct attendance
  return role === 'branch_admin';
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

// Enforce that only branch admins can correct attendance, throwing a ForbiddenError if not
export const assertCanCorrectAttendance = (role: Role): void => {
  // Trigger the permission check specifically for correcting attendance
  if (!canCorrectAttendance(role)) {
    // Throw a 403 Forbidden error with a descriptive explanation if the check fails
    throw new ForbiddenError('Only branch admins can correct attendance');
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
