import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { SalaryService } from './salaries.service';
import { SetSalarySchema, SetSalaryByRoleSchema, GetSalaryHistoryQuerySchema } from './salaries.schema';

// TS: AuthenticatedUser is the shape JWT middleware attaches to request.user
interface AuthenticatedUser { id: string; role: string; branchId: string; }
// TS: Extend FastifyRequest so TypeScript knows about the user property
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Only Management can assign or change salaries
// TS: Set<string> used for O(1) role lookup in the write gate
const WRITER_ROLES = new Set(['management']);

export default async function salaryRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /salaries/me — own current salary ───────────────────────────────
  fastify.get('/me', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') throw new ForbiddenError('Access denied');
      const data = await SalaryService.getCurrentSalary(fastify.db, req.user.id, req.user.role);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /salaries/:userId — current salary of a subordinate ─────────────
  fastify.get('/:userId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { userId } = req.params as { userId: string };
      const data = await SalaryService.getCurrentSalary(fastify.db, req.user.id, req.user.role, userId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /salaries/:userId/history — salary history ──────────────────────
  fastify.get('/:userId/history', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { userId } = req.params as { userId: string };
      const query = GetSalaryHistoryQuerySchema.parse(req.query);
      const result = await SalaryService.getSalaryHistory(fastify.db, req.user.id, req.user.role, userId, query);
      return reply.send({ success: true, ...result });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /salaries — assign a new salary to one employee ────────────────
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Only Management can assign salaries');
      }
      const body = SetSalarySchema.parse(req.body);
      const data = await SalaryService.setSalary(fastify.db, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /salaries/by-role — set a common salary org-wide by role ────────
  fastify.post('/by-role', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Only Management can assign salaries');
      }
      const body = SetSalaryByRoleSchema.parse(req.body);
      const data = await SalaryService.setSalaryByRole(fastify.db, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
