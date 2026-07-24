// Mobile app version gate API.
//
//   GET  /app-version   → public (no JWT) — native app checks on every launch
//   PATCH /app-version  → management only — update version strings / force-update flag
//
// GET is intentionally unauthenticated so the native app can check the required
// minimum version before (and as a gate for) the login flow. If authentication
// is desired later, add `onRequest: [fastify.authenticate]` to the GET handler.
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { Role } from '../../shared/role-constants';
import { AppVersionService } from './app-version.service';
import { AppVersionPatchSchema } from './app-version.schema';

// TS: narrowed request type that carries the decoded JWT user after authenticate
interface AuthenticatedUser { id: string; role: string; branchId: string; }
interface AuthenticatedRequest extends FastifyRequest { user: AuthenticatedUser; }

export default async function appVersionRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /app-version — public, no JWT required.
  // Returns the current version config so the native app can compare its own
  // version and decide whether to force-update before allowing login.
  fastify.get('/', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await AppVersionService.getConfig(fastify.db);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });

  // PATCH /app-version — management only, partial-merge update.
  // Accepts any subset of version fields; omitted fields keep their current value
  // (COALESCE in the upsert). Unknown extra fields (id, createdAt, etc. from the
  // external team's reference payload) are silently stripped by Zod.
  fastify.patch('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: hardcoded role check — mirrors the settings module convention
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can update the mobile app version config');
      }
      const patch = AppVersionPatchSchema.parse(request.body);
      const data  = await AppVersionService.updateConfig(fastify.db, patch, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) { return handleError(error, reply); }
  });
}
