// src/modules/attendance/attendance.routes.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
// Import the Zod error class so we can detect validation failures in the catch block
import { ZodError } from 'zod';
// Import the AttendanceService object containing all business logic
import { AttendanceService } from './attendance.service';
// Import Zod schemas for validating incoming request data
import {
  SubmitAttendanceSchema,
  AdminMarkSchema,
  CorrectionSchema,
  GetAttendanceQuerySchema,
  UserHistoryQuerySchema,
} from './attendance.schema';
// Import the base error class to check if errors are our custom app errors
import { AppError } from '../../shared/errors';
// Import the timezone-aware date helper so the summary default date uses IST, not server UTC
import { getCompanyToday } from '../../shared/date';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED ERROR HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Define a reusable function to handle all errors consistently across every route handler
const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
  // Check if the error is a Zod validation error (invalid request body or query params)
  if (error instanceof ZodError) {
    return reply.code(400).send({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        // Include the detailed list of field-level errors from Zod
        details: error.issues,
      },
    });
  }

  // Check if the error is one of our custom AppError subclasses (has statusCode and code)
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  // If the error is unexpected, log it and return a generic 500 response
  console.error('❌ Unexpected error:', error);
  return reply.code(500).send({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong',
    },
  });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED 403 RESPONSE HELPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const sendForbidden = (reply: FastifyReply, message: string): FastifyReply => {
  return reply.code(403).send({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message,
    },
  });
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE DECLARATION FOR request.user
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface AuthenticatedUser {
  id: string;
  role: string;
  branchId: string;
}

interface AuthenticatedRequest extends FastifyRequest {
  user: AuthenticatedUser;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ROUTE REGISTRATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default async function attendanceRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── POST / (Self-mark) ───
  fastify.post('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const body = SubmitAttendanceSchema.parse(req.body);

      // Pass injected 'db' and 'redis' from Fastify instance to the service
      const result = await AttendanceService.submitAttendance(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.role,
        req.user.branchId,
        body
      );

      return reply.code(202).send({
        success: true,
        data: {
          message: 'Attendance submitted. Confirming shortly...',
          jobId: result.jobId,
        },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── POST /admin-mark (Admin mark) ───
  fastify.post('/admin-mark', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const allowedRoles = ['branch_admin', 'md', 'gm'];
      if (!allowedRoles.includes(req.user.role)) {
        return sendForbidden(reply, 'You do not have permission to use this endpoint');
      }

      const payload = AdminMarkSchema.parse(req.body);

      const result = await AttendanceService.adminMark(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.role,
        req.user.branchId,
        payload
      );

      return reply.code(202).send({
        success: true,
        data: {
          message: 'Attendance marked. Confirming shortly...',
          jobId: result.jobId,
        },
      });
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
      if (req.user.role === 'client') {
        return sendForbidden(reply, 'Clients cannot upload attendance photos');
      }

      const result = await AttendanceService.getPresignedUploadUrl(req.user.id);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /photo-url?key=... (S3 Download URL) ───
  // Key is passed as a query param because S3 keys contain slashes which would
  // break path-segment param matching (e.g. attendance/userId/timestamp.jpg).
  fastify.get('/photo-url', {
    onRequest: [fastify.authenticate],
  }, async (request, reply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') {
        return sendForbidden(reply, 'Clients cannot view attendance photos');
      }

      const { key } = req.query as { key?: string };
      if (!key) {
        return reply.code(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'key query param is required' },
        });
      }

      const result = await AttendanceService.getPresignedDownloadUrl(key);
      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET / (List) ───
  fastify.get('/', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') {
        return sendForbidden(reply, 'Clients cannot view attendance records');
      }

      const query = GetAttendanceQuerySchema.parse(req.query);

      const result = await AttendanceService.getAttendanceList(
        fastify.db,
        req.user.id,
        req.user.role,
        req.user.branchId,
        query
      );

      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /employees (Branch employees with today's status) ───
  fastify.get('/employees', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const allowedRoles = ['branch_admin', 'gm', 'md', 'director', 'branch_manager'];
      if (!allowedRoles.includes(req.user.role)) {
        return sendForbidden(reply, 'Only admins can view the employee list');
      }

      const q = req.query as any;
      const result = await AttendanceService.getBranchEmployees(
        fastify.db,
        req.user.id,
        req.user.role,
        req.user.branchId,
        {
          search: q.search || undefined,
          filterBranchId: q.branchId || undefined,
          page: q.page ? parseInt(q.page, 10) : 1,
          limit: q.limit ? parseInt(q.limit, 10) : 50,
        }
      );

      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /summary (Stats) ───
  fastify.get('/summary', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') {
        return sendForbidden(reply, 'Clients cannot view attendance summaries');
      }

      // Default to IST today when the client doesn't pass an explicit date
      const date = (req.query as any).date ?? getCompanyToday();

      const result = await AttendanceService.getAttendanceSummary(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.role,
        req.user.branchId,
        date
      );

      return reply.send({ success: true, data: result });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── GET /:userId/history ───
  fastify.get('/:userId/history', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role === 'client') {
        return sendForbidden(reply, 'Clients cannot view attendance history');
      }

      const { userId } = req.params as { userId: string };
      const query = UserHistoryQuerySchema.parse(req.query);

      const data = await AttendanceService.getUserHistory(
        fastify.db,
        req.user.id,
        userId,
        query
      );

      return reply.send({ success: true, data });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PATCH /:id/correct ───
  fastify.patch('/:id/correct', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      const allowedRoles = ['branch_admin', 'md', 'gm'];
      if (!allowedRoles.includes(req.user.role)) {
        return sendForbidden(reply, 'You do not have permission to correct attendance records');
      }

      const { id } = req.params as { id: string };
      const payload = CorrectionSchema.parse(req.body);

      const result = await AttendanceService.correctAttendance(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.role,
        req.user.branchId,
        id,
        payload
      );

      return reply.send({
        success: true,
        data: { message: 'Attendance corrected successfully' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });

  // ─── PATCH /users/:userId/smartphone (Toggle role-based access) ───
  fastify.patch('/users/:userId/smartphone', {
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const req = request as AuthenticatedRequest;
      if (req.user.role !== 'branch_admin') {
        return sendForbidden(reply, 'Only branch admins can manage smartphone status');
      }

      const { userId } = req.params as { userId: string };
      const { hasSmartphone } = req.body as { hasSmartphone: boolean };

      if (typeof hasSmartphone !== 'boolean') {
        return reply.code(400).send({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'hasSmartphone must be a boolean',
          },
        });
      }

      const result = await AttendanceService.updateSmartphoneStatus(
        fastify.db,
        fastify.redis,
        req.user.id,
        req.user.branchId,
        userId,
        hasSmartphone
      );

      return reply.send({
        success: true,
        data: { message: 'Smartphone status updated' },
      });
    } catch (error) {
      return handleError(error, reply);
    }
  });
}
