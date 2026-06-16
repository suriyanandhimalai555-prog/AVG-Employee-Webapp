import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Sites ────────────────────────────────────────────────────────────────────

export const CreateLandSiteSchema = z.object({
  name:        z.string().min(1).max(200),
  location:    z.string().max(500).optional(),
  address:     z.string().max(1000).optional(),
  state:       z.string().max(100).optional(),
  loanEnabled: z.boolean().default(false),
});

export const UpdateLandSiteSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  location:    z.string().max(500).optional(),
  address:     z.string().max(1000).optional(),
  state:       z.string().max(100).optional(),
  loanEnabled: z.boolean().optional(),
  status:      z.enum(['active', 'inactive']).optional(),
});

// ─── Layouts ─────────────────────────────────────────────────────────────────

export const CreateLandLayoutSchema = z.object({
  layoutName:           z.string().max(200).optional(),
  locationDetail:       z.string().max(1000).optional(),
  plotPrice:            z.number().positive().optional(),
  plotSizeSqft:         z.number().positive().optional(),
  pricePerSqft:         z.number().positive().optional(),
  buybackBonusMonthly:  z.number().min(0).optional(),
  buybackMonths:        z.coerce.number().int().min(1).max(120).optional(),
  incentiveType:        z.enum(['spot_incentive','spot_commission']).default('spot_commission'),
});

export const UpdateLandLayoutSchema = z.object({
  layoutName:           z.string().max(200).optional(),
  locationDetail:       z.string().max(1000).optional(),
  plotPrice:            z.number().positive().optional(),
  plotSizeSqft:         z.number().positive().optional(),
  pricePerSqft:         z.number().positive().optional(),
  buybackBonusMonthly:  z.number().min(0).optional(),
  buybackMonths:        z.coerce.number().int().min(1).max(120).optional(),
  incentiveType:        z.enum(['spot_incentive','spot_commission']).optional(),
  status:               z.enum(['active','inactive']).optional(),
});

export const ListSitesQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(200).default(50),
});

// ─── Plots ────────────────────────────────────────────────────────────────────

// Buyback is NOT accepted per plot — it lives on the layout and is common to
// every plot inside it (land_plots.buyback_bonus_monthly is a write-dead legacy column).
export const CreateLandPlotSchema = z.object({
  siteNumber:           z.string().min(1).max(50),
  areaSqft:             z.number().positive(),
  landCost:             z.number().positive(),
});

export const UpdateLandPlotSchema = z.object({
  areaSqft:             z.number().positive().optional(),
  landCost:             z.number().positive().optional(),
  status:               z.enum(['available', 'booked', 'cancelled', 'completed']).optional(),
});

export const ListPlotsQuerySchema = z.object({
  status: z.enum(['available', 'booked', 'cancelled', 'completed']).optional(),
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(500).default(200),
});

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const CreateLandBookingSchema = z.object({
  bookingRef:  z.string().min(1).max(50),
  customerId:  z.string().uuid(),
  plotId:      z.string().uuid(),
  paymentMode: z.enum(['full_payment', 'advance_full_payment']),
  bookingDate: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  referrerId:  z.string().uuid().optional(),
  notes:       z.string().max(1000).optional(),
});

// ─── Commission rules (MD / Management only) ────────────────────────────────
// monthly_months: null = no monthly commission for this role on this layout.
export const LAND_COMMISSION_ROLES = ['sales_officer', 'abm', 'branch_manager', 'gm'] as const;

export const UpdateLandCommissionRuleSchema = z.object({
  role:          z.enum(LAND_COMMISSION_ROLES),
  spotAmount:    z.number().min(0),
  monthlyAmount: z.number().min(0),
  monthlyMonths: z.number().int().min(1).max(120).nullable().optional(),
});

export const RecordAdvanceSchema = z.object({
  advanceAmount:   z.number().positive(),
  advanceDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  advanceChannel:  z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  advanceProofKey: z.array(z.string()).optional(),
  advanceTransactionId: z.string().max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.advanceChannel !== 'cash' && !data.advanceProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'advanceProofKey is required for gpay and bank_receipt payments',
      path: ['advanceProofKey'],
    });
  }
  if (data.advanceChannel !== 'cash' && !data.advanceTransactionId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'advanceTransactionId is required for gpay and bank_receipt payments',
      path: ['advanceTransactionId'],
    });
  }
});

export const RecordFullPaymentSchema = z.object({
  fullAmount:      z.number().positive(),
  fullPaymentDate: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  fullChannel:     z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  fullProofKey:    z.array(z.string()).optional(),
  fullTransactionId: z.string().max(100).optional(),
  loanTaken:       z.boolean().default(false),
  loanAmount:      z.number().positive().optional(),
}).superRefine((data, ctx) => {
  if (data.fullChannel !== 'cash' && !data.fullProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fullProofKey is required for gpay and bank_receipt payments',
      path: ['fullProofKey'],
    });
  }
  if (data.fullChannel !== 'cash' && !data.fullTransactionId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fullTransactionId is required for gpay and bank_receipt payments',
      path: ['fullTransactionId'],
    });
  }
});

export const CancelBookingSchema = z.object({
  reason: z.string().min(1).max(1000),
});

