import { z } from 'zod';

// Schema for assigning or updating an employee's salary
export const SetSalarySchema = z.object({
  userId:        z.string().uuid(),
  baseSalary:    z.number().nonnegative().max(100_000_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  notes:         z.string().max(1000).optional(),
});

// TS: All roles that may receive a bulk by-role salary set — every role except client
const BULK_ROLES = [
  'md', 'director', 'gm', 'branch_manager', 'abm',
  'sales_officer', 'branch_admin', 'oa', 'management',
] as const;

// Schema for setting a common salary across every active employee of a given role
export const SetSalaryByRoleSchema = z.object({
  // TS: z.enum requires a tuple literal — BULK_ROLES satisfies [string, ...string[]]
  role:          z.enum(BULK_ROLES),
  baseSalary:    z.number().nonnegative().max(100_000_000),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  notes:         z.string().max(1000).optional(),
});

// Query params for salary history
export const GetSalaryHistoryQuerySchema = z.object({
  page:  z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(200).default(50),
});

export type SetSalaryInput        = z.infer<typeof SetSalarySchema>;
export type SetSalaryByRoleInput  = z.infer<typeof SetSalaryByRoleSchema>;
export type GetSalaryHistoryQuery = z.infer<typeof GetSalaryHistoryQuerySchema>;
