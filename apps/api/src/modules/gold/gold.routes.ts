import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST, hasRole } from '../../shared/role-constants';
import { GoldService } from './gold.service';
import {
  AddGoldMemberSchema,
  GetGoldMembersQuerySchema,
  UpdateGoldMemberStatusSchema,
  AddGoldPaymentSchema,
} from './gold.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Local Set wrappers around shared constants for O(1) membership checks
const READER_ROLES = new Set<string>(READER_LIST);
const WRITER_ROLE: string = Role.BRANCH_ADMIN;
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);

export default async function goldRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /gold/employees — branch employees list for referrer picker ───
  fastify.get('/employees', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const data = await GoldService.getBranchEmployees(fastify.db, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold/summary — branch stats (personal stats for referrer roles) ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data = await GoldService.getBranchSummary(fastify.db, req.user.branchId, referrerId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold — list members (own referrals only for non-admin roles) ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const query = GetGoldMembersQuerySchema.parse(req.query);
      // Force referrer-only scope for non-admin roles
      if (REFERRER_ONLY_ROLES.has(req.user.role)) {
        query.referrerId = req.user.id;
      }
      const data = await GoldService.getMembers(fastify.db, req.user.branchId, query);
      return reply.send({ success: true, ...data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /gold — add member ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== WRITER_ROLE) {
        throw new ForbiddenError('Only Branch Admin can add gold scheme members');
      }
      const body = AddGoldMemberSchema.parse(req.body);
      const data = await GoldService.addMember(fastify.db, req.user.id, req.user.branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold/:id — single member ───
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const { id } = req.params as { id: string };
      const data = await GoldService.getMember(fastify.db, id, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold/:id/payments — list payments for a member ───
  fastify.get('/:id/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id } = req.params as { id: string };
      const data = await GoldService.getPayments(fastify.db, id, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /gold/:id/payments — record a monthly payment ───
  fastify.post('/:id/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== WRITER_ROLE) throw new ForbiddenError('Only Branch Admin can record payments');
      const { id } = req.params as { id: string };
      const body = AddGoldPaymentSchema.parse(req.body);
      const data = await GoldService.addPayment(fastify.db, id, req.user.branchId, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/status — update member status ───
  fastify.patch('/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== WRITER_ROLE) {
        throw new ForbiddenError('Only Branch Admin can update member status');
      }
      const { id } = req.params as { id: string };
      const body = UpdateGoldMemberStatusSchema.parse(req.body);
      const data = await GoldService.updateStatus(fastify.db, id, req.user.branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
