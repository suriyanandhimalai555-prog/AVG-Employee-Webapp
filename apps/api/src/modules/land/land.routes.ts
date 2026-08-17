import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST, REFERRER_ONLY_ROLES as REFERRER_LIST, resolveReadBranch, resolveWriterBranch, resolveCorrectionBranch } from '../../shared/role-constants';
import { assertCanManageSchemeData } from '../../shared/permissions';
import { assertBackdateAllowed } from '../../shared/backdate-guard';
import { assertReconciliationSubmitted } from '../../shared/reconciliation-guard';
import {
  LandSitesService,
  LandBookingsService,
  LandAuditService,
  LandService,
} from './land.service';
import { LandIncentivesService } from './land-incentives.service';
import {
  CreateLandSiteSchema, UpdateLandSiteSchema, ListSitesQuerySchema,
  CreateLandLayoutSchema, UpdateLandLayoutSchema,
  CreateLandPlotSchema, UpdateLandPlotSchema, ListPlotsQuerySchema,
  CreateLandBookingSchema, RecordAdvanceSchema, RecordFullPaymentSchema,
  CancelBookingSchema, ListBookingsQuerySchema,
  MarkPayoutPaidSchema, ListAuditQuerySchema,
  CorrectLandBookingSchema,
  UpdateLandCommissionRuleSchema,
} from './land.schema';

interface AuthUser { id: string; role: string; branchId: string; }
// TS-specific: extend FastifyRequest to type req.user without casting everywhere
interface AuthRequest extends FastifyRequest { user: AuthUser; }

const READER_ROLES = new Set<string>(READER_LIST);
// Roles that see only bookings they personally referred (across all branches)
const REFERRER_ONLY_ROLES = new Set<string>(REFERRER_LIST);
const MD_ROLE: string = Role.MD;
const BRANCH_ADMIN_ROLE: string = Role.BRANCH_ADMIN;

// ─── Role helpers ──────────────────────────────────────────────────────────────

// Land scheme configuration (sites, layouts, plots, commission rules) is
// Management-ONLY. MD is the business head and should not do data entry.
// assertCanManageSchemeData covers MD+Management — we narrow it here to
// Management only for land.
function assertConfigRole(req: AuthRequest): void {
  if (req.user.role !== Role.MANAGEMENT) {
    throw new ForbiddenError('Only Management can configure land scheme data (sites, layouts, plots, commissions)');
  }
}

function assertSchemeWriter(req: AuthRequest, bodyBranchId?: string): string {
  // TS: returns the effective branchId for branch_admin or management callers
  return resolveWriterBranch(req.user.role, req.user.branchId, bodyBranchId);
}

