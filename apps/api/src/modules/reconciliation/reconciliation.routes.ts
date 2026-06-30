// Daily collection reconciliation REST surface.
//
//   POST /reconciliation/summary              — branch admin declares today's expected amounts
//   PUT  /reconciliation/summary/:id          — management edits a locked day
//   GET  /reconciliation/summary/today        — check if today's summary is submitted
//   GET  /reconciliation/branch/:branchId     — live reconciliation panel (branch + date)
//   GET  /reconciliation/overview             — management dashboard (all branches)
//
// IMPORTANT: /summary/today must be registered before /summary/:id so Fastify
// does not interpret the string "today" as an :id param.

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, SCHEME_WRITER_ROLES, resolveWriterBranch } from '../../shared/role-constants';
import { ReconciliationService } from './reconciliation.service';
// TS: IST-aware "today" — avoids returning wrong date for 5.5 h every day on UTC servers
import { getCompanyToday } from '../../shared/date';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

// TS: set literals for fast O(1) role checks
const VIEWER_ROLES = new Set(['md', 'director', 'management']);
const WRITER_ROLES = new Set<string>(SCHEME_WRITER_ROLES);

const SummaryLineSchema = z.object({
  schemeCode:     z.string().min(1),
  // TS: allow omitting expectedAmount — treated as 0 (blank line = 0 expected)
  expectedAmount: z.number().min(0).default(0),
});

const SubmitSummarySchema = z.object({
  // Management must supply branchId in body (no branchId on their JWT).
  // Branch Admin ignores this field — taken from JWT.
  branchId: z.string().uuid().optional(),
  lines:    z.array(SummaryLineSchema),
});

const UpdateSummarySchema = z.object({
  branchId: z.string().uuid().optional(),
  lines:    z.array(SummaryLineSchema).min(1),
});

export default async function reconciliationRoutes(fastify: FastifyInstance): Promise<void> {

  // POST /reconciliation/summary — branch admin declares today's expected amounts
  fastify.post('/summary', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!WRITER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Only Branch Admin or Management can submit a collection summary');
        }
        const body     = SubmitSummarySchema.parse(request.body);
        const branchId = resolveWriterBranch(req.user.role, req.user.branchId, body.branchId);
        const data     = await ReconciliationService.submitSummary(fastify.db, {
          branchId,
          userId: req.user.id,
          lines:  body.lines,
        });
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /reconciliation/summary/today — check if today's summary has been submitted
  // MUST be registered before /summary/:id to avoid "today" being treated as :id
  fastify.get('/summary/today', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!WRITER_ROLES.has(req.user.role) && !VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        // Branch admin reads their own branch; viewers may pass ?branchId=
        const queryBranchId = (request.query as any)?.branchId;
        const branchId = req.user.role === Role.BRANCH_ADMIN
          ? req.user.branchId
          : (queryBranchId ?? req.user.branchId);
        const businessDate = getCompanyToday();
        const data = await ReconciliationService.getTodaySummary(fastify.db, branchId, businessDate);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PUT /reconciliation/summary/:id — management edits a locked day's expected amounts
  fastify.put('/summary/:id', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        // TS: hardcoded role check — only management may edit a submitted summary
        if (req.user.role !== Role.MANAGEMENT) {
          throw new ForbiddenError('Only Management can edit a submitted collection summary');
        }
        const { id }   = request.params as { id: string };
        const body     = UpdateSummarySchema.parse(request.body);
        const branchId = resolveWriterBranch(req.user.role, req.user.branchId, body.branchId);
        await ReconciliationService.updateSummary(fastify.db, {
          summaryId: id,
          branchId,
          userId:    req.user.id,
          lines:     body.lines,
        });
        return reply.send({ success: true, data: { updated: true } });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /reconciliation/branch/:branchId?businessDate=YYYY-MM-DD — live panel
  fastify.get('/branch/:branchId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        const { branchId } = request.params as { branchId: string };
        // TS: branch admins may only see their own branch; viewers see any
        if (req.user.role === Role.BRANCH_ADMIN && req.user.branchId !== branchId) {
          throw new ForbiddenError('Branch Admins can only view their own branch');
        }
        if (!WRITER_ROLES.has(req.user.role) && !VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Access denied');
        }
        const businessDate = (request.query as any)?.businessDate ?? getCompanyToday();
        const data = await ReconciliationService.getBranchReconciliation(fastify.db, branchId, businessDate);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /reconciliation/overview?businessDate=YYYY-MM-DD — management dashboard
  fastify.get('/overview', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthenticatedRequest;
        if (!VIEWER_ROLES.has(req.user.role)) {
          throw new ForbiddenError('Only MD, Director, or Management can view the reconciliation overview');
        }
        const businessDate = (request.query as any)?.businessDate ?? getCompanyToday();
        const data = await ReconciliationService.getManagementOverview(fastify.db, businessDate);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
