// apps/api/src/modules/branches/branch.schema.ts
// Zod schemas for branch endpoints. Kept out of the routes file so handlers
// stay focused on HTTP plumbing and validation rules live alongside the
// service that consumes them.
import { z } from 'zod';

// Shared regex for shift-time fields. Accepts "HH:MM" and "HH:MM:SS" 24h forms.
const TIME_REGEX = /^\d{2}:\d{2}(:\d{2})?$/;

export const CreateBranchSchema = z.object({
  name:       z.string().min(2).max(200),
  shiftStart: z.string().regex(TIME_REGEX).optional(),
  shiftEnd:   z.string().regex(TIME_REGEX).optional(),
  timezone:   z.string().max(50).optional(),
});

export const UpdateBranchSchema = z.object({
  name:       z.string().min(2).max(200).optional(),
  gmId:       z.string().uuid().optional().nullable(),
  adminId:    z.string().uuid().optional().nullable(),
  shiftStart: z.string().regex(TIME_REGEX).optional(),
  shiftEnd:   z.string().regex(TIME_REGEX).optional(),
  isActive:   z.boolean().optional(),
});

// Set the head branch (Management only — single global head branch for all schemes)
export const SetHeadBranchSchema = z.object({
  branchId: z.string().uuid(),
});

// Set branch geofence coordinates (Management only).
// latitude/longitude may be null to CLEAR the geofence (branch then has no location restriction).
// geofenceRadiusM is optional — omitting it leaves the existing radius unchanged.
export const UpdateBranchLocationSchema = z.object({
  latitude:        z.number().min(-90).max(90).nullable(),
  longitude:       z.number().min(-180).max(180).nullable(),
  geofenceRadiusM: z.number().int().min(20).max(5000).optional(),
});

export type CreateBranchInput          = z.infer<typeof CreateBranchSchema>;
export type UpdateBranchInput          = z.infer<typeof UpdateBranchSchema>;
export type SetHeadBranchInput         = z.infer<typeof SetHeadBranchSchema>;
export type UpdateBranchLocationInput  = z.infer<typeof UpdateBranchLocationSchema>;
