import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST, SCHEME_WRITER_ROLES, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { TradingAcademyService } from './trading-academy.service';
import { AddTradingMemberSchema, GetTradingMembersQuerySchema, GetTradingSummaryQuerySchema, CorrectTradingMemberSchema } from './trading-academy.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

const READER_ROLES = new Set<string>(READER_LIST);
const WRITER_ROLES = new Set<string>(SCHEME_WRITER_ROLES);
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
      const data = await TradingAcademyService.getBranchSummary(fastify.db, req.user.branchId, enrolledBy, dateFilter);
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
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Only Branch Admin or Management can add Trading Academy members');
      }
      const body     = AddTradingMemberSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const result = await TradingAcademyService.addMember(
        fastify.db,
        req.user.id,
        branchId,
        body
      );
      return reply.code(201).send({ success: true, data: result });
    } catch (error) { return handleError(error, reply); }
  });

  // PATCH /trading-academy/:id/correct — MD / Management: correct a member ───
  fastify.patch('/:id/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const body   = CorrectTradingMemberSchema.parse(req.body);
        // Load the member's branch from DB using the known branchId or body branchId
        const rows   = await fastify.db.query(
          `SELECT branch_id FROM trading_academy_members WHERE id = $1`,
          [id]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (body as any).branchId);
        const data = await TradingAcademyService.correctMember(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /trading-academy/:id/void — soft-void a member ───
  fastify.patch('/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          `SELECT branch_id FROM trading_academy_members WHERE id = $1`, [id]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await TradingAcademyService.voidMember(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /trading-academy/:id/delete — permanently delete a member ───
  fastify.patch('/:id/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          `SELECT branch_id FROM trading_academy_members WHERE id = $1`, [id]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await TradingAcademyService.deleteMember(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
