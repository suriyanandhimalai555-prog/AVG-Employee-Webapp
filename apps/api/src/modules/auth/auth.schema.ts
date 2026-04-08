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
// CHANGE PASSWORD SCHEMA
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Validates the change-password request body — all three fields are required
export const ChangePasswordSchema = z.object({
  // The user must prove identity by supplying their current password
  currentPassword: z.string().min(1, 'Current password is required'),
  // New password with the same minimum length as the registration constraint
  newPassword: z.string().min(6, 'New password must be at least 6 characters').max(100),
  // Repeat field — must match newPassword (validated with .refine below)
  confirmPassword: z.string().min(6).max(100),
}).refine((d) => d.newPassword === d.confirmPassword, {
  // Report the error on the confirmPassword field so the UI can highlight it
  message: 'New passwords do not match',
  path: ['confirmPassword'],
});

// TypeScript type inferred from the Zod schema for use in the service layer
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const ProfileUploadUrlSchema = z.object({
  kind: z.enum(['photo', 'proof']),
  contentType: z.string().min(1).default('image/jpeg'),
});

export const UpdateProfileAssetsSchema = z.object({
  profilePhotoKey: z.string().min(1).optional(),
  profileProofKey: z.string().min(1).optional(),
});

export type ProfileUploadUrlInput = z.infer<typeof ProfileUploadUrlSchema>;
export type UpdateProfileAssetsInput = z.infer<typeof UpdateProfileAssetsSchema>;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH RESPONSE INTERFACE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Define a plain TypeScript interface for the standardized user profile returned on login/me
export interface AuthUserResponse {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId: string | null;
  branchName: string | null;
  hasSmartphone: boolean;
  profilePhotoKey?: string | null;
  profilePhotoUrl?: string | null;
  profileProofKey?: string | null;
}
