import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Sites ────────────────────────────────────────────────────────────────────

export const CreateLandSiteSchema = z.object({
  name:         z.string().min(1).max(200),
  layoutName:   z.string().max(200).optional(),
  location:     z.string().max(500).optional(),
  address:      z.string().max(1000).optional(),
  state:        z.string().max(100).optional(),
  loanEnabled:  z.boolean().default(false),
});

export const UpdateLandSiteSchema = z.object({
  name:         z.string().min(1).max(200).optional(),
  layoutName:   z.string().max(200).optional(),
  location:     z.string().max(500).optional(),
  address:      z.string().max(1000).optional(),
  state:        z.string().max(100).optional(),
  loanEnabled:  z.boolean().optional(),
  status:       z.enum(['active', 'inactive']).optional(),
});

export const ListSitesQuerySchema = z.object({
  status: z.enum(['active', 'inactive']).optional(),
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(200).default(50),
});

// ─── Plots ────────────────────────────────────────────────────────────────────

export const CreateLandPlotSchema = z.object({
  siteNumber:           z.string().min(1).max(50),
  areaSqft:             z.number().positive(),
  landCost:             z.number().positive(),
  buybackBonusMonthly:  z.number().min(0),
});

export const UpdateLandPlotSchema = z.object({
  areaSqft:             z.number().positive().optional(),
  landCost:             z.number().positive().optional(),
  buybackBonusMonthly:  z.number().min(0).optional(),
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
  notes:       z.string().max(1000).optional(),
});

export const RecordAdvanceSchema = z.object({
  advanceAmount: z.number().positive(),
  advanceDate:   z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
});

export const RecordFullPaymentSchema = z.object({
  fullAmount:       z.number().positive(),
  fullPaymentDate:  z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  loanTaken:        z.boolean().default(false),
  loanAmount:       z.number().positive().optional(),
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
  paidDate: z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
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

// ─── Inferred types ───────────────────────────────────────────────────────────
export type CreateLandSiteInput    = z.infer<typeof CreateLandSiteSchema>;
export type UpdateLandSiteInput    = z.infer<typeof UpdateLandSiteSchema>;
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
