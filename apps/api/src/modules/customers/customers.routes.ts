import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { CustomerService } from './customers.service';
import { CreateCustomerSchema, UpdateCustomerSchema, SearchCustomersQuerySchema } from './customers.schema';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';

interface AuthUser { id: string; role: string; branchId: string; }
interface AuthReq extends FastifyRequest { user: AuthUser; }

// Roles that can search or create customers
const ALLOWED_ROLES = new Set([
  'md', 'director', 'gm', 'branch_manager', 'abm', 'branch_admin', 'oa', 'management',
]);

// Resolve the effective branch for read/write operations.
// management passes branchId as a query/body param; all others derive it from JWT.
async function resolveCustomerBranch(
  db: FastifyInstance['db'],
  req: AuthReq,
  bodyBranchId?: string
): Promise<string | null> {
  if (req.user.role === 'management') return bodyBranchId ?? null;
  if (req.user.role === 'branch_admin')
    return resolveBranchAdminBranchId(db, req.user.id, req.user.branchId);
  return req.user.branchId ?? null; // md/director/gm have branchId = null → all-access
}

export default async function customerRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /customers — search customers for a branch ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const query    = SearchCustomersQuerySchema.parse(req.query);
      // management passes ?branchId=... in the query string
      const branchId = await resolveCustomerBranch(
        fastify.db, req, (req.query as any).branchId
      );

      if (req.user.role === 'management' && !branchId) {
        throw new ForbiddenError('branchId query param is required for management');
      }
      if (!branchId && req.user.role !== 'md') {
        throw new ForbiddenError('No branch associated with your account');
      }

      const result = await CustomerService.search(fastify.db, branchId!, query);
      return reply.send({ success: true, ...result });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /customers — create a new customer ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req  = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const body     = CreateCustomerSchema.parse(req.body);
      // management passes branchId in the request body
      const branchId = await resolveCustomerBranch(
        fastify.db, req, (body as any).branchId
      );

      if (!branchId) throw new ForbiddenError('No branch associated with your account');

      const data = await CustomerService.create(fastify.db, branchId, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /customers/:id — update mutable fields (name, phone, address, notes, has_whatsapp) ───
  // Scoped to caller's branch — same resolution as create/search.
  // Exists primarily so existing customers can be flagged has_whatsapp=true
  // after the column is added (before create time they couldn't set it).
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const branchId = await resolveCustomerBranch(
        fastify.db, req, (req.body as any).branchId
      );
      if (!branchId) throw new ForbiddenError('No branch associated with your account');

      const { id } = req.params as { id: string };
      const body   = UpdateCustomerSchema.parse(req.body);
      const data   = await CustomerService.update(fastify.db, id, branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /customers/:id — single customer with scheme history ───
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req      = request as AuthReq;
      if (!ALLOWED_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');

      const branchId = await resolveCustomerBranch(
        fastify.db, req, (req.query as any).branchId
      );

      const { id } = req.params as { id: string };
      // TS: branchId may be null for MD/management — pass empty string so service falls through to no-filter
      const customer = await CustomerService.getById(fastify.db, id, branchId ?? '');
      const history  = await CustomerService.getSchemeHistory(fastify.db, id);
      return reply.send({ success: true, data: { ...customer, schemeHistory: history } });
    } catch (error) { return handleError(error, reply); }
  });
}
