// apps/api/src/modules/users/user.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from './user.service';
import { CreateUserSchema, UpdateOversightBranchesSchema } from './user.schema';
import { AppError } from '../../shared/errors';
import { handleError } from '../../shared/route-error-handler';
import { USER_DIRECTORY_ROLES } from '../../shared/role-constants';

type AuthenticatedRequest = FastifyRequest & {
  user: { id: string; role: string; branchId: string | null };
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
        fastify.redis,
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

  // ─── GET /api/users/:id/oversight-branches ───
  // Returns the current oversight branch IDs for a Director or GM. MD only.
  fastify.get('/:id/oversight-branches', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };

      const result = await UserService.getOversightBranches(
        fastify.db,
        req.user.id,
        req.user.role,
        id
      );

      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PATCH /api/users/:id/oversight-branches ───
  // Replaces the full set of oversight branches for a Director or GM. MD only.
  fastify.patch('/:id/oversight-branches', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const payload = UpdateOversightBranchesSchema.parse(req.body);

      const updatedUser = await UserService.updateOversightBranches(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.role,
        id,
        payload
      );

      return reply.send({ success: true, data: updatedUser });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/manager-options?roles=director,gm ───
  // Returns all active users of the given role(s) — used to populate manager dropdowns.
  fastify.get('/manager-options', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { roles } = req.query as { roles?: string };
      if (!roles) {
        throw new AppError('roles query param required', 400, 'MISSING_PARAMS');
      }
      const roleList = roles.split(',').map(r => r.trim()).filter(Boolean);
      const data = await UserService.getManagerOptions(
        fastify.db,
        req.user.id,
        req.user.role,
        roleList
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/superiors ───
  // Lists all the user's ancestors (upper hierarchy) up to the MD
  fastify.get('/superiors', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const data = await UserService.getSuperiors(fastify.db, fastify.redis, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/upload-url ───
  // Gets a presigned URL for profile assets
  fastify.get('/upload-url', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { kind, contentType } = request.query as { kind: 'photo' | 'proof', contentType: string };
      
      if (!kind || !contentType) {
        throw new AppError('Validation Error', 400, 'MISSING_PARAMS');
      }

      const result = await UserService.getPresignedProfileUploadUrl(req.user.id, kind, contentType);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/me/documents ───
  fastify.get('/me/documents', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const data = await UserService.getDocuments(fastify.db, fastify.redis, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── POST /api/users/me/documents ───
  // Registers a new document record after S3 upload
  fastify.post('/me/documents', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { s3Key, fileName, fileType } = request.body as { s3Key: string, fileName: string, fileType?: string };
      
      if (!s3Key || !fileName) {
        throw new AppError('Validation Error', 400, 'MISSING_PARAMS');
      }

      const data = await UserService.addDocument(fastify.db, req.user.id, s3Key, fileName, fileType);
      return reply.code(201).send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── DELETE /api/users/me/documents/:id ───
  fastify.delete('/me/documents/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      
      await UserService.removeDocument(fastify.db, req.user.id, id, req.user.role);
      return reply.send({ success: true });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/:id/documents ───
  // View someone else's documents (MD/GM/Director only)
  fastify.get('/:id/documents', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      
      const allowedRoles = ['md', 'director', 'gm', 'branch_admin'];
      if (!allowedRoles.includes(req.user.role)) {
        throw new AppError('Forbidden', 403, 'ACCESS_DENIED');
      }

      const data = await UserService.getDocuments(fastify.db, fastify.redis, id);
      return reply.send({ success: true, data });
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
      
      // Basic access control — users can only see others if they're high-level staff.
      // TS: readonly RoleValue[] narrows includes() — cast the JWT string to check membership
      if (!USER_DIRECTORY_ROLES.includes(req.user.role as (typeof USER_DIRECTORY_ROLES)[number])) {
        throw new AppError('Forbidden', 403, 'ACCESS_DENIED');
      }

      const q = request.query as any;
      const result = await UserService.listUsers(
        fastify.db,
        fastify.redis,
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

  // ─── GET /api/users/deactivated ───
  // MD only — lists auto-deactivated ABM/SO/OA accounts with absence duration.
  fastify.get('/deactivated', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== 'md') {
        throw new AppError('Forbidden', 403, 'ACCESS_DENIED');
      }
      const data = await UserService.getDeactivatedUsers(fastify.db, fastify.redis);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── POST /api/users/:id/reactivate ───
  // MD only — restores an auto-deactivated account.
  fastify.post('/:id/reactivate', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== 'md') {
        throw new AppError('Forbidden', 403, 'ACCESS_DENIED');
      }
      const { id } = req.params as { id: string };
      const data = await UserService.reactivateUser(fastify.db, fastify.redis, id, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /api/users/:id ───
  // Returns a single user's profile (name, role, branch, avatar).
  // Must be registered last so Fastify's router matches all static-segment routes
  // (/manager-options, /superiors, /deactivated, etc.) before falling through here.
  fastify.get('/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = (request as AuthenticatedRequest).params as { id: string };
      const data = await UserService.getUserById(fastify.db, fastify.redis, id);
      if (!data) {
        throw new AppError('User not found', 404, 'NOT_FOUND');
      }
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
