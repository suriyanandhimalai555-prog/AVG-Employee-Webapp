// frontend/src/lib/schemeAuth.js
// Single source of truth for frontend scheme-data authority checks.
//
// Use these helpers everywhere a page or component needs to decide whether to
// render create / edit / correct controls.  Do NOT repeat `role === 'md'` or
// `role === 'management'` checks inline — import from here.
//
// Mirrors the backend SCHEME_ADMIN_ROLES constant (role-constants.ts).

// Returns true when the role may create, edit, or correct scheme / site data.
// Management has full authority equal-to or greater than MD.
export const isSchemeAdmin = (role) => role === 'md' || role === 'management';

// Returns true when the role must select a branch before submitting data.
// Management accounts have no branch_id on their JWT, so they always pick one.
export const needsBranchSelection = (role) => role === 'management';
