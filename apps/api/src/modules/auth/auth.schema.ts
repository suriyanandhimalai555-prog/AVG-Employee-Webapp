// src/modules/auth/auth.schema.ts
import { z } from 'zod';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LOGIN SCHEMA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Define the validation for the login request body
export const LoginSchema = z.object({
  // Require a valid email address string
  email: z.string().email('Invalid email address'),
  // Require a password string with a minimum length of 6 characters
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

// Infer the TypeScript type for the login request body from the Zod schema
export type LoginInput = z.infer<typeof LoginSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH RESPONSE INTERFACE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Define a plain TypeScript interface for the standardized user profile returned on login/me
export interface AuthUserResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string;
  branchName: string | null;
  hasSmartphone: boolean;
}
