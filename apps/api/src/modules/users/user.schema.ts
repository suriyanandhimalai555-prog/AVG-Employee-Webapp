// apps/api/src/modules/users/user.schema.ts
import { z } from 'zod';

export const UserRole = z.enum([
  'md',
  'director',
  'gm',
  'branch_manager',
  'abm',
  'sales_officer',
  'client',
  'branch_admin'
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
});

export type CreateUserInput = z.infer<typeof CreateUserSchema>;
export type UserResponse = z.infer<typeof UserResponseSchema>;
