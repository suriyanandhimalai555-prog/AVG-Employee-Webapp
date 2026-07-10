import { z } from 'zod';

// ─── Slot purchase ────────────────────────────────────────────────────────
// quantity=20 with an empty room == "Full" room (one owner). quantity<20 == Single.
// amountPaid is PER SLOT (must equal plan.price); total = quantity * amountPaid.
export const CreateSlotSchema = z.object({
  planId:      z.string().uuid(),
  customerId:  z.string().uuid(),
  amountPaid:  z.number().positive().max(10_000_000),
  quantity:    z.number().int().min(1).max(20).default(1),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  proofKey:    z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how the PER-SLOT amountPaid divides between cash and bank
  cashAmount:  z.number().positive().optional(),
  bankAmount:  z.number().positive().optional(),
  referrerId:  z.string().uuid().optional(),
  notes:       z.string().max(500).optional(),
  branchId:    z.string().uuid().optional(),
  // Business date of the sale — defaults to today on the server. Past dates
  // require the backdated-entry flag; the slot and its incentive land in
  // this date's period.
  saleDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMode !== 'cash' && !data.proofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'proofKey is required for gpay and bank_receipt payments',
      path: ['proofKey'],
    });
  }
  if (data.paymentMode !== 'cash' && !data.transactionId?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'transactionId is required for gpay and bank_receipt payments',
      path: ['transactionId'],
    });
  }
  // cash_bank: split is per-slot and must sum to amountPaid (the per-slot price)
  if (data.paymentMode === 'cash_bank') {
    if (!data.cashAmount || !data.bankAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount and bankAmount are required for cash_bank payments',
        path: ['cashAmount'],
      });
    } else if (Math.abs(data.cashAmount + data.bankAmount - data.amountPaid) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount + bankAmount must equal amountPaid (per slot)',
        path: ['bankAmount'],
      });
    }
  }
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
  search:  z.string().max(100).optional(),
  page:    z.coerce.number().min(1).default(1),
  limit:   z.coerce.number().min(1).max(200).default(50),
});

// Correction schema — MD / Management only (PATCH /lss/slots/:id/correct)
// customerId lets the admin fix who the slot is attributed to.
// saleDate allows moving the slot to a different business date — only allowed
// while the room is still filling/pending_combine and the slot is not won.
export const CorrectLssSlotSchema = z.object({
  customerId:  z.string().uuid().optional(),
  referrerId:  z.string().uuid().optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  paymentMode: z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).optional(),
  proofKey:    z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional().nullable(),
  // cash_bank split amounts (nullable so a correction can clear them)
  cashAmount:  z.number().positive().optional().nullable(),
  bankAmount:  z.number().positive().optional().nullable(),
  branchId:    z.string().uuid().optional(),
  // Move the slot's business date — updates created_at + paid_at and re-points incentives.
  // Rejected by the server when the room already has draws or the slot is won.
  saleDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
}).superRefine((data, ctx) => {
  if (data.paymentMode && data.paymentMode !== 'cash' && !data.proofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'proofKey is required when setting paymentMode to gpay or bank_receipt',
      path: ['proofKey'],
    });
  }
  if (data.paymentMode && data.paymentMode !== 'cash' && !data.transactionId?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'transactionId is required when setting paymentMode to gpay or bank_receipt',
      path: ['transactionId'],
    });
  }
  // cash_bank: both split amounts required; sum is verified server-side against amount_paid
  if (data.paymentMode === 'cash_bank' && (!data.cashAmount || !data.bankAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'cashAmount and bankAmount are required when setting paymentMode to cash_bank',
      path: ['cashAmount'],
    });
  }
});
export type CorrectLssSlotInput = z.infer<typeof CorrectLssSlotSchema>;

// ─── Update draw date — MD / Management only (PATCH /rooms/:roomId/draws/:drawId) ───
// Back-office correction: no ordering constraint enforced (dates are reference-only).
export const UpdateDrawDateSchema = z.object({
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  branchId: z.string().uuid().optional(),
});
export type UpdateDrawDateInput = z.infer<typeof UpdateDrawDateSchema>;

// ─── Update room dates — MD / Management only (PATCH /rooms/:id/dates) ─────────
// Edits created_at, fill_deadline, or first_draw_date — no incentive impact.
// At least one date field must be provided.
export const UpdateRoomDatesSchema = z.object({
  createdAt:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  fillDeadline:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  firstDrawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  branchId:      z.string().uuid().optional(),
}).refine(d => d.createdAt || d.fillDeadline || d.firstDrawDate, {
  message: 'At least one date field (createdAt, fillDeadline, firstDrawDate) must be provided',
});
export type UpdateRoomDatesInput = z.infer<typeof UpdateRoomDatesSchema>;

export type CreateSlotInput   = z.infer<typeof CreateSlotSchema>;
export type ActivateRoomInput = z.infer<typeof ActivateRoomSchema>;
export type RunDrawInput       = z.infer<typeof RunDrawSchema>;
export type CombineRoomsInput  = z.infer<typeof CombineRoomsSchema>;
export type RefundRoomInput    = z.infer<typeof RefundRoomSchema>;
export type ListRoomsQuery     = z.infer<typeof ListRoomsQuerySchema>;
