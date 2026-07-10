import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Package definitions ────────────────────────────────────────────────────
// The 6 fixed packages — amounts are denormalised to builders_plans at enrollment
// so future package changes do not affect existing plans.
//
// investmentAmount  : one-time lump sum the customer pays to join
// monthlyPayout     : fixed monthly disbursement for ALL 60 months (M1–60, every path)
// cashFinalMonthly  : ADDITIONAL bonus on top of monthlyPayout for M51–60 (cash path only)
//                     → total M51–60 per month = monthlyPayout + cashFinalMonthly
// houseWorth        : market value of the house built (house path, months 51–60)
export const BUILDERS_PACKAGES: Record<number, {
  investmentAmount:  number;
  monthlyPayout:     number;
  cashFinalMonthly:  number;
  houseWorth:        number;
}> = {
  1: { investmentAmount:   500_000, monthlyPayout:  20_000, cashFinalMonthly: 120_000, houseWorth: 1_000_000 },
  2: { investmentAmount: 1_000_000, monthlyPayout:  40_000, cashFinalMonthly: 240_000, houseWorth: 2_000_000 },
  3: { investmentAmount: 1_500_000, monthlyPayout:  60_000, cashFinalMonthly: 360_000, houseWorth: 3_000_000 },
  4: { investmentAmount: 2_000_000, monthlyPayout:  80_000, cashFinalMonthly: 480_000, houseWorth: 4_000_000 },
  5: { investmentAmount: 2_500_000, monthlyPayout: 100_000, cashFinalMonthly: 600_000, houseWorth: 5_000_000 },
  6: { investmentAmount: 3_000_000, monthlyPayout: 120_000, cashFinalMonthly: 720_000, houseWorth: 6_000_000 },
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

export const CreateBuildersPlanSchema = z.object({
  customerId:      z.string().uuid(),
  packageNumber:   z.number().int().min(1).max(6),
  lumpSumDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  lumpSumMode:     z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  lumpSumProofKey: z.array(z.string()).max(5).optional(),
  // lumpSumTransactionId is an array of up to 5 UPI/bank reference strings
  lumpSumTransactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how the lump sum divides between cash and bank. The lump-sum
  // amount is the package's investmentAmount (derived server-side), so the sum is
  // validated in the service (not here).
  lumpSumCashAmount: z.number().positive().optional(),
  lumpSumBankAmount: z.number().positive().optional(),
  referrerId:      z.string().uuid().optional(),
  notes:           z.string().max(1000).optional(),
  branchId:        z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.lumpSumMode !== 'cash' && !data.lumpSumProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumProofKey is required for gpay and bank_receipt payments',
      path: ['lumpSumProofKey'],
    });
  }
  if (data.lumpSumMode !== 'cash' && !data.lumpSumTransactionId?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumTransactionId is required for gpay and bank_receipt payments',
      path: ['lumpSumTransactionId'],
    });
  }
  // cash_bank: both split amounts required; sum is verified server-side against investmentAmount
  if (data.lumpSumMode === 'cash_bank' && (!data.lumpSumCashAmount || !data.lumpSumBankAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumCashAmount and lumpSumBankAmount are required for cash_bank payments',
      path: ['lumpSumCashAmount'],
    });
  }
});

