import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { IncentiveService } from './incentives.service';
import {
  AddIncentiveSchema,
  GetIncentivesQuerySchema,
  SetCommissionRuleSchema,
  DistributeIncentivesSchema,
} from './incentives.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

const WRITER_ROLES   = new Set(['md', 'director', 'gm', 'branch_manager', 'branch_admin']);
const RULE_ADMIN     = new Set(['md', 'director']); // only they can configure commission rates

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
      const data = await IncentiveService.distributeIncentives(
        fastify.db,
        body.dealMakerUserId,
        body.projectId,
        body.sourceDescription,
        req.user.id,
        body.sourceId
      );
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
      const data = await IncentiveService.getWallet(fastify.db, req.user.id, req.user.role);
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
      const data = await IncentiveService.getWallet(fastify.db, req.user.id, req.user.role, userId);
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
}
