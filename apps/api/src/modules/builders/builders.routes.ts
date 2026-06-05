import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST } from '../../shared/role-constants';
import { BuildersService } from './builders.service';
import {
  CreateBuildersPlanSchema,
  RecordBuildersPayoutSchema,
  ChooseRewardSchema,
  GetBuildersPlansQuerySchema,
  GetBuildersSummaryQuerySchema,
} from './builders.schema';

interface AuthUser { id: string; role: string; branchId: string; }
// TS-specific: extends FastifyRequest so req.user is typed without casting everywhere
interface AuthRequest extends FastifyRequest { user: AuthUser; }

// O(1) role checks — same pattern as gold/chit route files
const READER_ROLES        = new Set<string>(READER_LIST);
const WRITER_ROLE: string = Role.BRANCH_ADMIN;
// Roles that see only enrollments they personally referred (not the full branch list)
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);

export default async function buildersRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /builders/packages ───
  // Returns the 6 fixed packages so the frontend can build the enrollment form
  // and the packages reference table without a separate data fetch.
  fastify.get('/packages', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const data = BuildersService.getPackages();
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/summary ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = GetBuildersSummaryQuerySchema.parse(req.query);
      const data  = await BuildersService.getBranchSummary(fastify.db, req.user.branchId, undefined, query);
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
      if (req.user.role !== WRITER_ROLE) throw new ForbiddenError('Only Branch Admin can create plans');
      const body = CreateBuildersPlanSchema.parse(req.body);
      const data = await BuildersService.createPlan(fastify.db, req.user.id, req.user.branchId, body);
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
      const data     = await BuildersService.getPlan(fastify.db, id, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /builders/plans/:id/payouts ───
  fastify.get('/plans/:id/payouts', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id } = req.params as { id: string };
      const data   = await BuildersService.getPayouts(fastify.db, id, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /builders/plans/:id/payouts ───
  fastify.post('/plans/:id/payouts', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (req.user.role !== WRITER_ROLE) throw new ForbiddenError('Only Branch Admin can record payouts');
      const { id } = req.params as { id: string };
      const body   = RecordBuildersPayoutSchema.parse(req.body);
      const data   = await BuildersService.recordPayout(fastify.db, req.user.id, id, req.user.branchId, body);
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
      if (req.user.role !== WRITER_ROLE) throw new ForbiddenError('Only Branch Admin can record reward choice');
      const { id } = req.params as { id: string };
      const body   = ChooseRewardSchema.parse(req.body);
      const data   = await BuildersService.chooseReward(fastify.db, req.user.id, id, req.user.branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /builders/plans/:id/complete ───
  // Marks a house-path plan as completed after the house is delivered.
  // Cash-path plans auto-complete when month-60 payout is recorded.
  fastify.patch('/plans/:id/complete', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req    = request as AuthRequest;
      if (req.user.role !== WRITER_ROLE) throw new ForbiddenError('Only Branch Admin can complete plans');
      const { id } = req.params as { id: string };
      const data   = await BuildersService.completePlan(fastify.db, req.user.id, id, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
