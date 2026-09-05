import { z } from 'zod';

// Schema for adding a new gold scheme member (chit slot)
export const AddGoldMemberSchema = z.object({
  chitNumber:            z.string().min(1).max(20),
  customerId:            z.string().uuid(),             // must exist in customers table
  referrerId:            z.string().uuid(),
  monthlyAmount:         z.number().positive().max(10_000_000),
  startDate:             z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  totalMonths:           z.number().int().min(1).max(60).default(12),
  firstPaymentMode:      z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay']).default('cash'),
  firstPaymentProofKey:  z.array(z.string()).max(5).optional(),
  // firstPaymentTransactionId is an array of up to 5 UPI/bank reference strings
  firstPaymentTransactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how the month-1 amount divides between cash and bank
  firstPaymentCashAmount: z.number().positive().optional(),
  firstPaymentBankAmount: z.number().positive().optional(),
  // cash_gpay split: how the month-1 amount divides between cash and gpay
  firstPaymentGpayAmount: z.number().positive().optional(),
  notes:                 z.string().max(1000).optional(),
  // Passed by management role only — ignored for branch_admin (branchId from JWT)
  branchId:              z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.firstPaymentMode !== 'cash' && !data.firstPaymentProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom, 
      message: 'firstPaymentProofKey is required for gpay and bank_receipt payments',
      path: ['firstPaymentProofKey'],
    });
  }
  if (data.firstPaymentMode !== 'cash' && !data.firstPaymentTransactionId?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'firstPaymentTransactionId is required for gpay and bank_receipt payments',
      path: ['firstPaymentTransactionId'],
    });
  }
  // cash_bank: both split amounts required and must sum to the month-1 amount
  if (data.firstPaymentMode === 'cash_bank') {
    if (!data.firstPaymentCashAmount || !data.firstPaymentBankAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firstPaymentCashAmount and firstPaymentBankAmount are required for cash_bank payments',
        path: ['firstPaymentCashAmount'],
      });
    } else if (Math.abs(data.firstPaymentCashAmount + data.firstPaymentBankAmount - data.monthlyAmount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firstPaymentCashAmount + firstPaymentBankAmount must equal monthlyAmount',
        path: ['firstPaymentBankAmount'],
      });
    }
  }
  // cash_gpay: both split amounts required and must sum to the month-1 amount
  if (data.firstPaymentMode === 'cash_gpay') {
    if (!data.firstPaymentCashAmount || !data.firstPaymentGpayAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firstPaymentCashAmount and firstPaymentGpayAmount are required for cash_gpay payments',
        path: ['firstPaymentCashAmount'],
      });
    } else if (Math.abs(data.firstPaymentCashAmount + data.firstPaymentGpayAmount - data.monthlyAmount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'firstPaymentCashAmount + firstPaymentGpayAmount must equal monthlyAmount',
        path: ['firstPaymentGpayAmount'],
      });
    }
  }
});

// Schema for listing members — optional filters
export const GetGoldMembersQuerySchema = z.object({
  status:     z.enum(['active', 'completed', 'withdrawn']).optional(),
  referrerId: z.string().uuid().optional(),
  // MD / Management only: narrow the org-wide list to one branch (ignored for other roles)
  branchId:   z.string().uuid().optional(),
  search:     z.string().max(100).optional(),
  // Opt-in: also match the referrer's name in search (monitoring page only —
  // on referrer-scoped views every row's referrer is the viewer, so matching
  // referrer names there would make search return everything)
  searchReferrers: z.enum(['true', 'false']).optional(),
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
  status:   z.enum(['active', 'completed', 'withdrawn']),
  branchId: z.string().uuid().optional(),
});

export const AddGoldPaymentSchema = z.object({
  monthNumber:  z.number().int().min(1).max(60),
  paidDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  amount:       z.number().positive(),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay']).default('cash'),
  proofKey:     z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how this payment's amount divides between cash and bank
  cashAmount:   z.number().positive().optional(),
  bankAmount:   z.number().positive().optional(),
  // cash_gpay split: how this payment's amount divides between cash and gpay
  gpayAmount:   z.number().positive().optional(),
  notes:        z.string().max(500).optional(),
  branchId:     z.string().uuid().optional(),
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
  // cash_bank: both split amounts required and must sum to the payment amount
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
  // cash_gpay: both split amounts required and must sum to the payment amount
  if (data.paymentMode === 'cash_gpay') {
    if (!data.cashAmount || !data.gpayAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount and gpayAmount are required for cash_gpay payments',
        path: ['cashAmount'],
      });
    } else if (Math.abs(data.cashAmount + data.gpayAmount - data.amount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount + gpayAmount must equal amount',
        path: ['gpayAmount'],
      });
    }
  }
});

// Schema for correcting an existing gold member — all fields optional except branchId guard.
// Only scheme-admin roles (MD / Management) call this via PATCH /gold/:id/correct.
export const CorrectGoldMemberSchema = z.object({
  chitNumber:    z.string().min(1).max(20).optional(),
  customerId:    z.string().uuid().optional(),
  referrerId:    z.string().uuid().optional().nullable(),  // null clears the referrer
  monthlyAmount: z.number().positive().max(10_000_000).optional(),
  startDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  totalMonths:   z.number().int().min(1).max(60).optional(),
  notes:         z.string().max(1000).optional().nullable(),
  branchId:      z.string().uuid().optional(),  // required for management, auto for MD
});

// Schema for correcting an existing gold payment row.
// Only scheme-admin roles call this via PATCH /gold/:memberId/payments/:paymentId/correct.
export const CorrectGoldPaymentSchema = z.object({
  monthNumber:  z.number().int().min(1).max(60).optional(),
  paidDate:     z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  amount:       z.number().positive().optional(),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank', 'cash_gpay']).optional(),
  proofKey:     z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional().nullable(),
  // cash_bank split amounts (nullable so a correction can clear them)
  cashAmount:   z.number().positive().optional().nullable(),
  bankAmount:   z.number().positive().optional().nullable(),
  // cash_gpay split amount (nullable so a correction can clear it)
  gpayAmount:   z.number().positive().optional().nullable(),
  notes:        z.string().max(500).optional().nullable(),
  branchId:     z.string().uuid().optional(),
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
  // cash_gpay: both split amounts required; when amount is also supplied, verify the sum here
  if (data.paymentMode === 'cash_gpay') {
    if (!data.cashAmount || !data.gpayAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount and gpayAmount are required when setting paymentMode to cash_gpay',
        path: ['cashAmount'],
      });
    } else if (data.amount != null && Math.abs(data.cashAmount + data.gpayAmount - data.amount) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'cashAmount + gpayAmount must equal amount',
        path: ['gpayAmount'],
      });
    }
  }
});

export type AddGoldMemberInput      = z.infer<typeof AddGoldMemberSchema>;
export type GetGoldMembersQuery     = z.infer<typeof GetGoldMembersQuerySchema>;
export type GetGoldSummaryQuery     = z.infer<typeof GetGoldSummaryQuerySchema>;
export type UpdateGoldMemberStatus  = z.infer<typeof UpdateGoldMemberStatusSchema>;
export type AddGoldPaymentInput     = z.infer<typeof AddGoldPaymentSchema>;
export type CorrectGoldMemberInput  = z.infer<typeof CorrectGoldMemberSchema>;
export type CorrectGoldPaymentInput = z.infer<typeof CorrectGoldPaymentSchema>;
