import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The 5 fixed packages — amounts are denormalised to the groups table on creation.
// Lookup is done in the service; this enum keeps the schema honest.
export const CHIT_PACKAGES: Record<number, { fullAmount: number; halfAmount: number }> = {
  1: { fullAmount: 5_000,  halfAmount: 2_500  },
  2: { fullAmount: 10_000, halfAmount: 5_000  },
  3: { fullAmount: 15_000, halfAmount: 7_500  },
  4: { fullAmount: 20_000, halfAmount: 10_000 },
  5: { fullAmount: 25_000, halfAmount: 12_500 },
};

// ─── Package edit (config roles) ─────────────────────────────────────────────
export const UpdateChitPackageSchema = z.object({
  fullAmount: z.number().positive().optional(),
  halfAmount: z.number().positive().optional(),
});
export type UpdateChitPackageInput = z.infer<typeof UpdateChitPackageSchema>;

export const CreateChitGroupSchema = z.object({
  groupName:     z.string().min(1).max(100),
  packageNumber: z.number().int().min(1).max(5),
  startDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  notes:         z.string().max(1000).optional(),
  branchId:      z.string().uuid().optional(),
});

export const AddChitMemberSchema = z.object({
  customerId:           z.string().uuid(),
  referrerId:           z.string().uuid().optional(),
  firstPaymentDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  firstPaymentMode:     z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  firstPaymentProofKey: z.array(z.string()).max(5).optional(),
  // firstPaymentTransactionId is an array of up to 5 UPI/bank reference strings
  firstPaymentTransactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how the first month's amount divides between cash and bank.
  // The month amount is derived from the group package server-side, so the sum is
  // validated in the service (not here).
  firstPaymentCashAmount: z.number().positive().optional(),
  firstPaymentBankAmount: z.number().positive().optional(),
  notes:                z.string().max(500).optional(),
  branchId:             z.string().uuid().optional(),
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
  // cash_bank: both split amounts required; sum is verified server-side against the month amount
  if (data.firstPaymentMode === 'cash_bank' && (!data.firstPaymentCashAmount || !data.firstPaymentBankAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'firstPaymentCashAmount and firstPaymentBankAmount are required for cash_bank payments',
      path: ['firstPaymentCashAmount'],
    });
  }
});

export const RecordChitPaymentSchema = z.object({
  monthNumber:  z.number().int().min(1).max(20),
  amount:       z.number().positive(),
  paymentDate:  z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  proofKey:     z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how this payment's amount divides between cash and bank
  cashAmount:   z.number().positive().optional(),
  bankAmount:   z.number().positive().optional(),
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
});

export const SelectWinnerSchema = z.object({
  memberId: z.string().uuid(),
  notes:    z.string().max(500).optional(),
});

export const CancelMemberSchema = z.object({
  // The two consecutive months that caused the cancellation
  cancelDueMonth1: z.number().int().min(1).max(20),
  cancelDueMonth2: z.number().int().min(1).max(20).optional(),
});

export const MarkRefundSchema = z.object({
  memberId: z.string().uuid(),
});

export const GetChitGroupsQuerySchema = z.object({
  // 'in_progress' is a virtual filter: forming + active + pending_combine
  status: z.enum(['forming','active','completed','pending_combine','combined_into','expired','in_progress']).optional(),
  search: z.string().max(100).optional(),
  page:   z.coerce.number().min(1).default(1),
  limit:  z.coerce.number().min(1).max(200).default(50),
});

// Head-branch: combine two or more pending_combine groups into one new group
export const CombineChitGroupsSchema = z.object({
  sourceGroupIds: z.string().uuid().array().min(2).max(20),
  notes:          z.string().max(500).optional(),
});

export const GetChitSummaryQuerySchema = z.object({
  startDate: z.string().regex(DATE_RE).optional(),
  endDate:   z.string().regex(DATE_RE).optional(),
});

// Correction schema — MD / Management only
// customerId lets the admin fix the customer on an existing enrollment.
export const CorrectChitMemberSchema = z.object({
  customerId:  z.string().uuid().optional(),
  referrerId:  z.string().uuid().optional().nullable(),
  notes:       z.string().max(500).optional().nullable(),
  branchId:    z.string().uuid().optional(),
});

// Per-payment correction — edit month/amount/date/mode on a recorded chit payment.
export const CorrectChitPaymentSchema = z.object({
  monthNumber:  z.number().int().min(1).max(20).optional(),
  amount:       z.number().positive().optional(),
  paymentDate:  z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).optional(),
  proofKey:     z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional().nullable(),
  // cash_bank split amounts (nullable so a correction can clear them)
  cashAmount:   z.number().positive().optional().nullable(),
  bankAmount:   z.number().positive().optional().nullable(),
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
});

export type CreateChitGroupInput      = z.infer<typeof CreateChitGroupSchema>;
export type AddChitMemberInput        = z.infer<typeof AddChitMemberSchema>;
export type RecordChitPaymentInput    = z.infer<typeof RecordChitPaymentSchema>;
export type SelectWinnerInput         = z.infer<typeof SelectWinnerSchema>;
export type CancelMemberInput         = z.infer<typeof CancelMemberSchema>;
export type GetChitGroupsQuery        = z.infer<typeof GetChitGroupsQuerySchema>;
export type CombineChitGroupsInput    = z.infer<typeof CombineChitGroupsSchema>;
export type CorrectChitMemberInput    = z.infer<typeof CorrectChitMemberSchema>;
export type CorrectChitPaymentInput   = z.infer<typeof CorrectChitPaymentSchema>;