export const ListBookingsQuerySchema = z.object({
  status:    z.enum(['booked', 'advance_paid', 'full_paid', 'cancelled', 'completed']).optional(),
  siteId:    z.string().uuid().optional(),
  startDate: z.string().regex(DATE_RE).optional(),
  endDate:   z.string().regex(DATE_RE).optional(),
  page:      z.coerce.number().min(1).default(1),
  limit:     z.coerce.number().min(1).max(200).default(50),
});

// ─── Buyback ──────────────────────────────────────────────────────────────────

export const MarkPayoutPaidSchema = z.object({
  paidDate:    z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  paidChannel: z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  paidProofKey: z.array(z.string()).optional(),
  paidTransactionId: z.string().max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.paidChannel !== 'cash' && !data.paidProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'paidProofKey is required for gpay and bank_receipt payments',
      path: ['paidProofKey'],
    });
  }
  if (data.paidChannel !== 'cash' && !data.paidTransactionId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'paidTransactionId is required for gpay and bank_receipt payments',
      path: ['paidTransactionId'],
    });
  }
});

// ─── Audit ────────────────────────────────────────────────────────────────────

export const ListAuditQuerySchema = z.object({
  entity:    z.enum(['site', 'plot', 'customer', 'booking', 'payout']).optional(),
  recordId:  z.string().uuid().optional(),
  startDate: z.string().regex(DATE_RE).optional(),
  endDate:   z.string().regex(DATE_RE).optional(),
  page:      z.coerce.number().min(1).default(1),
  limit:     z.coerce.number().min(1).max(200).default(50),
});

// ─── Booking correction (MD / Management only) ───────────────────────────────
export const CorrectLandBookingSchema = z.object({
  bookingRef:      z.string().min(1).max(50).optional(),
  bookingDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  paymentMode:     z.enum(['full_payment', 'advance_full_payment']).optional(),
  referrerId:      z.string().uuid().optional().nullable(),  // null clears the referrer
  customerId:      z.string().uuid().optional(),
  advanceAmount:   z.number().positive().optional(),
  advanceDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  advanceChannel:  z.enum(['cash', 'gpay', 'bank_receipt']).optional(),
  advanceProofKey: z.array(z.string()).optional(),
  advanceTransactionId: z.string().max(100).optional().nullable(),
  fullAmount:      z.number().positive().optional(),
  fullPaymentDate: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  fullChannel:     z.enum(['cash', 'gpay', 'bank_receipt']).optional(),
  fullProofKey:    z.array(z.string()).optional(),
  fullTransactionId: z.string().max(100).optional().nullable(),
  loanTaken:       z.boolean().optional(),
  loanAmount:      z.number().positive().optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
  branchId:        z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.advanceChannel && data.advanceChannel !== 'cash' && !data.advanceProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'advanceProofKey is required when setting advanceChannel to gpay or bank_receipt',
      path: ['advanceProofKey'],
    });
  }
  if (data.fullChannel && data.fullChannel !== 'cash' && !data.fullProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fullProofKey is required when setting fullChannel to gpay or bank_receipt',
      path: ['fullProofKey'],
    });
  }
  if (data.advanceChannel && data.advanceChannel !== 'cash' && !data.advanceTransactionId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'advanceTransactionId is required when setting advanceChannel to gpay or bank_receipt',
      path: ['advanceTransactionId'],
    });
  }
  if (data.fullChannel && data.fullChannel !== 'cash' && !data.fullTransactionId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'fullTransactionId is required when setting fullChannel to gpay or bank_receipt',
      path: ['fullTransactionId'],
    });
  }
});

// ─── Inferred types ───────────────────────────────────────────────────────────
export type CreateLandSiteInput           = z.infer<typeof CreateLandSiteSchema>;
export type UpdateLandSiteInput           = z.infer<typeof UpdateLandSiteSchema>;
export type CreateLandLayoutInput         = z.infer<typeof CreateLandLayoutSchema>;
export type UpdateLandLayoutInput         = z.infer<typeof UpdateLandLayoutSchema>;
export type CorrectLandBookingInput       = z.infer<typeof CorrectLandBookingSchema>;
export type UpdateLandCommissionRuleInput = z.infer<typeof UpdateLandCommissionRuleSchema>;
export type ListSitesQuery         = z.infer<typeof ListSitesQuerySchema>;
export type CreateLandPlotInput    = z.infer<typeof CreateLandPlotSchema>;
export type UpdateLandPlotInput    = z.infer<typeof UpdateLandPlotSchema>;
export type ListPlotsQuery         = z.infer<typeof ListPlotsQuerySchema>;
export type CreateLandBookingInput = z.infer<typeof CreateLandBookingSchema>;
export type RecordAdvanceInput     = z.infer<typeof RecordAdvanceSchema>;
export type RecordFullPaymentInput = z.infer<typeof RecordFullPaymentSchema>;
export type CancelBookingInput     = z.infer<typeof CancelBookingSchema>;
export type ListBookingsQuery      = z.infer<typeof ListBookingsQuerySchema>;
export type MarkPayoutPaidInput    = z.infer<typeof MarkPayoutPaidSchema>;
export type ListAuditQuery         = z.infer<typeof ListAuditQuerySchema>;
