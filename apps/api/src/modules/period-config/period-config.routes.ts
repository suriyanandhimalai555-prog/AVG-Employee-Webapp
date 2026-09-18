// Business-month boundary configuration REST surface.
//
//   GET    /period-config        → any authenticated user (frontend needs all overrides)
//   PUT    /period-config        → management only: set custom start/end for one month
//   DELETE /period-config        → management only: reset one month to default 7-to-6
//
// All writes require Role.MANAGEMENT, matching the settings-module convention.

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role } from '../../shared/role-constants';
import { PeriodConfigService } from './period-config.service';
import { SetPeriodSchema, ResetPeriodSchema } from './period-config.schema';

// TS: local interface so we can access req.user without casting on every route.
interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthReq extends FastifyRequest { user: AuthenticatedUser; }

export default async function periodConfigRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /period-config — any authenticated user: returns all active override rows.
  // The frontend loads this once on mount to seed the in-memory override map so that
  // getPeriodForDate/buildPeriod return the correct custom dates without going async.
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const overrides = await PeriodConfigService.listOverrides(fastify.db);
      return reply.send({ success: true, data: overrides });
    } catch (error) { return handleError(error, reply); }
  });

  // PUT /period-config — management only: override a month's start and end dates.
  fastify.put('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      // TS: hardcoded role check mirrors the settings-module convention.
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can configure business-month boundaries');
      }
      const body = SetPeriodSchema.parse(request.body);
      const data = await PeriodConfigService.setPeriod(fastify.db, body, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // DELETE /period-config — management only: restore a month to the default 7-to-6 math.
  // Body carries the month identifier (periodYear + periodMonth) just like PUT.
  fastify.delete('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthReq;
      // TS: hardcoded role check mirrors the settings-module convention.
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can reset business-month boundaries');
      }
      const body = ResetPeriodSchema.parse(request.body);
      await PeriodConfigService.resetPeriod(fastify.db, body, req.user.id);
      return reply.send({ success: true, data: null });
    } catch (error) { return handleError(error, reply); }
  });
}
