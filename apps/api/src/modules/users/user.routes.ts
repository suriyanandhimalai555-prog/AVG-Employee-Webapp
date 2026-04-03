// apps/api/src/modules/users/user.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { UserService } from './user.service';
import { CreateUserSchema } from './user.schema';
import { AppError } from '../../shared/errors';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
};

const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: error.issues },
    });
  }
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message },
    });
  }
  console.error('❌ User route error:', error);
  return reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};

export default async function userRoutes(fastify: FastifyInstance) {

  // ─── POST /api/users ───
  // Restricted to MD for initial rollout
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const payload = CreateUserSchema.parse(request.body);
      
      const newUser = await UserService.createUser(
        fastify.db,
        req.user.id,
        req.user.role,
        req.user.branchId,
        payload
      );
      
      return reply.code(201).send({ success: true, data: newUser });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users ───
  // List all users. Useful for MD's company overview.
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      
      // Basic access control — users can only see others if they're high-level staff
      const allowedRoles = ['md', 'director', 'gm', 'branch_admin'];
      if (!allowedRoles.includes(req.user.role)) {
        throw new AppError('Forbidden', 403, 'ACCESS_DENIED');
      }

      const q = request.query as any;
      const result = await UserService.listUsers(
        fastify.db,
        req.user.id,
        req.user.role,
        req.user.branchId,
        {
          role: q.role || undefined,
          branchId: q.branchId || undefined,
          search: q.search || undefined,
          page: q.page ? parseInt(q.page, 10) : 1,
          limit: q.limit ? parseInt(q.limit, 10) : 50,
        }
      );

      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
