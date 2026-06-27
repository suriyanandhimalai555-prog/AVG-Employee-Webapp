import { z } from 'zod';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The schemes that support partial enrollment (Land excluded — it has its own advance/full flow).
export const IN_SCOPE_SCHEMES = [
  'gold_scheme',
  'trading_academy',
  'builders_scheme',
  'agila_chit_scheme',
  'gold_coin_scheme',
  'lss_scheme',
] as const;

// Raw shape of one part-payment (deposit or later installment). Mirrors the scheme
// payment-proof + cash_bank contract from migration 076.
const partPaymentShape = {
  amount:        z.number().positive(),
  paymentMode:   z.enum(['cash', 'gpay', 'bank_receipt', 'cash_bank']).default('cash'),
  cashAmount:    z.number().positive().optional(),
  bankAmount:    z.number().positive().optional(),
  proofKey:      z.array(z.string()).max(5).optional(),
  transactionId: z.array(z.string().max(100)).max(5).optional(),
  paidDate:      z.string().regex(DATE_RE, 'Date must be YYYY-MM-DD'),
};

// Shared refine: non-cash needs proof + a transaction id; cash_bank needs both split
// amounts summing to the payment amount (same rules as every scheme payment form).
function refinePartPayment(p: {
  amount: number; paymentMode: string;
  cashAmount?: number; bankAmount?: number;
  proofKey?: string[]; transactionId?: string[];
}, ctx: z.RefinementCtx, basePath: (string | number)[] = []) {
  if (p.paymentMode !== 'cash' && !p.proofKey?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'proofKey is required for gpay/bank_receipt/cash_bank payments', path: [...basePath, 'proofKey'] });
  }
  if (p.paymentMode !== 'cash' && !p.transactionId?.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'transactionId is required for gpay/bank_receipt/cash_bank payments', path: [...basePath, 'transactionId'] });
  }
  if (p.paymentMode === 'cash_bank') {
    if (!p.cashAmount || !p.bankAmount) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cashAmount and bankAmount are required for cash_bank payments', path: [...basePath, 'cashAmount'] });
    } else if (Math.abs(p.cashAmount + p.bankAmount - p.amount) > 0.01) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'cashAmount + bankAmount must equal amount', path: [...basePath, 'bankAmount'] });
    }
  }
}

// POST /pending-enrollments — open a pending enrollment with its first deposit.
// `payload` carries the scheme-specific create fields (NO payment fields) — it is
// stored verbatim and replayed through the scheme's create fn at completion.
export const CreatePendingEnrollmentSchema = z.object({
  schemeCode:  z.enum(IN_SCOPE_SCHEMES),
  customerId:  z.string().uuid(),
  referrerId:  z.string().uuid().optional(),
  payload:     z.record(z.string(), z.any()),
  firstPayment: z.object(partPaymentShape),
  branchId:    z.string().uuid().optional(),   // management supplies; branch admin uses JWT
}).superRefine((data, ctx) => refinePartPayment(data.firstPayment, ctx, ['firstPayment']));

// POST /pending-enrollments/:id/payments — add a later part-payment.
export const AddPendingPaymentSchema = z.object({
  ...partPaymentShape,
  branchId: z.string().uuid().optional(),
}).superRefine((data, ctx) => refinePartPayment(data, ctx));

export const ListPendingEnrollmentsQuerySchema = z.object({
  schemeCode: z.enum(IN_SCOPE_SCHEMES).optional(),
  status:     z.enum(['collecting', 'completed', 'cancelled', 'completion_failed']).optional(),
  branchId:   z.string().uuid().optional(),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(200).default(50),
});

export type CreatePendingEnrollmentInput = z.infer<typeof CreatePendingEnrollmentSchema>;
export type AddPendingPaymentInput       = z.infer<typeof AddPendingPaymentSchema>;
export type ListPendingEnrollmentsQuery  = z.infer<typeof ListPendingEnrollmentsQuerySchema>;