export const RecordBuildersPayoutSchema = z.object({
  monthNumber:  z.number().int().min(1).max(60),
  amount:       z.number().positive(),
  payoutDate:   z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
  paymentMode:  z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  proofKey:     z.array(z.string()).max(5).optional(),
  // transactionId is an array of up to 5 UPI/bank reference strings — one per split transfer
  transactionId: z.array(z.string().max(100)).max(5).optional(),
  // cash_bank split: how this payout's amount divides between cash and bank
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
  // cash_bank: both split amounts required and must sum to the payout amount
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

export const ChooseRewardSchema = z.object({
  choice:       z.enum(['house', 'cash']),
  landProvided: z.boolean().optional(),
  branchId:     z.string().uuid().optional(),
});

export const GetBuildersPlansQuerySchema = z.object({
  status:     z.enum([
    'cooling', 'active', 'decision_pending', 'house', 'cash',
    'completed', 'cancelled', 'in_progress',
  ]).optional(),
  referrerId: z.string().uuid().optional(),
  search:     z.string().max(100).optional(),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(200).default(50),
});

export const GetBuildersSummaryQuerySchema = z.object({
  startDate: z.string().regex(DATE_RE).optional(),
  endDate:   z.string().regex(DATE_RE).optional(),
});

// ─── Package edit (config roles: MD / Director / Management) ─────────────────
export const UpdateBuildersPackageSchema = z.object({
  investmentAmount:  z.number().positive().optional(),
  monthlyPayout:     z.number().positive().optional(),
  cashFinalMonthly:  z.number().positive().optional(),
  houseWorth:        z.number().positive().optional(),
});
export type UpdateBuildersPackageInput = z.infer<typeof UpdateBuildersPackageSchema>;

// ─── Incentive rule edit (MD only) ───────────────────────────────────────────
// Upserts one cell in the builders_incentive_rules tier×role×type matrix.
export const UpdateBuildersIncentiveRuleSchema = z.object({
  packageNumber:  z.number().int().min(1).max(6),
  role:           z.enum(['sales_officer', 'abm', 'branch_manager', 'gm']),
  incentiveType:  z.enum(['one_time', 'monthly']),
  amount:         z.number().min(0),
});

// ─── Correction schemas (MD / Management only) ───────────────────────────────

// Correct an existing builders plan — editable fields only; packageNumber and
// amounts are derived from the package and cannot be patched directly here.
export const CorrectBuildersPlanSchema = z.object({
  customerId:      z.string().uuid().optional(),
  referrerId:      z.string().uuid().optional().nullable(),
  lumpSumDate:     z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
  lumpSumMode:     z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).optional(),
  lumpSumProofKey: z.array(z.string()).max(5).optional(),
  // lumpSumTransactionId is an array of up to 5 UPI/bank reference strings
  lumpSumTransactionId: z.array(z.string().max(100)).max(5).optional().nullable(),
  // cash_bank split amounts (nullable so a correction can clear them)
  lumpSumCashAmount: z.number().positive().optional().nullable(),
  lumpSumBankAmount: z.number().positive().optional().nullable(),
  notes:           z.string().max(1000).optional().nullable(),
  branchId:        z.string().uuid().optional(),  // management must supply; MD optional
}).superRefine((data, ctx) => {
  if (data.lumpSumMode && data.lumpSumMode !== 'cash' && !data.lumpSumProofKey?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumProofKey is required when setting lumpSumMode to gpay or bank_receipt',
      path: ['lumpSumProofKey'],
    });
  }
  if (data.lumpSumMode && data.lumpSumMode !== 'cash' && !data.lumpSumTransactionId?.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumTransactionId is required when setting lumpSumMode to gpay or bank_receipt',
      path: ['lumpSumTransactionId'],
    });
  }
  // cash_bank: both split amounts required; sum is verified server-side against investmentAmount
  if (data.lumpSumMode === 'cash_bank' && (!data.lumpSumCashAmount || !data.lumpSumBankAmount)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'lumpSumCashAmount and lumpSumBankAmount are required when setting lumpSumMode to cash_bank',
      path: ['lumpSumCashAmount'],
    });
  }
});

// Correct an existing payout row.
export const CorrectBuildersPayoutSchema = z.object({
  amount:       z.number().positive().optional(),
  payoutDate:   z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD').optional(),
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

// ─── Change reward (MD / Management correction — allowed after choice is made) ─
// Same shape as ChooseRewardSchema; a separate named schema keeps the route
// intent explicit and lets guards differ in the service layer.
export const ChangeRewardSchema = z.object({
  choice:       z.enum(['house', 'cash']),
  landProvided: z.boolean().optional(),
  branchId:     z.string().uuid().optional(),
});

// ─── Inferred types ───────────────────────────────────────────────────────────
export type CreateBuildersPlanInput            = z.infer<typeof CreateBuildersPlanSchema>;
export type RecordBuildersPayoutInput          = z.infer<typeof RecordBuildersPayoutSchema>;
export type ChooseRewardInput                  = z.infer<typeof ChooseRewardSchema>;
export type ChangeRewardInput                  = z.infer<typeof ChangeRewardSchema>;
export type GetBuildersPlansQuery              = z.infer<typeof GetBuildersPlansQuerySchema>;
export type GetBuildersSummaryQuery            = z.infer<typeof GetBuildersSummaryQuerySchema>;
export type UpdateBuildersIncentiveRuleInput   = z.infer<typeof UpdateBuildersIncentiveRuleSchema>;
export type CorrectBuildersPlanInput           = z.infer<typeof CorrectBuildersPlanSchema>;
export type CorrectBuildersPayoutInput         = z.infer<typeof CorrectBuildersPayoutSchema>;
