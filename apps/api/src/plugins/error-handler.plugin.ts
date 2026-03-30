// src/plugins/error-handler.plugin.ts
import { FastifyInstance, FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
// Import the custom AppError base class used across the application
import { AppError } from '../shared/errors';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ERROR HANDLER PLUGIN IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Use 'fastify-plugin' to ensure the global error handler is registered once at the root
const errorHandlerPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Define a centralized error handler for all routes in the Fastify instance
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // 1. Handle Zod validation errors (invalid request body, query, or params)
    if (error instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          // Include the detailed list of field-level errors from Zod for the frontend
          details: error.issues,
        },
      });
    }

    // 2. Handle Fastify's internal schema validation errors (if used)
    if (error.validation) {
      return reply.code(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
        },
      });
    }

    // 3. Handle custom AppError subclasses (like NotFoundError, UnauthorizedError, etc.)
    // These have 'statusCode' and 'code' properties defined in their constructors
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    // 4. Handle all other unexpected errors (database connection, network, etc.)
    // Log the full error details to the internal logger for debugging using the object-first pattern
    fastify.log.error({ err: error }, '❌ Unexpected error');
    
    // Return a generic 500 error to the client to avoid leaking internal system details
    return reply.code(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
      },
    });
  });

  // Also define a custom 404 handler for any requests that don't match a registered route
  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        // Include the HTTP method and URL for easier triage by the developer
        message: `Route ${request.method} ${request.url} not found`,
      },
    });
  });

  fastify.log.info('✅ Error handler plugin registered successfully');
});

export default errorHandlerPlugin;
