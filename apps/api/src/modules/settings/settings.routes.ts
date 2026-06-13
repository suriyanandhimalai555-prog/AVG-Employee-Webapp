// App settings REST surface.
//
//   GET /settings/backdated-entry → any authenticated user (forms read it to
//                                   decide whether past dates are pickable)
//   PUT /settings/backdated-entry → management only (the account that owns
//                                   historical data entry, migration 056)
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role } from '../../shared/role-constants';
import { SettingsService } from './settings.service';
import { UpdateBackdatedEntrySchema } from './settings.schema';

interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

export default async function settingsRoutes(fastify: FastifyInstance): Promise<void> {

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
}
