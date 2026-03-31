// src/modules/transactions/transaction.schema.ts
import { z } from 'zod';

export const TransactionCategory = z.enum([
  'expense',
  'advance',
  'reimbursement',
  'collection',
  'other'
]);

export const TransactionStatus = z.enum([
  'pending_acknowledgment',
  'acknowledged',
  'rejected',
  'flagged'
]);

export const CreateTransactionSchema = z.object({
  receiverId: z.string().uuid(),
  amount: z.number().positive(),
  category: TransactionCategory,
  note: z.string().optional()
});

export const UpdateTransactionStatusSchema = z.object({
  status: TransactionStatus,
  note: z.string().optional()
});

export const GetTransactionsQuerySchema = z.object({
  role: z.enum(['sender', 'receiver']).optional(),
  status: TransactionStatus.optional(),
  category: TransactionCategory.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  page: z.coerce.number().min(1).default(1)
});

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;
export type UpdateTransactionStatusInput = z.infer<typeof UpdateTransactionStatusSchema>;
export type GetTransactionsQuery = z.infer<typeof GetTransactionsQuerySchema>;
