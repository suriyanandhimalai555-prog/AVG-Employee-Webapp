import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role, READER_ROLES as READER_LIST } from '../../shared/role-constants';
import {
  LandSitesService,
  LandBookingsService,
  LandAuditService,
  LandService,
} from './land.service';
import {
  CreateLandSiteSchema, UpdateLandSiteSchema, ListSitesQuerySchema,
  CreateLandPlotSchema, UpdateLandPlotSchema, ListPlotsQuerySchema,
  CreateLandBookingSchema, RecordAdvanceSchema, RecordFullPaymentSchema,
  CancelBookingSchema, ListBookingsQuerySchema,
  MarkPayoutPaidSchema, ListAuditQuerySchema,
} from './land.schema';

interface AuthUser { id: string; role: string; branchId: string; }
// TS-specific: extend FastifyRequest to type req.user without casting everywhere
interface AuthRequest extends FastifyRequest { user: AuthUser; }

const READER_ROLES = new Set<string>(READER_LIST);
const MD_ROLE: string = Role.MD;
const BRANCH_ADMIN_ROLE: string = Role.BRANCH_ADMIN;

// ─── Role helpers ──────────────────────────────────────────────────────────────

function assertMD(req: AuthRequest): void {
  if (req.user.role !== MD_ROLE) {
    throw new ForbiddenError('Only MD can perform this action');
  }
}

function assertBranchAdmin(req: AuthRequest): string {
  // TS: returns the branchId of the authenticated branch admin
  if (req.user.role !== BRANCH_ADMIN_ROLE) {
    throw new ForbiddenError('Only Branch Admin can perform this action');
  }
  return req.user.branchId;
}

// MD sees all (null branchId), branch_admin sees own branch
function resolveBranchScope(req: AuthRequest): string | null {
  if (req.user.role === MD_ROLE) return null;
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
        const data = await LandService.getBranchSummary(fastify.db, branchId ?? '', undefined);
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
        assertMD(req);
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
        assertMD(req);
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
        assertMD(req);
        const { siteId } = req.params as { siteId: string };
        const body = UpdateLandSiteSchema.parse(req.body);
        const data = await LandSitesService.updateSite(fastify.db, req.user.id, siteId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/sites/:siteId/plots (MD only)
  fastify.post('/sites/:siteId/plots', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertMD(req);
        const { siteId } = req.params as { siteId: string };
        const body = CreateLandPlotSchema.parse(req.body);
        const data = await LandSitesService.createPlot(fastify.db, req.user.id, siteId, body);
        return reply.code(201).send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // ════════════════════════════════════════════════════
  // PLOTS
  // ════════════════════════════════════════════════════

  // GET /land/plots — list available plots (for booking dropdown + admin listing)
  fastify.get('/plots', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        if (!READER_ROLES.has(req.user.role)) throw new ForbiddenError('Access denied');
        const query = ListPlotsQuerySchema.parse(req.query);
        const data  = await LandSitesService.listPlots(fastify.db, null, query);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // PATCH /land/plots/:plotId (MD only)
  fastify.patch('/plots/:plotId', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req = request as AuthRequest;
        assertMD(req);
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
        const data     = await LandBookingsService.listBookings(fastify.db, branchId, query);
        return reply.send({ success: true, ...data });
      } catch (error) { return handleError(error, reply); }
    }
  );

  // POST /land/bookings (branch_admin)
  fastify.post('/bookings', { onRequest: [fastify.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const req      = request as AuthRequest;
        const branchId = assertBranchAdmin(req);
        const body     = CreateLandBookingSchema.parse(req.body);
        const data     = await LandBookingsService.createBooking(fastify.db, req.user.id, branchId, body);
        return reply.code(201).send({ success: true, data });
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
        const branchId = assertBranchAdmin(req);
        const { id }   = req.params as { id: string };
        const body     = RecordAdvanceSchema.parse(req.body);
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
        const branchId = assertBranchAdmin(req);
        const { id }   = req.params as { id: string };
        const body     = RecordFullPaymentSchema.parse(req.body);
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
        const branchId = assertBranchAdmin(req);
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
        const branchId = assertBranchAdmin(req);
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
        const branchId = assertBranchAdmin(req);
        const { id, month } = req.params as { id: string; month: string };
        const monthNum = parseInt(month, 10);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 60) {
          return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Month must be between 1 and 60' } });
        }
        const body = MarkPayoutPaidSchema.parse(req.body);
        const data = await LandBookingsService.markPayoutPaid(fastify.db, req.user.id, id, monthNum, branchId, body);
        return reply.send({ success: true, data });
      } catch (error) { return handleError(error, reply); }
    }
  );
}
