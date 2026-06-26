import { z } from 'zod';

export const AddTradingMemberSchema = z.object({
  customerId:     z.string().uuid(),
  amount:         z.number().positive().max(100_000_000),
  enrolledBy:     z.string().uuid(),
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  paymentMode:    z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  proofKey:       z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId:  z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how the enrollment amount divides between cash and bank
  cashAmount:     z.number().positive().optional(),
  bankAmount:     z.number().positive().optional(),
  notes:          z.string().max(1000).optional(),
  branchId:       z.string().uuid().optional(),
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
  // cash_bank: both split amounts required and must sum to the enrollment amount
  if (data.paymentMode === 'cash_bank') {
    if (!data.cashAmount || !data.bankAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount and bankAmount are required for cash_bank payments',
        path: ['cashAmount'],
      });
    } else if (Math.abs(data.cashAmount + data.bankAmount - data.amount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount + bankAmount must equal amount',
        path: ['bankAmount'],
      });
    }
  }
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

// Correction schema — only scheme-admin roles call PATCH /trading-academy/:id/correct
export const CorrectTradingMemberSchema = z.object({
  customerId:     z.string().uuid().optional(),
  enrolledBy:     z.string().uuid().optional().nullable(),   // the selling-chain dealMaker; null is a no-op (kept for payload consistency)
  amount:         z.number().positive().max(100_000_000).optional(),
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  paymentMode:    z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).optional(),
  proofKey:       z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId:  z.array(z.string().max(100)).max(5).optional().nullable(),
  // cash_bank split amounts (nullable so a correction can clear them)
  cashAmount:     z.number().positive().optional().nullable(),
  bankAmount:     z.number().positive().optional().nullable(),
  notes:          z.string().max(1000).optional().nullable(),
  branchId:       z.string().uuid().optional(),  // management must supply; MD optional
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
  // cash_bank: both split amounts required; when amount is also supplied, verify the sum here
  // (a clean 400). When amount is omitted, the DB CHECK enforces the sum against the row.
  if (data.paymentMode === 'cash_bank') {
    if (!data.cashAmount || !data.bankAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount and bankAmount are required when setting paymentMode to cash_bank',
        path: ['cashAmount'],
      });
    } else if (data.amount != null && Math.abs(data.cashAmount + data.bankAmount - data.amount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount + bankAmount must equal amount',
        path: ['bankAmount'],
      });
    }
  }
});

export type AddTradingMemberInput        = z.infer<typeof AddTradingMemberSchema>;
export type GetTradingMembersQuery       = z.infer<typeof GetTradingMembersQuerySchema>;
export type GetTradingSummaryQuery       = z.infer<typeof GetTradingSummaryQuerySchema>;
export type CorrectTradingMemberInput    = z.infer<typeof CorrectTradingMemberSchema>;
