import { z } from 'zod';

export const CreateProjectSchema = z.object({
  name: z.string().min(1).max(255),
});

export const SubmitCollectionSchema = z.object({
  projectId: z.string().uuid(),
  amount: z.number().positive(),
  mode: z.enum(['gpay', 'bank_receipt', 'cash']),
  clientName: z.string().min(1).max(200),
  clientPhone: z.string().min(1).max(20),
  photoKey: z.string().optional(),
  handedOverTo: z.string().uuid().optional(),
}).superRefine((data, ctx) => {
  if (data.mode === 'cash') {
    if (!data.handedOverTo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'handedOverTo is required for cash collections',
        path: ['handedOverTo'],
      });
    }
  } else {
    if (!data.photoKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'photoKey is required for gpay and bank_receipt collections',
        path: ['photoKey'],
      });
    }
  }
});

export const VerifyCollectionSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionNote: z.string().max(1000).optional(),
}).superRefine((data, ctx) => {
  if (data.status === 'rejected' && (!data.rejectionNote || data.rejectionNote.trim() === '')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'rejectionNote is required when rejecting',
      path: ['rejectionNote'],
    });
  }
});

export const GetCollectionsQuerySchema = z.object({
  projectId: z.string().uuid().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export const TransferCashSchema = z.object({
  targetUserId: z.string().uuid(),
  collectionIds: z.array(z.string().uuid()).min(1),
});

export const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

// MD-only manual collection entry — attributed directly to a branch
export const MdCollectionEntrySchema = z.object({
  branchId:        z.string().uuid(),
  projectId:       z.string().uuid(),
  // YYYY-MM-DD; validated further in service (not future, not >1yr past)
  date:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  mode:            z.enum(['gpay', 'bank_receipt', 'cash']),
  amount:          z.number().positive().max(100_000_000, 'Amount too large'),
  notes:           z.string().max(1000).optional(),
  // Client-generated UUID for idempotency — retries with the same key are safe
  idempotencyKey:  z.string().uuid('idempotencyKey must be a UUID'),
});

// Optional date-range filter for branch rankings
export const GetRankingsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export type CreateProjectInput = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectInput = z.infer<typeof UpdateProjectSchema>;
export type SubmitCollectionInput = z.infer<typeof SubmitCollectionSchema>;
export type VerifyCollectionInput = z.infer<typeof VerifyCollectionSchema>;
export type GetCollectionsQuery = z.infer<typeof GetCollectionsQuerySchema>;
export type TransferCashInput = z.infer<typeof TransferCashSchema>;
export type MdCollectionEntryInput = z.infer<typeof MdCollectionEntrySchema>;
export type GetRankingsQuery = z.infer<typeof GetRankingsQuerySchema>;
