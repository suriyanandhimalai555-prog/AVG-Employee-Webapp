// Shared route error envelope. Imported by every module so the response shape
// stays in lockstep with what the frontend expects:
//   { success: false, error: { code, message, details? } }
import { FastifyReply } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from './errors';

// Convert any thrown error into the canonical JSON error envelope.
// Use as: `} catch (error) { return handleError(error, reply); }`
export const handleError = (error: unknown, reply: FastifyReply): FastifyReply => {
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
      // include details when present (e.g. existing customer for CUSTOMER_PHONE_EXISTS)
      error: { code: error.code, message: error.message, ...(error.details !== undefined ? { details: error.details } : {}) },
    });
  }

  // Log full unexpected error server-side; surface a generic 500 to the client.
  reply.log.error({ err: error }, 'Unhandled route error');
  return reply.code(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' },
  });
};

// Shortcut for the common 403 case where no specific AppError subclass exists.
export const sendForbidden = (reply: FastifyReply, message: string): FastifyReply => {
  return reply.code(403).send({
    success: false,
    error: { code: 'FORBIDDEN', message },
  });
};
