import { z } from 'zod';

export const AddIncentiveSchema = z.object({
  userId:            z.string().uuid(),
  amount:            z.number().positive().max(10_000_000),
  sourceType:        z.enum(['collection', 'gold_scheme', 'direct_cash', 'scheme', 'other']),
  sourceId:          z.string().uuid().optional(),
  sourceDescription: z.string().max(500).optional(),
  notes:             z.string().max(1000).optional(),
});

export const GetIncentivesQuerySchema = z.object({
  userId:     z.string().uuid().optional(),
  sourceType: z.enum(['collection', 'gold_scheme', 'direct_cash', 'scheme', 'other']).optional(),
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  page:       z.coerce.number().min(1).default(1),
  limit:      z.coerce.number().min(1).max(200).default(50),
});

// Schema for wallet query params (date filtering)
export const GetWalletQuerySchema = z.object({
  startDate:  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  endDate:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
});

// Roles that can earn commissions (MD and Director excluded)
const EARNER_ROLES = ['sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin'] as const;

export const SetCommissionRuleSchema = z.object({
  projectId: z.string().uuid(),
  role:      z.enum(EARNER_ROLES),
  amount:    z.number().nonnegative().max(1_000_000),
});

export const DistributeIncentivesSchema = z.object({
  dealMakerUserId:   z.string().uuid(),
  projectId:         z.string().uuid(),
  sourceDescription: z.string().max(500),
  sourceId:          z.string().uuid().optional(),
  // creditedBy is injected from request.user.id in the route, not from the body
});

export type AddIncentiveInput          = z.infer<typeof AddIncentiveSchema>;
export type GetIncentivesQuery         = z.infer<typeof GetIncentivesQuerySchema>;
export type GetWalletQuery             = z.infer<typeof GetWalletQuerySchema>;
export type SetCommissionRuleInput     = z.infer<typeof SetCommissionRuleSchema>;
export type DistributeIncentivesInput  = z.infer<typeof DistributeIncentivesSchema>;
