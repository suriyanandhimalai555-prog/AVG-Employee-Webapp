// apps/api/src/modules/branches/branch.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { BranchService } from './branch.service';
import { handleError } from '../../shared/route-error-handler';
import { CreateBranchSchema, UpdateBranchSchema } from './branch.schema';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
};

export default async function branchRoutes(fastify: FastifyInstance) {

  // ─── GET /api/branches ───
  // Open to all authenticated users — needed for dropdowns
  // Aggressively cached in Redis to handle 1500 concurrent users on login
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const branches = await BranchService.listBranches(fastify.db, fastify.redis);
      return reply.send({ success: true, data: branches });
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
