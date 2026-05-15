import { z } from 'zod';

export const AddTradingMemberSchema = z.object({
  customerId:     z.string().uuid(),   // customer must already exist in customers table
  amount:         z.number().positive().max(100_000_000),
  enrolledBy:     z.string().uuid(),   // the SO/ABM/BM who brought the deal
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  paymentMode:    z.enum(['cash', 'gpay', 'bank_receipt']).default('cash'),
  notes:          z.string().max(1000).optional(),
});

export const GetTradingMembersQuerySchema = z.object({
  search:     z.string().max(100).optional(),
  enrolledBy: z.string().uuid().optional(),   // filter to one referrer's members
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(200).default(50),
});

export const GetTradingSummaryQuerySchema = z.object({
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type AddTradingMemberInput     = z.infer<typeof AddTradingMemberSchema>;
export type GetTradingMembersQuery    = z.infer<typeof GetTradingMembersQuerySchema>;
export type GetTradingSummaryQuery    = z.infer<typeof GetTradingSummaryQuerySchema>;
