import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST, SCHEME_WRITER_ROLES, resolveReadBranch, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { assertBackdateAllowed } from '../../shared/backdate-guard';
import { assertReconciliationSubmitted } from '../../shared/reconciliation-guard';
import { BuildersService } from './builders.service';
import { BuildersIncentivesService } from './builders-incentives.service';
import {
  CreateBuildersPlanSchema,
  RecordBuildersPayoutSchema,
  ChooseRewardSchema,
  ChangeRewardSchema,
  GetBuildersPlansQuerySchema,
  GetBuildersSummaryQuerySchema,
  UpdateBuildersIncentiveRuleSchema,
  UpdateBuildersPackageSchema,
  CorrectBuildersPlanSchema,
  CorrectBuildersPayoutSchema,
} from './builders.schema';

interface AuthUser { id: string; role: string; branchId: string; }
// TS-specific: extends FastifyRequest so req.user is typed without casting everywhere
interface AuthRequest extends FastifyRequest { user: AuthUser; }

// O(1) role checks — same pattern as gold/chit route files
const READER_ROLES        = new Set<string>(READER_LIST);
const WRITER_ROLES        = new Set<string>(SCHEME_WRITER_ROLES);
// TS: import CONFIG_ROLES here to avoid circular-import issues with the shared module
const CONFIG_ROLES_SET    = new Set<string>([Role.MD, Role.DIRECTOR, 'management']);
// Roles that see only enrollments they personally referred (not the full branch list)
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);

export default async function buildersRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /builders/packages ───
  fastify.get('/packages', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        // TS: now reads from DB (migration 057), falls back to hardcoded object
        const data = await BuildersService.getPackages(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/packages/:number — config roles ───
  fastify.patch('/packages/:number', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!CONFIG_ROLES_SET.has(req.user.role)) throw new ForbiddenError('Access denied');
        const num  = parseInt((req.params as any).number, 10);
        const body = UpdateBuildersPackageSchema.parse(req.body);
        const data = await BuildersService.updatePackage(fastify.db, num, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /builders/summary ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = GetBuildersSummaryQuerySchema.parse(req.query);
      // Referrer-only roles see personal totals (own referrals across all branches)
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data  = await BuildersService.getBranchSummary(fastify.db, req.user.branchId, referrerId, query);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/plans ───
  // Referrer-only roles (Sales Officer, ABM, Branch Manager) see only plans they referred.
  fastify.get('/plans', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req      = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const rawQuery = GetBuildersPlansQuerySchema.parse(req.query);
      // Force referrerId scoping for field staff so they only see their own referrals
      const query = REFERRER_ONLY_ROLES.has(req.user.role)
        ? { ...rawQuery, referrerId: req.user.id }
        : rawQuery;
      const data = await BuildersService.listPlans(fastify.db, req.user.branchId, query);
      return reply.send({ success: true, ...data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /builders/plans ───
  fastify.post('/plans', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req  = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can create plans');
      const body     = CreateBuildersPlanSchema.parse(req.body);
      // Past lump-sum dates require the backdated-entry flag (management exempt)
      await assertBackdateAllowed(fastify.db, req.user.role, [body.lumpSumDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      // Daily collection summary must be submitted before any scheme entry (management exempt)
      await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
      const data = await BuildersService.createPlan(fastify.db, req.user.id, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/plans/:id ───
  fastify.get('/plans/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req      = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id }   = req.params as { id: string };
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      // Referrer roles open their own referrals across branches; admins stay branch-scoped
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data     = await BuildersService.getPlan(fastify.db, id, branchId, referrerId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/plans/:id/payouts ───
  // Management has no branchId on their JWT; they pass it as ?branchId= query param.
  fastify.get('/plans/:id/payouts', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id } = req.params as { id: string };
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      // Referrer roles read payouts for their own cross-branch referrals
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data   = await BuildersService.getPayouts(fastify.db, id, branchId, referrerId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /builders/plans/:id/payouts ───
  fastify.post('/plans/:id/payouts', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can record payouts');
      const { id }   = req.params as { id: string };
      const body     = RecordBuildersPayoutSchema.parse(req.body);
      // Past payout dates require the backdated-entry flag (management exempt)
      await assertBackdateAllowed(fastify.db, req.user.role, [body.payoutDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data   = await BuildersService.recordPayout(fastify.db, req.user.id, id, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /builders/plans/:id/choice ───
  // Records the customer's house-or-cash decision at month 50.
  fastify.patch('/plans/:id/choice', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can record reward choice');
      const { id }   = req.params as { id: string };
      const body     = ChooseRewardSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data   = await BuildersService.chooseReward(fastify.db, req.user.id, id, branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/incentive-rules ───
  // Returns the full tier×role×type matrix. Readable by all authenticated roles
  // (the amounts are not secret; branch staff need them for transparency).
  fastify.get('/incentive-rules', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const data = await BuildersIncentivesService.getRules(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/incentive-rules ───
  // Updates a single cell in the matrix. MD and Management.
  fastify.patch('/incentive-rules', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req  = request as AuthRequest;
        if (req.user.role !== Role.MD && req.user.role !== Role.MANAGEMENT) {
          throw new ForbiddenError('Only MD or Management can update incentive rules');
        }
        const body = UpdateBuildersIncentiveRuleSchema.parse(req.body);
        const data = await BuildersIncentivesService.updateRule(fastify.db, req.user.id, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/complete ───
  // Marks a house-path plan as completed after the house is delivered.
  // Cash-path plans auto-complete when month-60 payout is recorded.
  fastify.patch('/plans/:id/complete', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can complete plans');
      const { id }   = req.params as { id: string };
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (req.body as any)?.branchId);
      const data   = await BuildersService.completePlan(fastify.db, req.user.id, id, branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /builders/plans/:id/change-reward — MD / Management: correct a wrong reward choice ───
  fastify.patch('/plans/:id/change-reward', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const body   = ChangeRewardSchema.parse(req.body);
        const plan   = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? (body as any).branchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, (body as any).branchId);
        const data   = await BuildersService.changeReward(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/correct — MD / Management: correct a plan ───
  fastify.patch('/plans/:id/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const body   = CorrectBuildersPlanSchema.parse(req.body);
        const plan   = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? (body as any).branchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, (body as any).branchId);
        const data = await BuildersService.correctPlan(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/payouts/:payoutId/correct ───
  fastify.patch('/plans/:id/payouts/:payoutId/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id, payoutId } = req.params as { id: string; payoutId: string };
        const body   = CorrectBuildersPayoutSchema.parse(req.body);
        const plan   = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? (body as any).branchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, (body as any).branchId);
        const data = await BuildersService.correctPayout(fastify.db, req.user.id, id, payoutId, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/payouts/:payoutId/unpay — delete payout + claw back incentive ───
  fastify.patch('/plans/:id/payouts/:payoutId/unpay', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id, payoutId } = req.params as { id: string; payoutId: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const plan = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, bodyBranchId);
        const data = await BuildersService.unpayPayout(fastify.db, req.user.id, id, payoutId, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/void — soft-void a plan ───
  fastify.patch('/plans/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const plan = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, bodyBranchId);
        const data = await BuildersService.voidPlan(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /builders/plans/:id/delete — permanently delete a plan + payouts ───
  fastify.patch('/plans/:id/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const plan = await BuildersService.getPlan(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, plan.branch_id, bodyBranchId);
        const data = await BuildersService.deletePlan(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
