import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, SCHEME_WRITER_ROLES, resolveReadBranch, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { ChitService } from './chit.service';
import {
  CreateChitGroupSchema,
  AddChitMemberSchema,
  RecordChitPaymentSchema,
  SelectWinnerSchema,
  CancelMemberSchema,
  GetChitGroupsQuerySchema,
  GetChitSummaryQuerySchema,
  CombineChitGroupsSchema,
  UpdateChitPackageSchema,
  CorrectChitMemberSchema,
  CorrectChitPaymentSchema,
} from './chit.schema';

interface AuthUser { id: string; role: string; branchId: string; isHeadBranch?: boolean; }
interface AuthRequest extends FastifyRequest { user: AuthUser; }

const READER_ROLES      = new Set<string>(READER_LIST);
const WRITER_ROLES      = new Set<string>(SCHEME_WRITER_ROLES);
const CONFIG_ROLES_SET  = new Set<string>([Role.MD, Role.DIRECTOR, 'management']);

// Roles that can view the head-branch console (read-only for MD/Director)
const HEAD_VIEW_ROLES = new Set<string>(['md', 'director', 'branch_admin']);

export default async function chitRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /chit/packages — package reference (any reader) ───
  fastify.get('/packages', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const data = await ChitService.getPackages(fastify.db);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /chit/packages/:number — config roles ───
  fastify.patch('/packages/:number', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!CONFIG_ROLES_SET.has(req.user.role)) throw new ForbiddenError('Access denied');
        const num  = parseInt((req.params as any).number, 10);
        const body = UpdateChitPackageSchema.parse(req.body);
        const data = await ChitService.updatePackage(fastify.db, num, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /chit/summary ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = GetChitSummaryQuerySchema.parse(req.query);
      const data = await ChitService.getBranchSummary(fastify.db, req.user.branchId, undefined, query);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /chit/groups ───
  fastify.get('/groups', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const query = GetChitGroupsQuerySchema.parse(req.query);
      const data = await ChitService.getGroups(fastify.db, req.user.branchId, query);
      return reply.send({ success: true, ...data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups ───
  fastify.post('/groups', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can create groups');
      const body     = CreateChitGroupSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data = await ChitService.createGroup(fastify.db, req.user.id, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // IMPORTANT: the two static sub-paths below MUST be registered before
  // /groups/:groupId — otherwise Fastify treats 'awaiting-combine' and 'combine'
  // as groupId param values. (Same pattern as gold-coin.routes.ts.)
  // ─────────────────────────────────────────────────────────────────────────────

  // ─── GET /chit/groups/awaiting-combine ── head-branch inbox ───
  fastify.get('/groups/awaiting-combine', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!HEAD_VIEW_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const data = await ChitService.listAwaitingCombine(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/combine ── head-branch only ───
  fastify.post('/groups/combine', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can combine groups');
      const body = CombineChitGroupsSchema.parse(req.body);
      // assertHeadBranchAdmin is called inside ChitService.combineGroups
      const data = await ChitService.combineGroups(fastify.db, body, req.user.id);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /chit/groups/:groupId ───
  // Management has no branchId on their JWT; they pass it as ?branchId= query param.
  fastify.get('/groups/:groupId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { groupId } = req.params as { groupId: string };
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      const data = await ChitService.getGroup(fastify.db, groupId, branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /chit/groups/:groupId/eligible-members ───
  fastify.get('/groups/:groupId/eligible-members', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { groupId } = req.params as { groupId: string };
      const data = await ChitService.getEligibleMembers(fastify.db, groupId, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/:groupId/members ───
  fastify.post('/groups/:groupId/members', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can add members');
      const { groupId } = req.params as { groupId: string };
      const body     = AddChitMemberSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data = await ChitService.addMember(fastify.db, req.user.id, groupId, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/:groupId/members/:memberId/payments ───
  fastify.post('/groups/:groupId/members/:memberId/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin or Management can record payments');
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };
      const body     = RecordChitPaymentSchema.parse(req.body);
      const branchId = resolveWriterBranch(req.user.role, req.user.branchId, (body as any).branchId);
      const data = await ChitService.recordPayment(fastify.db, req.user.id, groupId, memberId, branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── GET /chit/groups/:groupId/members/:memberId/payments ───
  // Management has no branchId on their JWT; they pass it as ?branchId= query param.
  fastify.get('/groups/:groupId/members/:memberId/payments', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };
      // TS: resolveReadBranch handles null branchId for md/management via query param
      const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
      const data = await ChitService.getMemberPayments(fastify.db, groupId, memberId, branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/:groupId/winners ───
  fastify.post('/groups/:groupId/winners', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can select winners');
      const { groupId } = req.params as { groupId: string };
      const body = SelectWinnerSchema.parse(req.body);
      const data = await ChitService.selectWinner(fastify.db, req.user.id, groupId, req.user.branchId, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/:groupId/send-to-head ── branch admin (non-head) ───
  fastify.post('/groups/:groupId/send-to-head', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can send groups to head branch');
      const { groupId } = req.params as { groupId: string };
      const data = await ChitService.sendToHeadBranch(fastify.db, groupId, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── POST /chit/groups/:groupId/expire ── head-branch only ───
  fastify.post('/groups/:groupId/expire', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can expire groups');
      const { groupId } = req.params as { groupId: string };
      // assertHeadBranchAdmin is called inside ChitService.expireGroup
      const data = await ChitService.expireGroup(fastify.db, groupId, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /chit/groups/:groupId/members/:memberId/cancel ───
  fastify.patch('/groups/:groupId/members/:memberId/cancel', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can cancel cards');
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };
      const body = CancelMemberSchema.parse(req.body);
      const data = await ChitService.cancelMember(fastify.db, groupId, memberId, req.user.branchId, body);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /chit/groups/:groupId/members/:memberId/reinstate ───
  fastify.patch('/groups/:groupId/members/:memberId/reinstate', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can reinstate cards');
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };
      const data = await ChitService.reinstateMember(fastify.db, groupId, memberId, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /chit/groups/:groupId/members/:memberId/refund ───
  fastify.patch('/groups/:groupId/members/:memberId/refund', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthRequest;
      if (!WRITER_ROLES.has(req.user.role)) throw new ForbiddenError('Only Branch Admin can mark refunds');
      const { groupId, memberId } = req.params as { groupId: string; memberId: string };
      const data = await ChitService.markRefundPaid(fastify.db, groupId, memberId, req.user.branchId);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── PATCH /chit/groups/:groupId/members/:memberId/correct ───
  fastify.patch('/groups/:groupId/members/:memberId/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { groupId, memberId } = req.params as { groupId: string; memberId: string };
        const body = CorrectChitMemberSchema.parse(req.body);
        const rows = await fastify.db.query(
          `SELECT g.branch_id FROM agila_chit_groups g
           JOIN agila_chit_members m ON m.group_id = g.id
           WHERE m.id = $1`,
          [memberId]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (body as any).branchId);
        const data = await ChitService.correctMember(fastify.db, req.user.id, groupId, memberId, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /chit/groups/:groupId/members/:memberId/payments/:paymentId/correct ───
  fastify.patch('/groups/:groupId/members/:memberId/payments/:paymentId/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { groupId, memberId, paymentId } = req.params as { groupId: string; memberId: string; paymentId: string };
        const body = CorrectChitPaymentSchema.parse(req.body);
        const rows = await fastify.db.query(
          `SELECT g.branch_id FROM agila_chit_groups g WHERE g.id = $1`, [groupId]
        );
        if (rows.rows.length === 0) throw new Error('Group not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (body as any).branchId);
        const data = await ChitService.correctPayment(fastify.db, req.user.id, groupId, memberId, paymentId, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /chit/groups/:groupId/members/:memberId/payments/:paymentId/unpay ───
  fastify.patch('/groups/:groupId/members/:memberId/payments/:paymentId/unpay', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { groupId, memberId, paymentId } = req.params as { groupId: string; memberId: string; paymentId: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          `SELECT g.branch_id FROM agila_chit_groups g WHERE g.id = $1`, [groupId]
        );
        if (rows.rows.length === 0) throw new Error('Group not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await ChitService.unpayPayment(fastify.db, req.user.id, groupId, memberId, paymentId, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /chit/groups/:groupId/members/:memberId/void ───
  fastify.patch('/groups/:groupId/members/:memberId/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { groupId, memberId } = req.params as { groupId: string; memberId: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          `SELECT g.branch_id FROM agila_chit_groups g
           JOIN agila_chit_members m ON m.group_id = g.id
           WHERE m.id = $1`,
          [memberId]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await ChitService.voidMember(fastify.db, req.user.id, groupId, memberId, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /chit/groups/:groupId/members/:memberId/delete — permanent delete ───
  fastify.patch('/groups/:groupId/members/:memberId/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertCanManageSchemeData(req.user.role as any);
        const { groupId, memberId } = req.params as { groupId: string; memberId: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          `SELECT g.branch_id FROM agila_chit_groups g
           JOIN agila_chit_members m ON m.group_id = g.id
           WHERE m.id = $1`,
          [memberId]
        );
        if (rows.rows.length === 0) throw new Error('Not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await ChitService.deleteMember(fastify.db, req.user.id, groupId, memberId, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
