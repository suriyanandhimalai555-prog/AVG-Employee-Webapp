import { z } from 'zod';

// ─── Slot purchase ────────────────────────────────────────────────────────
// quantity=20 with an empty room == "Full" room (one owner). quantity<20 == Single.
// amountPaid is PER SLOT (must equal plan.price); total = quantity * amountPaid.
export const CreateSlotSchema = z.object({
  planId:      z.string().uuid(),
  customerId:  z.string().uuid(),
  amountPaid:  z.number().positive().max(10_000_000),
  quantity:    z.number().int().min(1).max(20).default(1),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  referrerId:  z.string().uuid().optional(),
  notes:       z.string().max(500).optional(),
  branchId:    z.string().uuid().optional(),
  // Business date of the sale — defaults to today on the server. Past dates
  // require the backdated-entry flag; the slot and its incentive land in
  // this date's period.
  saleDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

// ─── Room activation ──────────────────────────────────────────────────────
export const ActivateRoomSchema = z.object({
  notes: z.string().max(500).optional(),
});

// ─── Run a draw ───────────────────────────────────────────────────────────
export const RunDrawSchema = z.object({
  winningSlotId: z.string().uuid(),
  drawDate:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  notes:         z.string().max(500).optional(),
});

// ─── Head-branch combine ──────────────────────────────────────────────────
export const CombineRoomsSchema = z.object({
  sourceRoomIds: z.array(z.string().uuid()).min(2).max(20),
  notes:         z.string().max(500).optional(),
});

// ─── Head-branch refund ────────────────────────────────────────────────────
export const RefundRoomSchema = z.object({
  reason: z.string().max(500).optional(),
});

// ─── List queries ─────────────────────────────────────────────────────────
export const ListRoomsQuerySchema = z.object({
  status:  z.enum(['filling', 'pending_combine', 'combined_into', 'expired', 'active', 'completed']).optional(),
  planId:  z.string().uuid().optional(),
  page:    z.coerce.number().min(1).default(1),
  limit:   z.coerce.number().min(1).max(200).default(50),
});

// Correction schema — MD / Management only (PATCH /lss/slots/:id/correct)
// customerId lets the admin fix who the slot is attributed to.
export const CorrectLssSlotSchema = z.object({
  customerId:  z.string().uuid().optional(),
  referrerId:  z.string().uuid().optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt']).optional(),
  branchId:    z.string().uuid().optional(),
});
export type CorrectLssSlotInput = z.infer<typeof CorrectLssSlotSchema>;

export type CreateSlotInput   = z.infer<typeof CreateSlotSchema>;
export type ActivateRoomInput = z.infer<typeof ActivateRoomSchema>;
export type RunDrawInput       = z.infer<typeof RunDrawSchema>;
export type CombineRoomsInput  = z.infer<typeof CombineRoomsSchema>;
export type RefundRoomInput    = z.infer<typeof RefundRoomSchema>;
export type ListRoomsQuery     = z.infer<typeof ListRoomsQuerySchema>;
