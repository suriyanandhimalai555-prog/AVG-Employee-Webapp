import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { IncentiveService } from './incentives.service';
import { hasRole, INCENTIVE_OVERVIEW_ROLES } from '../../shared/role-constants';
import {
  AddIncentiveSchema,
  GetIncentivesQuerySchema,
  GetWalletQuerySchema,
  SetCommissionRuleSchema,
  DistributeIncentivesSchema,
  BranchRollupQuerySchema,
  BranchPeopleQuerySchema,
} from './incentives.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

const WRITER_ROLES   = new Set(['md', 'director', 'gm', 'branch_manager', 'branch_admin']);
// management added so the Control Center can edit commission rates
const RULE_ADMIN     = new Set(['md', 'director', 'management']);

export default async function incentiveRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /incentives/rules — all commission rules (for schemes page) ───
  fastify.get('/rules', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await IncentiveService.getAllCommissionRules(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/rules/:projectId — rules for one project ───
  fastify.get('/rules/:projectId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const data = await IncentiveService.getCommissionRules(fastify.db, projectId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /incentives/rules — set/update a commission rule ───
  fastify.post('/rules', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!RULE_ADMIN.has(req.user.role)) {
        throw new ForbiddenError('Only MD and Directors can configure commission rates');
      }
      const body = SetCommissionRuleSchema.parse(req.body);
      const data = await IncentiveService.setCommissionRule(fastify.db, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /incentives/distribute — auto-cascade incentives for a deal ───
  // Called internally (or by MD/Director) when a deal is confirmed.
  fastify.post('/distribute', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const body = DistributeIncentivesSchema.parse(req.body);
      const data = await IncentiveService.distributeIncentives(fastify.db, {
        ...body,
        creditedBy: req.user.id,
      });
      return reply.send({ success: true, data, credited: data.length });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/wallet — own wallet summary ───
  fastify.get('/wallet', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') throw new ForbiddenError('Access denied');
      const dateFilter = GetWalletQuerySchema.parse(req.query);
      const data = await IncentiveService.getWallet(fastify.db, req.user.id, req.user.role, undefined, dateFilter);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/wallet/:userId — subordinate's wallet ───
  fastify.get('/wallet/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { userId } = req.params as { userId: string };
      const dateFilter = GetWalletQuerySchema.parse(req.query);
      const data = await IncentiveService.getWallet(fastify.db, req.user.id, req.user.role, userId, dateFilter);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives — own incentive history ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') throw new ForbiddenError('Access denied');
      const query = GetIncentivesQuerySchema.parse(req.query);
      const result = await IncentiveService.getIncentives(fastify.db, req.user.id, req.user.role, query);
      return reply.send({ success: true, ...result });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /incentives — manual credit ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('You do not have permission to credit incentives');
      }
      const body = AddIncentiveSchema.parse(req.body);
      const data = await IncentiveService.addIncentive(fastify.db, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/branch-rollup — Level 1: all branches with incentive totals ───
  // Restricted to MD and Management — they see all branches without further scoping.
  fastify.get('/branch-rollup', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // Gate: only INCENTIVE_OVERVIEW_ROLES (md, management) may access this endpoint.
      if (!hasRole(req.user.role, INCENTIVE_OVERVIEW_ROLES)) {
        throw new ForbiddenError('Access restricted to MD and Management');
      }
      const query = BranchRollupQuerySchema.parse(req.query);
      const data  = await IncentiveService.getBranchIncentiveRollup(fastify.db, query);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/branch-rollup/:branchId/people — Level 2: employees in a branch ───
  fastify.get('/branch-rollup/:branchId/people', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!hasRole(req.user.role, INCENTIVE_OVERVIEW_ROLES)) {
        throw new ForbiddenError('Access restricted to MD and Management');
      }
      const { branchId } = req.params as { branchId: string };
      const query = BranchPeopleQuerySchema.parse(req.query);
      const data  = await IncentiveService.getBranchPeopleIncentives(fastify.db, branchId, query);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /incentives/branch-rollup/:branchId/people/:userId — Level 3: person detail ───
  fastify.get('/branch-rollup/:branchId/people/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!hasRole(req.user.role, INCENTIVE_OVERVIEW_ROLES)) {
        throw new ForbiddenError('Access restricted to MD and Management');
      }
      const { branchId, userId } = req.params as { branchId: string; userId: string };
      const query = BranchRollupQuerySchema.parse(req.query);
      const data  = await IncentiveService.getEmployeeIncentiveDetail(fastify.db, branchId, userId, query);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
