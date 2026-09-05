// apps/api/src/modules/users/user.schema.ts
import { z } from 'zod';

export const UserRole = z.enum([
  'md',
  'director',
  'gm',
  'branch_manager',
  'abm',
  'sales_officer',
  'branch_admin',
  'oa',
  'management',
]);

export const CreateUserSchema = z.object({
  name: z.string().min(2).max(200),
  email: z.string().email().max(200),
  password: z.string().min(6).max(100),
  role: UserRole,
  branchId: z.string().uuid().nullable().optional(),
  managerId: z.string().uuid().nullable().optional(),
  hasSmartphone: z.boolean().default(true),
  // UUIDs of branches the Director / GM will oversee (multiple branches supported)
  oversightBranchIds: z.array(z.string().uuid()).optional(),
  // UUIDs of GMs assigned to a Director. Director scope is derived from these GMs.
  oversightGmIds: z.array(z.string().uuid()).optional(),
});

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  role: UserRole,
  branchId: z.string().uuid().nullable(),
  branchName: z.string().nullable().optional(),
  managerId: z.string().uuid().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  profilePhotoUrl: z.string().nullable().optional(),
});

// Schema for updating oversight branch assignments for a Director or GM (MD only)
export const UpdateOversightBranchesSchema = z.object({
  branchIds: z.array(z.string().uuid()).optional().default([]),
  gmIds: z.array(z.string().uuid()).optional().default([]),
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
export type UpdateOversightBranchesInput = z.infer<typeof UpdateOversightBranchesSchema>;

// Schema for directly executing a promotion or transfer (management-only, single-step).
// The transfer takes effect immediately — no approval step.
export const ExecuteTransferSchema = z.object({
  userId:                z.string().uuid(),
  kind:                  z.enum(['promotion', 'transfer']),
  newRole:               UserRole,
  // Required for transfers (branch changes); optional for same-branch promotions
  newBranchId:           z.string().uuid().nullable().optional(),
  newManagerId:          z.string().uuid().nullable().optional(),
  // Required when the person being moved has active direct reports
  replacementManagerId:  z.string().uuid().nullable().optional(),
  reason:                z.string().max(500).optional(),
});

export type ExecuteTransferInput = z.infer<typeof ExecuteTransferSchema>;

// Schema for renaming an employee (management-only, single-step name correction).
export const RenameUserSchema = z.object({
  // Target employee's UUID
  userId: z.string().uuid(),
  // New display name — same validation bounds as CreateUserSchema.name
  name:   z.string().trim().min(2).max(200),
  // Optional free-text note recorded in the audit trail
  reason: z.string().max(500).optional(),
});

export type RenameUserInput = z.infer<typeof RenameUserSchema>;
