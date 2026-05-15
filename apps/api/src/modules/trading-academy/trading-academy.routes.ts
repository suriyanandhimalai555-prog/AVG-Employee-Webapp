import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST } from '../../shared/role-constants';
import { TradingAcademyService } from './trading-academy.service';
import { AddTradingMemberSchema, GetTradingMembersQuerySchema, GetTradingSummaryQuerySchema } from './trading-academy.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

const READER_ROLES = new Set<string>(READER_LIST);
const WRITER_ROLE: string = Role.BRANCH_ADMIN;
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);

export default async function tradingAcademyRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /trading-academy/employees — picker for "enrolled by" dropdown
  fastify.get('/employees', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const data = await TradingAcademyService.getBranchEmployees(fastify.db, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // GET /trading-academy/summary — branch totals (or personal totals for referrer roles)
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      // Referrer roles only see their own stats
      const enrolledBy = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const dateFilter = GetTradingSummaryQuerySchema.parse(req.query);
      const data = await TradingAcademyService.getSummary(fastify.db, req.user.branchId, enrolledBy, dateFilter);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // GET /trading-academy — list members (scoped to own referrals for non-admin roles)
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = GetTradingMembersQuerySchema.parse(req.query);
      // Force referrer-only scope — they must not see other people's referrals
      if (REFERRER_ONLY_ROLES.has(req.user.role)) {
        query.enrolledBy = req.user.id;
      }
      const result = await TradingAcademyService.getMembers(fastify.db, req.user.branchId, query);
      return reply.send({ success: true, ...result });
    } catch (error) { return handleError(error, reply); }
  });

  // POST /trading-academy — add member + auto-distribute incentives
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== WRITER_ROLE) {
        throw new ForbiddenError('Only Branch Admin can add Trading Academy members');
      }
      const body = AddTradingMemberSchema.parse(req.body);
      const result = await TradingAcademyService.addMember(
        fastify.db,
        req.user.id,
        req.user.branchId,
        body
      );
      return reply.code(201).send({ success: true, data: result });
    } catch (error) { return handleError(error, reply); }
  });
}
