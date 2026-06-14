import { z } from 'zod';

// ─── Slot purchase ────────────────────────────────────────────────────────
// Branch admin sells a slot to a customer. If 16 slots already exist in the
// current filling room for (package, branch), the next purchase opens a new
// room — handled inside the service, not the caller.
// quantity = number of slots this customer is buying right now (1-16).
// quantity=16 with an empty room == "Full" room (one owner). quantity<16 == Single.
// amountPaid is PER SLOT (must equal package.price); total = quantity * amountPaid.
export const CreateSlotSchema = z.object({
  packageId:   z.string().uuid(),
  customerId:  z.string().uuid(),
  amountPaid:  z.number().positive().max(10_000_000),
  quantity:    z.number().int().min(1).max(16).default(1),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  proofKey:    z.string().optional(),
  referrerId:  z.string().uuid().optional(),
  notes:       z.string().max(500).optional(),
  branchId:    z.string().uuid().optional(),
  // Business date of the sale — defaults to today on the server. Past dates
  // require the backdated-entry flag; the slot and its incentive land in
  // this date's period.
  saleDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMode !== 'cash' && !data.proofKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'proofKey is required for gpay and bank_receipt payments',
      path: ['proofKey'],
    });
  }
});

// ─── Room activation ──────────────────────────────────────────────────────
export const ActivateRoomSchema = z.object({
  notes: z.string().max(500).optional(),
});

// ─── Run a draw ───────────────────────────────────────────────────────────
// Admin manually picks which held slot is eliminated. winningSlotId must
// reference a slot in this room with status='held'.
// drawDate defaults to today on the server if omitted.
export const RunDrawSchema = z.object({
  winningSlotId: z.string().uuid(),
  drawDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  notes:         z.string().max(500).optional(),
});

// ─── Head-branch combine ──────────────────────────────────────────────────
// Pick N pending_combine rooms (must all share the same package_id) whose
// total slot count >= 16; the service will move the first 16 slots into a
// new combined room owned by the head branch.
export const CombineRoomsSchema = z.object({
  sourceRoomIds: z.array(z.string().uuid()).min(2).max(16),
  notes:         z.string().max(500).optional(),
});

// ─── Head-branch refund ────────────────────────────────────────────────────
export const RefundRoomSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── List queries ────────────────────────────────────────────────────────
// branchId is intentionally removed — branch scope is always derived server-side
// from the caller's JWT identity; clients cannot override it.
export const ListRoomsQuerySchema = z.object({
  status:    z.enum(['filling', 'pending_combine', 'combined_into', 'expired', 'active', 'completed']).optional(),
  packageId: z.string().uuid().optional(),
  page:      z.coerce.number().min(1).default(1),
  limit:     z.coerce.number().min(1).max(200).default(50),
});

// Correction schema — MD / Management only (PATCH /gold-coin/slots/:id/correct)
// customerId lets the admin fix who the slot is attributed to.
export const CorrectGoldCoinSlotSchema = z.object({
  customerId:  z.string().uuid().optional(),
  referrerId:  z.string().uuid().optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt']).optional(),
  proofKey:    z.string().optional(),
  branchId:    z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMode && data.paymentMode !== 'cash' && !data.proofKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'proofKey is required when setting paymentMode to gpay or bank_receipt',
      path: ['proofKey'],
    });
  }
});
export type CorrectGoldCoinSlotInput = z.infer<typeof CorrectGoldCoinSlotSchema>;

export type CreateSlotInput      = z.infer<typeof CreateSlotSchema>;
export type ActivateRoomInput    = z.infer<typeof ActivateRoomSchema>;
export type RunDrawInput         = z.infer<typeof RunDrawSchema>;
export type CombineRoomsInput    = z.infer<typeof CombineRoomsSchema>;
export type RefundRoomInput      = z.infer<typeof RefundRoomSchema>;
export type ListRoomsQuery       = z.infer<typeof ListRoomsQuerySchema>;
