import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST, SCHEME_WRITER_ROLES, hasRole, resolveReadBranch, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { assertBackdateAllowed } from '../../shared/backdate-guard';
import { assertReconciliationSubmitted } from '../../shared/reconciliation-guard';
import { GoldService } from './gold.service';
import {
  AddGoldMemberSchema,
  GetGoldMembersQuerySchema,
  GetGoldSummaryQuerySchema,
  UpdateGoldMemberStatusSchema,
  AddGoldPaymentSchema,
  CorrectGoldMemberSchema,
  CorrectGoldPaymentSchema,
} from './gold.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// Local Set wrappers around shared constants for O(1) membership checks
const READER_ROLES = new Set<string>(READER_LIST);
const WRITER_ROLES = new Set<string>(SCHEME_WRITER_ROLES);
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);

export default async function goldRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /gold/employees — branch employees list for referrer picker ───
  // MD/Management pass ?branchId to scope to the branch being corrected.
  fastify.get('/employees', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Access denied');
      }
      const { branchId: queryBranchId } = req.query as { branchId?: string };
      // Query param takes priority over JWT branchId so the corrections center can always
      // override to the branch being edited — even when the management account has its own branchId.
      const effectiveBranchId = queryBranchId || req.user.branchId;
      if (!effectiveBranchId) return reply.send({ success: true, data: [] });
      const data = await GoldService.getBranchEmployees(fastify.db, effectiveBranchId);
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
      const dateFilter = GetGoldSummaryQuerySchema.parse(req.query);
      const data = await GoldService.getBranchSummary(fastify.db, req.user.branchId, referrerId, dateFilter);
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
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Only Branch Admin or Management can add gold scheme members');
      }
      const body     = AddGoldMemberSchema.parse(req.body);
      // Past start dates require the backdated-entry flag (management exempt)
      await assertBackdateAllowed(fastify.db, req.user.role, [body.startDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      // Daily collection summary must be submitted before any scheme entry (management exempt)
      await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
      const data = await GoldService.addMember(fastify.db, req.user.id, branchId, body);
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
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      // Referrer roles open their own referrals across branches; admins stay branch-scoped
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data = await GoldService.getMember(fastify.db, id, branchId, referrerId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /gold/:id/payments — list payments for a member ───
  // Management has no branchId on their JWT; they pass it as ?branchId= query param.
  fastify.get('/:id/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { id } = req.params as { id: string };
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      // Referrer roles read payments for their own cross-branch referrals
      const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
      const data = await GoldService.getPayments(fastify.db, id, branchId, referrerId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /gold/:id/payments — record a monthly payment ───
  fastify.post('/:id/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can record payments');
      const { id } = req.params as { id: string };
      const body     = AddGoldPaymentSchema.parse(req.body);
      // Past paid dates require the backdated-entry flag (management exempt)
      await assertBackdateAllowed(fastify.db, req.user.role, [body.paidDate]);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      // Daily collection summary must be submitted before any scheme entry (management exempt)
      await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
      const data = await GoldService.addPayment(fastify.db, id, branchId, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/status — update member status ───
  fastify.patch('/:id/status', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (!WRITER_ROLES.has(req.user.role)) {
        throw new ForbiddenError('Only Branch Admin or Management can update member status');
      }
      const { id }   = req.params as { id: string };
      const body     = UpdateGoldMemberStatusSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data = await GoldService.updateStatus(fastify.db, id, branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/correct — MD / Management: correct a member record ───
  fastify.patch('/:id/correct', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: assertCanManageSchemeData throws 403 for any role other than md/management
      assertCanManageSchemeData(req.user.role as any);
      const { id } = req.params as { id: string };
      const body   = CorrectGoldMemberSchema.parse(req.body);
      // Load the record's branch from DB via the service (branchId comes from the record)
      const member = await GoldService.getMember(fastify.db, id, req.user.branchId ?? (body as any).branchId ?? '');
      const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, member.branch_id, (body as any).branchId);
      const data = await GoldService.correctMember(fastify.db, req.user.id, id, branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/payments/:paymentId/correct — correct a payment ───
  fastify.patch('/:id/payments/:paymentId/correct', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      assertCanManageSchemeData(req.user.role as any);
      const { id, paymentId } = req.params as { id: string; paymentId: string };
      const body = CorrectGoldPaymentSchema.parse(req.body);
      // Resolve the branch from the member record
      const member = await GoldService.getMember(fastify.db, id, req.user.branchId ?? (body as any).branchId ?? '');
      const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, member.branch_id, (body as any).branchId);
      const data = await GoldService.correctPayment(fastify.db, req.user.id, id, paymentId, branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/payments/:paymentId/unpay — delete payment + claw back incentive ───
  fastify.patch('/:id/payments/:paymentId/unpay', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      assertCanManageSchemeData(req.user.role as any);
      const { id, paymentId } = req.params as { id: string; paymentId: string };
      const bodyBranchId = (req.body as any)?.branchId;
      const member = await GoldService.getMember(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
      const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, member.branch_id, bodyBranchId);
      const data = await GoldService.unpayPayment(fastify.db, req.user.id, id, paymentId, branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /gold/:id/void — soft-void a member (and clawback incentives) ───
  fastify.patch('/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const member = await GoldService.getMember(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, member.branch_id, bodyBranchId);
        const data = await GoldService.voidMember(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /gold/:id/delete — permanently delete a member + payments ───
  fastify.patch('/:id/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const member = await GoldService.getMember(fastify.db, id, req.user.branchId ?? bodyBranchId ?? '');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, member.branch_id, bodyBranchId);
        const data = await GoldService.deleteMember(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
