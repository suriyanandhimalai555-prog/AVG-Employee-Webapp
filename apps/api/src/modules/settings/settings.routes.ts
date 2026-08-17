// App settings REST surface.
//
//   GET /settings/backdated-entry                    → any authenticated user
//   PUT /settings/backdated-entry                    → management only
//
//   GET /settings/whatsapp-messages                  → any authenticated user
//   PUT /settings/whatsapp-messages                  → management only
//
//   GET /settings/lss-eligibility-bypass             → any authenticated user
//   PUT /settings/lss-eligibility-bypass             → management only
//
//   GET /settings/gold-coin-eligibility-bypass       → any authenticated user
//   PUT /settings/gold-coin-eligibility-bypass       → management only
//
//   GET /settings/daily-collection-reconciliation    → any authenticated user
//   PUT /settings/daily-collection-reconciliation    → management only
//
//   GET /settings/auto-deactivation                  → any authenticated user
//   PUT /settings/auto-deactivation                  → management only
//
// All PUT endpoints enforce Role.MANAGEMENT with a hardcoded check.
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role } from '../../shared/role-constants';
import { SettingsService } from './settings.service';
import {
  UpdateBackdatedEntrySchema,
  UpdateWhatsappMessagesSchema,
  UpdateLssEligibilityBypassSchema,
  UpdateGoldCoinEligibilityBypassSchema,
  UpdateDailyCollectionReconciliationSchema,
  UpdateAutoDeactivationSchema,
} from './settings.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Backdated-entry ─────────────────────────────────────────────────────────

  // GET /settings/backdated-entry — read the flag
  fastify.get('/backdated-entry', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getBackdatedEntry(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/backdated-entry — management toggles backdated entry
  fastify.put('/backdated-entry', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change backdated-entry permission');
      }
      const body = UpdateBackdatedEntrySchema.parse(request.body);
      const data = await SettingsService.setBackdatedEntry(fastify.db, body.enabled, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── WhatsApp messages ───────────────────────────────────────────────────────

  // GET /settings/whatsapp-messages — any authenticated user reads the toggle
  // (e.g. the UI can show a banner when messaging is disabled)
  fastify.get('/whatsapp-messages', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getWhatsappMessages(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/whatsapp-messages — management enables/disables customer messaging
  fastify.put('/whatsapp-messages', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the backdated-entry convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change WhatsApp messaging permission');
      }
      const body = UpdateWhatsappMessagesSchema.parse(request.body);
      const data = await SettingsService.setWhatsappMessages(fastify.db, body.enabled, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── LSS eligibility bypass ──────────────────────────────────────────────────

  // GET /settings/lss-eligibility-bypass — any authenticated user reads the toggle
  fastify.get('/lss-eligibility-bypass', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getLssEligibilityBypass(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/lss-eligibility-bypass — management bypasses the 30-day LSS draw wait
  fastify.put('/lss-eligibility-bypass', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the backdated-entry convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change LSS eligibility bypass');
      }
      const body = UpdateLssEligibilityBypassSchema.parse(request.body);
      const data = await SettingsService.setLssEligibilityBypass(fastify.db, body.enabled, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── Gold-Coin eligibility bypass ────────────────────────────────────────────

  // GET /settings/gold-coin-eligibility-bypass — any authenticated user reads the toggle
  fastify.get('/gold-coin-eligibility-bypass', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getGoldCoinEligibilityBypass(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/gold-coin-eligibility-bypass — management bypasses the 30-day Gold-Coin draw wait
  fastify.put('/gold-coin-eligibility-bypass', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the backdated-entry convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change Gold-Coin eligibility bypass');
      }
      const body = UpdateGoldCoinEligibilityBypassSchema.parse(request.body);
      const data = await SettingsService.setGoldCoinEligibilityBypass(fastify.db, body.enabled, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── Daily Collection Reconciliation ─────────────────────────────────────────

  // GET /settings/daily-collection-reconciliation — any authenticated user reads the toggle
  fastify.get('/daily-collection-reconciliation', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getDailyCollectionReconciliation(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/daily-collection-reconciliation — management enables/disables the workflow
  fastify.put('/daily-collection-reconciliation', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the backdated-entry convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change daily collection reconciliation');
      }
      const body = UpdateDailyCollectionReconciliationSchema.parse(request.body);
      const data = await SettingsService.setDailyCollectionReconciliation(fastify.db, body.enabled, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // ─── Auto-deactivation ───────────────────────────────────────────────────────

  // GET /settings/auto-deactivation — any authenticated user reads switch + threshold
  fastify.get('/auto-deactivation', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await SettingsService.getAutoDeactivation(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /settings/auto-deactivation — management toggles the sweep and sets the threshold
  fastify.put('/auto-deactivation', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the backdated-entry convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can change auto-deactivation settings');
      }
      const body = UpdateAutoDeactivationSchema.parse(request.body);
      const data = await SettingsService.setAutoDeactivation(
        fastify.db,
        body.enabled,
        body.thresholdDays,
        req.user.id
      );
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
