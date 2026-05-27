import { z } from 'zod';

// source_type values now match the DB CHECK in migration 028:
//   'collection', 'scheme', 'direct_cash', 'other'.
// 'gold_scheme' was folded into 'scheme' by the migration; queries filter
// gold-specific data with scheme_code='gold_scheme' instead.
const SOURCE_TYPES = ['collection', 'scheme', 'direct_cash', 'other'] as const;

export const AddIncentiveSchema = z.object({
  userId:            z.string().uuid(),
  amount:            z.number().positive().max(10_000_000),
  sourceType:        z.enum(SOURCE_TYPES),
  sourceId:          z.string().uuid().optional(),
  sourceDescription: z.string().max(500).optional(),
  notes:             z.string().max(1000).optional(),
});

export const GetIncentivesQuerySchema = z.object({
  userId:     z.string().uuid().optional(),
  sourceType: z.enum(SOURCE_TYPES).optional(),
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
  schemeCode:        z.string().min(1).max(50),
  dealMakerUserId:   z.string().uuid(),
  mode:              z.enum(['fixed_chain', 'percent_referrer']),
  sourceDescription: z.string().max(500),
  sourceId:          z.string().uuid().optional(),
  paymentEvent:      z.enum(['enrollment', 'renewal']).optional(),
  baseAmount:        z.number().positive().max(10_000_000).optional(),
  percentRole:       z.string().min(1).max(50).optional(),
  // creditedBy is injected from request.user.id in the route, not from the body
});

export type AddIncentiveInput          = z.infer<typeof AddIncentiveSchema>;
export type GetIncentivesQuery         = z.infer<typeof GetIncentivesQuerySchema>;
export type GetWalletQuery             = z.infer<typeof GetWalletQuerySchema>;
export type SetCommissionRuleInput     = z.infer<typeof SetCommissionRuleSchema>;
export type DistributeIncentivesInput  = z.infer<typeof DistributeIncentivesSchema>;
