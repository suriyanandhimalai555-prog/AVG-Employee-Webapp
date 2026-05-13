import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { CustomerService } from './customers.service';
import { CreateCustomerSchema, SearchCustomersQuerySchema } from './customers.schema';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';

interface AuthUser { id: string; role: string; branchId: string; }
interface AuthReq extends FastifyRequest { user: AuthUser; }

// Roles that can search or create customers
const ALLOWED_ROLES = new Set(['md', 'director', 'gm', 'branch_manager', 'abm', 'branch_admin', 'oa']);

export default async function customerRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /customers — search customers for this branch ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const branchId = req.user.role === 'branch_admin'
        ? await resolveBranchAdminBranchId(fastify.db, req.user.id, req.user.branchId)
        : req.user.branchId;

      if (!branchId) throw new ForbiddenError('No branch associated with your account');

      const query = SearchCustomersQuerySchema.parse(req.query);
      const result = await CustomerService.search(fastify.db, branchId, query);
      return reply.send({ success: true, ...result });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /customers — create a new customer ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const branchId = req.user.role === 'branch_admin'
        ? await resolveBranchAdminBranchId(fastify.db, req.user.id, req.user.branchId)
        : req.user.branchId;

      if (!branchId) throw new ForbiddenError('No branch associated with your account');

      const body = CreateCustomerSchema.parse(req.body);
      const data = await CustomerService.create(fastify.db, branchId, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /customers/:id — single customer with scheme history ───
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const branchId = req.user.role === 'branch_admin'
        ? await resolveBranchAdminBranchId(fastify.db, req.user.id, req.user.branchId)
        : req.user.branchId;

      const { id } = req.params as { id: string };
      const customer = await CustomerService.getById(fastify.db, id, branchId!);
      const history  = await CustomerService.getSchemeHistory(fastify.db, id);
      return reply.send({ success: true, data: { ...customer, schemeHistory: history } });
    } catch (error) { return handleError(error, reply); }
  });
}
