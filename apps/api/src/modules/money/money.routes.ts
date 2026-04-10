import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../../shared/errors';
import { MoneyService } from './money.service';
import {
  CreateProjectSchema,
  SubmitCollectionSchema,
  VerifyCollectionSchema,
  GetCollectionsQuerySchema,
  TransferCashSchema,
  UpdateProjectSchema
} from './money.schema';

const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: error.issues,
      },
    });
  }

  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  console.error('❌ Unexpected error in Money Module:', error);
  return reply.code(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  });
};

const sendForbidden = (reply: FastifyReply, message: string): FastifyReply => {
  return reply.code(403).send({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message,
    },
  });
};

interface AuthenticatedUser {
  id: string;
  role: string;
  branchId: string;
}

interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

export default async function moneyRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── PROJECTS ───

  fastify.post('/projects', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== 'md') {
        return sendForbidden(reply, 'Only MD can create projects');
      }

      const body = CreateProjectSchema.parse(req.body);
      const data = await MoneyService.createProject(fastify.db, body.name);

      return reply.code(201).send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.patch('/projects/:id', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== 'md') {
        return sendForbidden(reply, 'Only MD can update projects');
      }

      const { id } = req.params as { id: string };
      const body = UpdateProjectSchema.parse(req.body);
      const data = await MoneyService.updateProject(fastify.db, id, body);

      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.get('/projects', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { includeInactive } = request.query as { includeInactive?: string };
      const data = await MoneyService.getProjects(fastify.db, includeInactive === 'true');
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── COLLECTIONS ───

  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const body = SubmitCollectionSchema.parse(req.body);
      const data = await MoneyService.submitCollection(fastify.db, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.patch('/:id/verify', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const body = VerifyCollectionSchema.parse(req.body);

      const data = await MoneyService.verifyCollection(
        fastify.db,
        req.user.id,
        req.user.role,
        id,
        body
      );

      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const query = GetCollectionsQuerySchema.parse(req.query);

      const data = await MoneyService.getCollections(
        fastify.db,
        req.user.id,
        req.user.role,
        query
      );

      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /upload-url (S3 URL) ───
  fastify.get('/upload-url', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { contentType = 'image/jpeg', mode = 'gpay' } = req.query as { contentType?: string, mode?: string };
      const result = await MoneyService.getPresignedUploadUrl(req.user.id, mode, contentType);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /photo-url (S3 URL) ───
  fastify.get('/photo-url', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { key } = req.query as { key: string };
      const result = await MoneyService.getPresignedDownloadUrl(key);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── CASH WALLET & TRACKING ───

  fastify.get('/wallet', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const data = await MoneyService.getWallet(fastify.db, req.user.id);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.post('/transfer', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const body = TransferCashSchema.parse(req.body);
      const data = await MoneyService.transferCash(fastify.db, req.user.id, body);
      return reply.code(201).send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.get('/:id/sources', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { id } = req.params as { id: string };
      const data = await MoneyService.getTransferSources(fastify.db, id);
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── ADMIN OVERVIEW (MD / Director / GM / BM / BA only) ───

  fastify.get('/admin/overview', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { stuckDays } = req.query as { stuckDays?: string };
      const data = await MoneyService.getAdminOverview(
        fastify.db,
        req.user.id,
        req.user.role,
        req.user.branchId || null,
        stuckDays ? parseInt(stuckDays, 10) : 3
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  fastify.get('/admin/branch/:branchId', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const { branchId } = req.params as { branchId: string };
      const data = await MoneyService.getBranchDrilldown(
        fastify.db,
        branchId,
        req.user.id,
        req.user.role,
        req.user.branchId || null
      );
      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
