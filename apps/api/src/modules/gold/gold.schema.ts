import { z } from 'zod';

// Schema for adding a new gold scheme member (chit slot)
export const AddGoldMemberSchema = z.object({
  chitNumber:       z.string().min(1).max(20),
  customerId:       z.string().uuid(),             // must exist in customers table
  referrerId:       z.string().uuid(),
  monthlyAmount:    z.number().positive().max(10_000_000),
  startDate:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  totalMonths:      z.number().int().min(1).max(60).default(12),
  firstPaymentMode: z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  notes:            z.string().max(1000).optional(),
});

// Schema for listing members — optional filters
export const GetGoldMembersQuerySchema = z.object({
  status:     z.enum(['active', 'completed', 'withdrawn']).optional(),
  referrerId: z.string().uuid().optional(),
  search:     z.string().max(100).optional(),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(500).default(50),
});

// Schema for summary query — optional date filter
export const GetGoldSummaryQuerySchema = z.object({
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const UpdateGoldMemberStatusSchema = z.object({
  status: z.enum(['active', 'completed', 'withdrawn']),
});

export const AddGoldPaymentSchema = z.object({
  monthNumber:  z.number().int().min(1).max(60),
  paidDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  amount:       z.number().positive(),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  notes:        z.string().max(500).optional(),
});

export type AddGoldMemberInput      = z.infer<typeof AddGoldMemberSchema>;
export type GetGoldMembersQuery     = z.infer<typeof GetGoldMembersQuerySchema>;
export type UpdateGoldMemberStatus  = z.infer<typeof UpdateGoldMemberStatusSchema>;
export type AddGoldPaymentInput     = z.infer<typeof AddGoldPaymentSchema>;
