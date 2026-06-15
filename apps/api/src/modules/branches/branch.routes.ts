// apps/api/src/modules/branches/branch.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BranchService } from './branch.service';
import { handleError } from '../../shared/route-error-handler';
import { CreateBranchSchema, UpdateBranchSchema, SetHeadBranchSchema, UpdateBranchLocationSchema } from './branch.schema';
import { ForbiddenError } from '../../shared/errors';
import { Role } from '../../shared/role-constants';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
};

export default async function branchRoutes(fastify: FastifyInstance) {

  // ─── GET /api/branches ───
  // Open to all authenticated users — needed for dropdowns
  // Aggressively cached in Redis to handle 1500 concurrent users on login
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const branches = await BranchService.listBranches(fastify.db, fastify.redis);
      return reply.send({ success: true, data: branches });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PUT /api/branches/head-branch ─── (Management only)
  // Moves the global is_head_branch flag to the chosen branch. Must be registered
  // BEFORE /:id so Fastify does not capture "head-branch" as an id param.
  fastify.put('/head-branch', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // Only the management account can designate the head branch
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can set the head branch');
      }
      const body = SetHeadBranchSchema.parse(request.body);
      const branch = await BranchService.setHeadBranch(fastify.db, fastify.redis, body.branchId);
      return reply.send({ success: true, data: branch });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PUT /api/branches/:id/location ─── (Management only)
  // Sets (or clears) the geofence coordinates for a branch. Gated to Management role
  // only — identical authorization pattern to PUT /head-branch. Registered before
  // /:id so Fastify does not misparse "head-branch" or "location" as an id param.
  fastify.put('/:id/location', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      // TS: only the Management account may configure branch geofences
      if (req.user.role !== Role.MANAGEMENT) {
        throw new ForbiddenError('Only Management can set branch location');
      }
      const { id } = request.params as { id: string };
      const body = UpdateBranchLocationSchema.parse(request.body);
      const branch = await BranchService.setBranchLocation(fastify.db, fastify.redis, id, body);
      return reply.send({ success: true, data: branch });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/branches/:id ───
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const branch = await BranchService.getBranch(fastify.db, fastify.redis, id);
      return reply.send({ success: true, data: branch });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── POST /api/branches ─── (MD only)
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const payload = CreateBranchSchema.parse(request.body);
      const branch = await BranchService.createBranch(
        fastify.db,
        fastify.redis,
        req.user.role,
        req.user.id,
        payload
      );
      return reply.code(201).send({ success: true, data: branch });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── DELETE /api/branches/:id ─── (MD only — soft delete)
  fastify.delete('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      await BranchService.deleteBranch(fastify.db, fastify.redis, req.user.role, id);
      return reply.send({ success: true, data: { message: 'Branch deactivated' } });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PATCH /api/branches/:id ─── (MD only — assign GMs, Admins, update shifts)
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };
      const payload = UpdateBranchSchema.parse(request.body);
      const branch = await BranchService.updateBranch(
        fastify.db,
        fastify.redis,
        req.user.role,
        id,
        payload
      );
      return reply.send({ success: true, data: branch });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
