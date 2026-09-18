import { z } from 'zod';

// Body for PUT /period-config — management sets a custom start and end for one month.
// periodMonth is 0-indexed (Jan=0, Dec=11) to match the frontend convention.
// startDate and endDate are ISO date strings (YYYY-MM-DD).
export const SetPeriodSchema = z.object({
  // TS: 0-indexed month to align with JavaScript Date and the frontend schemePeriod helper.
  periodYear:  z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(0).max(11),
  startDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD'),
});

// TS: inferred type keeps the service and route in sync with the schema.
export type SetPeriodInput = z.infer<typeof SetPeriodSchema>;

// Body for DELETE /period-config — identifies the month to reset to default math.
export const ResetPeriodSchema = z.object({
  periodYear:  z.number().int().min(2020).max(2100),
  periodMonth: z.number().int().min(0).max(11),
});

// TS: inferred type for delete/reset
export type ResetPeriodInput = z.infer<typeof ResetPeriodSchema>;
