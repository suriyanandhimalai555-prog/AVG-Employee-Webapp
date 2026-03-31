// apps/api/src/modules/branches/branch.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ZodError } from 'zod';
import { BranchService } from './branch.service';
import { AppError } from '../../shared/errors';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
};

const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof ZodError) {
    return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.issues } });
  }
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({ success: false, error: { code: error.code, message: error.message } });
  }
  console.error('❌ Branch route error:', error);
  return reply.code(500).send({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } });
};

// Zod schemas
const CreateBranchSchema = z.object({
  name:       z.string().min(2).max(200),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  shiftEnd:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  timezone:   z.string().max(50).optional(),
});

const UpdateBranchSchema = z.object({
  name:       z.string().min(2).max(200).optional(),
  gmId:       z.string().uuid().optional().nullable(),
  adminId:    z.string().uuid().optional().nullable(),
  shiftStart: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  shiftEnd:   z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isActive:   z.boolean().optional(),
});

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
