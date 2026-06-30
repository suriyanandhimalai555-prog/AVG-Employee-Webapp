import { z } from 'zod';

// Body for PUT /settings/backdated-entry — management toggles the flag.
export const UpdateBackdatedEntrySchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred input type so the service signature stays in sync with the schema
export type UpdateBackdatedEntryInput = z.infer<typeof UpdateBackdatedEntrySchema>;

// Body for PUT /settings/whatsapp-messages — management toggles WhatsApp sends.
// TS: same shape as backdated-entry — just a single boolean flag
export const UpdateWhatsappMessagesSchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred type keeps service + route in sync
export type UpdateWhatsappMessagesInput = z.infer<typeof UpdateWhatsappMessagesSchema>;

// Body for PUT /settings/lss-eligibility-bypass — management bypasses 30-day LSS draw wait.
export const UpdateLssEligibilityBypassSchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred type keeps service + route in sync
export type UpdateLssEligibilityBypassInput = z.infer<typeof UpdateLssEligibilityBypassSchema>;

// Body for PUT /settings/gold-coin-eligibility-bypass — management bypasses 30-day Gold-Coin draw wait.
export const UpdateGoldCoinEligibilityBypassSchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred type keeps service + route in sync
export type UpdateGoldCoinEligibilityBypassInput = z.infer<typeof UpdateGoldCoinEligibilityBypassSchema>;

// Body for PUT /settings/daily-collection-reconciliation — management enables/disables
// the mandatory morning declaration workflow for branch admins.
export const UpdateDailyCollectionReconciliationSchema = z.object({
  enabled: z.boolean(),
});

// TS: inferred type keeps service + route in sync
export type UpdateDailyCollectionReconciliationInput = z.infer<typeof UpdateDailyCollectionReconciliationSchema>;
