import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import {
  READER_ROLES as READER_LIST,
  SCHEME_WRITER_ROLES,
  resolveReadBranch,
  resolveWriterBranch,
} from '../../shared/role-constants';
import { assertBackdateAllowed } from '../../shared/backdate-guard';
import { PendingEnrollmentsService } from './pending-enrollments.service';
import {
  CreatePendingEnrollmentSchema,
  AddPendingPaymentSchema,
  ListPendingEnrollmentsQuerySchema,
} from './pending-enrollments.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

const READER_ROLES = new Set<string>(READER_LIST);
const WRITER_ROLES = new Set<string>(SCHEME_WRITER_ROLES);

export default async function pendingEnrollmentRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST / — open a pending enrollment with its first deposit ───
  fastify.post('/', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can open a pending enrollment');
      const body = CreatePendingEnrollmentSchema.parse(req.body);
      // The deposit's date obeys the management backdate flag (same as every scheme write path)
      await assertBackdateAllowed(fastify.db, req.user.role, [body.firstPayment.paidDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, body.branchId);
      const data = await PendingEnrollmentsService.createPending(fastify.db, req.user.id, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /:id/payments — add a later part-payment ───
  fastify.post('/:id/payments', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can record payments');
      const { id } = req.params as { id: string };
      const body = AddPendingPaymentSchema.parse(req.body);
      await assertBackdateAllowed(fastify.db, req.user.role, [body.paidDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, body.branchId);
      const data = await PendingEnrollmentsService.addPayment(fastify.db, req.user.id, branchId, id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /:id/cancel — abandon a pending enrollment ───
  fastify.post('/:id/cancel', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can cancel a pending enrollment');
      const { id } = req.params as { id: string };
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (req.body as any)?.branchId);
      const data = await PendingEnrollmentsService.cancel(fastify.db, branchId, id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /:id/retry — retry a failed completion ───
  fastify.post('/:id/retry', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can retry completion');
      const { id } = req.params as { id: string };
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (req.body as any)?.branchId);
      const data = await PendingEnrollmentsService.retry(fastify.db, req.user.id, branchId, id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET / — list pending enrollments for a branch ───
  fastify.get('/', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = ListPendingEnrollmentsQuerySchema.parse(req.query);
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, query.branchId);
      const data = await PendingEnrollmentsService.list(fastify.db, branchId, query);
      return reply.send({ success: true, ...data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /:id — single pending enrollment + its ledger ───
  fastify.get('/:id', { onRequest: [fastify.authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id } = req.params as { id: string };
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      const data = await PendingEnrollmentsService.get(fastify.db, branchId, id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
