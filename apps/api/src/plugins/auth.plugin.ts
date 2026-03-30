// src/plugins/auth.plugin.ts
import { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { env } from '../config/env';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE OVERRIDE FOR FASTIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Declare shared types for Fastify so that 'request.user' and 'fastify.authenticate' are recognized
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH PLUGIN IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Use 'fastify-plugin' to ensure the 'authenticate' decorator is global (not encapsulated)
const authPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Register the JWT plugin with the validated secret from env
  fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
  });

  // Decorate the fastify instance with an 'authenticate' method
  // This is used as a preHandler hook in routes to enforce authentication
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Verify the JWT token from the Authorization header and attach decoded payload to request.user
      await request.jwtVerify();
    } catch (err) {
      // If verification fails, return a 401 Unauthorized response with a clear message
      reply.code(401).send({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid or expired token. Please log in again.',
        },
      });
    }
  });

  fastify.log.info('✅ Auth plugin registered successfully');
});

export default authPlugin;
