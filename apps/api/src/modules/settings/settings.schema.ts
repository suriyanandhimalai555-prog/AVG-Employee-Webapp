import { z } from 'zod';

// Body for PUT /settings/backdated-entry — management toggles the flag.
export const UpdateBackdatedEntrySchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred input type so the service signature stays in sync with the schema
export type UpdateBackdatedEntryInput = z.infer<typeof UpdateBackdatedEntrySchema>;
