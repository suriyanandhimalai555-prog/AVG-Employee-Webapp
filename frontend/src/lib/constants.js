// frontend/src/lib/constants.js
// Canonical client-side enums. Pages must import from here instead of redeclaring
// label maps inline — keeps role/mode wording aligned across the app.

export const ROLES = Object.freeze({
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
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.MD]:             'Managing Director',
  [ROLES.DIRECTOR]:       'Director',
  [ROLES.GM]:             'General Manager',
  [ROLES.BRANCH_MANAGER]: 'Branch Manager',
  [ROLES.ABM]:            'Assistant Branch Manager',
  [ROLES.SALES_OFFICER]:  'Sales Officer',
  [ROLES.BRANCH_ADMIN]:   'Branch Admin',
  [ROLES.OA]:             'Operations Assistant',
  [ROLES.CLIENT]:         'Client',
  [ROLES.MANAGEMENT]:     'Management',
});

// Money / payment modes used across Money + Gold + Trading Academy modules
export const PAYMENT_MODES = Object.freeze({
  CASH:   'cash',
  BANK:   'bank',
  UPI:    'upi',
  CHEQUE: 'cheque',
});

export const MODE_LABELS = Object.freeze({
  [PAYMENT_MODES.CASH]:   'Cash',
  [PAYMENT_MODES.BANK]:   'Bank Transfer',
  [PAYMENT_MODES.UPI]:    'UPI',
  [PAYMENT_MODES.CHEQUE]: 'Cheque',
});

// Status pill colour classes — Tailwind classes only, no inline styles.
export const STATUS_COLORS = Object.freeze({
  pending:   'bg-amber-100 text-amber-800 border-amber-200',
  approved:  'bg-emerald-100 text-emerald-800 border-emerald-200',
  rejected:  'bg-rose-100 text-rose-800 border-rose-200',
  active:    'bg-emerald-100 text-emerald-800 border-emerald-200',
  inactive:  'bg-slate-100 text-slate-700 border-slate-200',
  paid:      'bg-emerald-100 text-emerald-800 border-emerald-200',
  unpaid:    'bg-rose-100 text-rose-800 border-rose-200',
  partial:   'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-blue-100 text-blue-800 border-blue-200',
  cancelled: 'bg-slate-100 text-slate-700 border-slate-200',
});

// Roles that should see administrative UI affordances (manage users, view all branches).
export const ADMIN_ROLES = Object.freeze(new Set([
  ROLES.MD, ROLES.DIRECTOR, ROLES.GM, ROLES.BRANCH_ADMIN,
]));
