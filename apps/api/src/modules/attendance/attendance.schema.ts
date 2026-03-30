import { z } from 'zod';

// Define the validation logic for a user submitting their own attendance record
export const SubmitAttendanceSchema = z.object({
  // Restrict the mode to either 'office' or 'field' using a Zod enum
  mode: z.enum(['office', 'field']),
  // Latitude coordinate for office-based verification
  checkInLat: z.number().min(-90).max(90).optional(),
  // Longitude coordinate for office-based verification
  checkInLng: z.number().min(-180).max(180).optional(),
  // The identifier for the uploaded photo stored in AWS S3
  photoKey: z.string().min(1).optional(),
  // A descriptive note required for field visits
  fieldNote: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  // Use a refine function to validate fields conditionally based on the 'mode'
  if (data.mode === 'office') {
    // Ensure both latitude and longitude are present when the user is in the office
    if (data.checkInLat === undefined || data.checkInLng === undefined) {
      // Add a custom error message to the validation context if fields are missing
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'checkInLat and checkInLng are required for office mode',
        path: ['mode'],
      });
    }
  } else if (data.mode === 'field') {
    // Ensure both a photo and a note are provided when the user is in the field
    if (!data.photoKey || !data.fieldNote) {
      // Provide a clear explanation of which fields are required for field mode
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'photoKey and fieldNote are required for field mode',
        path: ['mode'],
      });
    }
  }
});

// Define the validation for a branch administrator manually marking attendance for a user
export const AdminMarkSchema = z.object({
  // Ensure the target user's ID is a valid UUID format
  targetUserId: z.string().uuid(),
  // Restrict the status to a predefined set of valid attendance labels
  status: z.enum(['present', 'absent', 'half_day']),
  // Allow an optional administrative note detailing the reason
  note: z.string().max(500).optional(),
  // Optional mode for when the status is 'present'
  mode: z.enum(['office', 'field']).optional().default('office'),
  // Optional reference to a photo if the check-in involves a visual record
  photoKey: z.string().optional(),
  // Optional detailed note regarding location or context
  fieldNote: z.string().max(1000).optional(),
});

// Define the validation for an administrator correcting a previously submitted attendance record
export const CorrectionSchema = z.object({
  // Specify the updated attendance status
  newStatus: z.enum(['present', 'absent', 'half_day']),
  // Enforce a minimum length for the correction note to ensure an explanation is provided
  correctionNote: z.string().min(10).max(500),
});

// Define the validation for searching and listing attendance records via URL query parameters
export const GetAttendanceQuerySchema = z.object({
  // Validate the date format as a string matching YYYY-MM-DD
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().default(() => new Date().toISOString().split('T')[0]),
  // Optional branch filter using a string UUID
  branchId: z.string().uuid().optional(),
  // Optional status filter to narrow down results
  status: z.enum(['present', 'absent', 'half_day']).optional(),
  // Coerce the page query string into a number and set a minimum of 1
  page: z.coerce.number().min(1).default(1),
  // Coerce the limit query string into a number and cap it at 100 items per request
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Define the validation for fetching a specific user's attendance patterns over time
export const UserHistoryQuerySchema = z.object({
  // Allow filtering by month using a number from 1 to 12
  month: z.coerce.number().min(1).max(12).optional().default(() => new Date().getMonth() + 1),
  // Allow filtering by year with a reasonable range for historical records
  year: z.coerce.number().min(2024).max(2100).optional().default(() => new Date().getFullYear()),
});

// Inferred TypeScript Type: Represents the validated data for a user's attendance submission
export type SubmitAttendanceInput = z.infer<typeof SubmitAttendanceSchema>;
// Inferred TypeScript Type: Represents the data for an admin manually marking attendance
export type AdminMarkInput = z.infer<typeof AdminMarkSchema>;
// Inferred TypeScript Type: Represents the data required for a record correction
export type CorrectionInput = z.infer<typeof CorrectionSchema>;
// Inferred TypeScript Type: Represents the validated query parameters for list requests
export type GetAttendanceQuery = z.infer<typeof GetAttendanceQuerySchema>;
// Inferred TypeScript Type: Represents the validated parameters for history requests
export type UserHistoryQuery = z.infer<typeof UserHistoryQuerySchema>;
