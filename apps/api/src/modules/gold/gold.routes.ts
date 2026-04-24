import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ForbiddenError } from '../../shared/errors';
import { GoldService } from './gold.service';
import {
  AddGoldMemberSchema,
  GetGoldMembersQuerySchema,
  UpdateGoldMemberStatusSchema,
  AddGoldPaymentSchema,
} from './gold.schema';

// Reusable error handler
const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.issues } });
  }
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({ success: false, error: { code: error.code, message: error.message } });
  }
  console.error('❌ Gold module error:', error);
  return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Roles that can read gold scheme data
const READER_ROLES = new Set(['branch_admin', 'branch_manager', 'abm', 'gm', 'director', 'md']);
// Only branch_admin can write
const WRITER_ROLE = 'branch_admin';

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

  // ─── GET /gold/summary — branch stats ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const data = await GoldService.getBranchSummary(fastify.db, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold — list members ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const query = GetGoldMembersQuerySchema.parse(req.query);
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