// MD and Management see all branches (null branchId = no filter).
// Management has no branchId on their JWT so they must supply one in the query
// when they need scoped data — but for dashboard/list reads we give them all.
function resolveBranchScope(req: AuthRequest): string | null {
  if (req.user.role === MD_ROLE || req.user.role === 'management') return null;
  if (!READER_ROLES.has(req.user.role)) {
    throw new ForbiddenError('Access denied');
  }
  return req.user.branchId;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export default async function landRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── GET /land/summary (SchemeService contract surface) ───
  fastify.get('/summary', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const branchId = req.user.role === MD_ROLE ? null : req.user.branchId;
        // Referrer-only roles see personal totals (own referrals across all branches)
        const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
        const data = await LandService.getBranchSummary(fastify.db, branchId ?? '', referrerId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /land/dashboard ───
  fastify.get('/dashboard', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const branchId = req.user.role === MD_ROLE ? null : req.user.branchId;
        const data = await LandBookingsService.getDashboard(fastify.db, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /land/audit (MD only) ───
  fastify.get('/audit', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const query = ListAuditQuerySchema.parse(req.query);
        const data  = await LandAuditService.getLog(fastify.db, query);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ════════════════════════════════════════════════════
  // SITES
  // ════════════════════════════════════════════════════

  // GET /land/sites
  fastify.get('/sites', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const query = ListSitesQuerySchema.parse(req.query);
        const data  = await LandSitesService.listSites(fastify.db, query);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/sites (MD only)
  fastify.post('/sites', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const body = CreateLandSiteSchema.parse(req.body);
        const data = await LandSitesService.createSite(fastify.db, req.user.id, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /land/sites/:siteId
  fastify.get('/sites/:siteId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const { siteId } = req.params as { siteId: string };
        const data = await LandSitesService.getSite(fastify.db, siteId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/sites/:siteId (MD only)
  fastify.patch('/sites/:siteId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { siteId } = req.params as { siteId: string };
        const body = UpdateLandSiteSchema.parse(req.body);
        const data = await LandSitesService.updateSite(fastify.db, req.user.id, siteId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/sites/:siteId/plots — deprecated in favour of /layouts/:layoutId/plots.
  // Kept for backward compat; requires a layoutId in the body to route correctly.
  fastify.post('/sites/:siteId/plots', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const body = CreateLandPlotSchema.parse(req.body);
        const layoutId = (req.body as any)?.layoutId;
        if (!layoutId) throw new Error('layoutId is required — use POST /land/layouts/:layoutId/plots instead');
        const data = await LandSitesService.createPlot(fastify.db, req.user.id, layoutId, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ════════════════════════════════════════════════════
  // LAYOUTS  (inside a site)
  // ════════════════════════════════════════════════════

  // GET /land/sites/:siteId/layouts — list layouts for a site
  fastify.get('/sites/:siteId/layouts', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const { siteId } = req.params as { siteId: string };
        const site = await LandSitesService.getSite(fastify.db, siteId);
        return reply.send({ success: true, data: site.layouts });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/sites/:siteId/layouts (MD / Management)
  fastify.post('/sites/:siteId/layouts', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { siteId } = req.params as { siteId: string };
        const body = CreateLandLayoutSchema.parse(req.body);
        const data = await LandSitesService.createLayout(fastify.db, req.user.id, siteId, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /land/layouts/:layoutId
  fastify.get('/layouts/:layoutId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const { layoutId } = req.params as { layoutId: string };
        const data = await LandSitesService.getLayout(fastify.db, layoutId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/layouts/:layoutId (MD / Management)
  fastify.patch('/layouts/:layoutId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { layoutId } = req.params as { layoutId: string };
        const body = UpdateLandLayoutSchema.parse(req.body);
        const data = await LandSitesService.updateLayout(fastify.db, req.user.id, layoutId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/layouts/:layoutId/plots (MD / Management — add individual plots to a layout)
  fastify.post('/layouts/:layoutId/plots', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { layoutId } = req.params as { layoutId: string };
        const body = CreateLandPlotSchema.parse(req.body);
        const data = await LandSitesService.createPlot(fastify.db, req.user.id, layoutId, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /land/layouts/:layoutId/commission-rules ───
  fastify.get('/layouts/:layoutId/commission-rules', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const { layoutId } = req.params as { layoutId: string };
        const data = await LandIncentivesService.getRules(fastify.db, layoutId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── PATCH /land/layouts/:layoutId/commission-rules ───
  fastify.patch('/layouts/:layoutId/commission-rules', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { layoutId } = req.params as { layoutId: string };
        const body = UpdateLandCommissionRuleSchema.parse(req.body);
        const data = await LandIncentivesService.updateRule(fastify.db, req.user.id, {
          layoutId,
          role:          body.role,
          spotAmount:    body.spotAmount,
          monthlyAmount: body.monthlyAmount,
          monthlyMonths: body.monthlyMonths ?? null,
        });
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ─── GET /land/employees — branch employees for referrer picker ───
  fastify.get('/employees', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        // TS: resolveReadBranch handles null branchId for md/management via query param
        const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
        // Branch-resident staff PLUS GMs/Directors overseeing this branch (via
        // user_oversight_branches) PLUS the MD (no branch link of their own).
        const result = await fastify.db.query(
          `SELECT DISTINCT u.id, u.name, u.role FROM users u
           WHERE u.is_active = true
             AND (
               (u.branch_id = $1 AND u.role NOT IN ('md', 'client'))
               OR (u.role IN ('gm', 'director')
                   AND EXISTS (SELECT 1 FROM user_oversight_branches uob
                               WHERE uob.user_id = u.id AND uob.branch_id = $1))
               OR u.role = 'md'
             )
           ORDER BY u.name ASC`,
          [branchId]
        );
        return reply.send({ success: true, data: result.rows });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ════════════════════════════════════════════════════
  // PLOTS (direct access — used by booking form)
  // ════════════════════════════════════════════════════

  // GET /land/plots — used by PlotSelect on the booking form.
  // Returns all plots (or filters to one layout via ?layoutId=).
  // Uses ?status=available to show only bookable plots.
  // Readable by all authenticated roles — booking form needs this.
  fastify.get('/plots', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        // layoutId is extracted before Zod parsing (Zod schema only knows status/page/limit)
        const layoutId = (req.query as any)?.layoutId ?? null;
        const query = ListPlotsQuerySchema.parse(req.query);
        const data  = await LandSitesService.listPlots(fastify.db, layoutId, query);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/plots/:plotId — Management only (same assertConfigRole used throughout)
  fastify.patch('/plots/:plotId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { plotId } = req.params as { plotId: string };
        const body = UpdateLandPlotSchema.parse(req.body);
        const data = await LandSitesService.updatePlot(fastify.db, req.user.id, plotId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ════════════════════════════════════════════════════
  // BOOKINGS
  // ════════════════════════════════════════════════════

  // GET /land/bookings
  fastify.get('/bookings', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = resolveBranchScope(req);
        const query    = ListBookingsQuerySchema.parse(req.query);
        // Referrer-only roles see only bookings they referred (across all branches)
        const referrerId = REFERRER_ONLY_ROLES.has(req.user.role) ? req.user.id : undefined;
        const data     = await LandBookingsService.listBookings(fastify.db, branchId, query, referrerId);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/bookings — Branch Admin records a new booking.
  // Management can also create bookings (they must supply branchId in the body
  // via assertSchemeWriter / resolveWriterBranch since their JWT has null branchId).
  // Body includes optional referrerId — when set, spot commission is distributed.
  fastify.post('/bookings', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        // resolveWriterBranch: branch_admin uses own JWT branch; management passes branchId in body
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const body     = CreateLandBookingSchema.parse(req.body);
        // Past booking dates require the backdated-entry flag (management exempt)
        await assertBackdateAllowed(fastify.db, req.user.role, [body.bookingDate]);
        // Daily collection summary must be submitted before any scheme entry (management exempt)
        await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
        const data     = await LandBookingsService.createBooking(fastify.db, req.user.id, branchId, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /land/bookings/ref-availability — per-branch booking ref picker
  // Returns taken refs for the branch and a suggested next numeric ref.
  // Must be registered BEFORE /bookings/:id so Fastify does not swallow it as a param.
  fastify.get('/bookings/ref-availability', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        // TS: resolveReadBranch handles null branchId for md/management via query param
        const branchId = resolveReadBranch(req.user.role, req.user.branchId, (req.query as any)?.branchId);
        const data = await LandBookingsService.getBookingRefAvailability(fastify.db, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /land/bookings/:id
  fastify.get('/bookings/:id', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = resolveBranchScope(req);
        const { id }   = req.params as { id: string };
        const data     = await LandBookingsService.getBooking(fastify.db, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/bookings/:id/advance (branch_admin)
  fastify.post('/bookings/:id/advance', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const { id }   = req.params as { id: string };
        const body     = RecordAdvanceSchema.parse(req.body);
        // Past advance dates require the backdated-entry flag (management exempt)
        await assertBackdateAllowed(fastify.db, req.user.role, [body.advanceDate]);
        // Daily collection summary must be submitted before any scheme entry (management exempt)
        await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
        const data     = await LandBookingsService.recordAdvance(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/bookings/:id/full-payment (branch_admin)
  fastify.post('/bookings/:id/full-payment', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const { id }   = req.params as { id: string };
        const body     = RecordFullPaymentSchema.parse(req.body);
        // Past full-payment dates require the backdated-entry flag (management exempt)
        await assertBackdateAllowed(fastify.db, req.user.role, [body.fullPaymentDate]);
        // Daily collection summary must be submitted before any scheme entry (management exempt)
        await assertReconciliationSubmitted(fastify.db, req.user.role, branchId);
        const data     = await LandBookingsService.recordFullPayment(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/bookings/:id/extend-deadline (branch_admin)
  fastify.post('/bookings/:id/extend-deadline', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const { id }   = req.params as { id: string };
        const data     = await LandBookingsService.extendDeadline(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/cancel (branch_admin)
  fastify.patch('/bookings/:id/cancel', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const { id }   = req.params as { id: string };
        const body     = CancelBookingSchema.parse(req.body);
        const data     = await LandBookingsService.cancelBooking(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // GET /land/bookings/:id/buyback
  fastify.get('/bookings/:id/buyback', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = resolveBranchScope(req);
        const { id }   = req.params as { id: string };
        const data     = await LandBookingsService.getBuybackPayouts(fastify.db, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/buyback/:month (branch_admin)
  fastify.patch('/bookings/:id/buyback/:month', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertSchemeWriter(req, (req.body as any)?.branchId);
        const { id, month } = req.params as { id: string; month: string };
        const monthNum = parseInt(month, 10);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 60) {
          return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Month must be between 1 and 60' } });
        }
        const body = MarkPayoutPaidSchema.parse(req.body);
        // Past paid dates require the backdated-entry flag (management exempt)
        await assertBackdateAllowed(fastify.db, req.user.role, [body.paidDate]);
        const data = await LandBookingsService.markPayoutPaid(fastify.db, req.user.id, id, monthNum, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/correct — MD / Management
  fastify.patch('/bookings/:id/correct', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id } = req.params as { id: string };
        const body = CorrectLandBookingSchema.parse(req.body);
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, (body as any).branchId);
        const data = await LandBookingsService.correctBooking(fastify.db, req.user.id, id, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/buyback/:month/unpay — Management correction:
  // revert a paid buyback month to pending and claw back its commission.
  fastify.patch('/bookings/:id/buyback/:month/unpay', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id, month } = req.params as { id: string; month: string };
        const monthNum = parseInt(month, 10);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 60) {
          return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Month must be between 1 and 60' } });
        }
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await LandBookingsService.unpayBuybackPayout(fastify.db, req.user.id, id, monthNum, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/undo-full-payment — Management correction:
  // delete the buyback schedule and revert the booking to its pre-full-payment state.
  fastify.patch('/bookings/:id/undo-full-payment', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await LandBookingsService.undoFullPayment(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/undo-advance — Management correction:
  // clear the recorded advance and revert the booking to 'booked'.
  fastify.patch('/bookings/:id/undo-advance', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await LandBookingsService.undoAdvance(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/void — MD / Management
  fastify.patch('/bookings/:id/void', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await LandBookingsService.voidBooking(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/bookings/:id/delete — permanently delete a booking + payouts
  fastify.patch('/bookings/:id/delete', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertConfigRole(req);
        const { id } = req.params as { id: string };
        const bodyBranchId = (req.body as any)?.branchId;
        const rows = await fastify.db.query(
          'SELECT branch_id FROM land_bookings WHERE id = $1', [id]
        );
        if (rows.rows.length === 0) throw new Error('Booking not found');
        const branchId = resolveCorrectionBranch(req.user.role, req.user.branchId, rows.rows[0].branch_id, bodyBranchId);
        const data = await LandBookingsService.deleteBooking(fastify.db, req.user.id, id, branchId);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
