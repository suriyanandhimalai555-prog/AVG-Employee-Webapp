// src/modules/auth/auth.routes.ts
import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
// Import the core business logic from the AuthService
import { AuthService } from './auth.service';
// Import the validation schema for handling login input
import { LoginSchema } from './auth.schema';
// Import the validated environment config for token signing
import { env } from '../../config/env';
// Import the Redis client instance for session caching
import redisClient from '../../config/redis';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AUTH ROUTES IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Export a Fastify plugin that mounts the authentication routes to the instance
const authRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {

  // ─── POST /api/auth/login ───

  // Define the login handler — open to all clients (no authentication required)
  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    // Step 1: Validate the request body against the Zod schema (throws ZodError on failure)
    const body = LoginSchema.parse(request.body);

    // Step 2: Call the AuthService to authenticate the user against the database and Redis
    // Access the database pool via the instance's 'db' decorator (set up by the db.plugin)
    const profile = await AuthService.login(fastify.db, redisClient, body);

    // Step 3: Use the Fastify 'jwt.sign' utility to generate a stateless identity token
    const token = fastify.jwt.sign(
      {
        id: profile.id,
        role: profile.role,
        branchId: profile.branchId,
        name: profile.name,
      },
      // Set the token's expiration date from the environment configuration (default '8h')
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    // Step 4: Return 200 OK with the token and user profile
    return reply.code(200).send({
      success: true,
      data: {
        token,
        user: profile,
      },
    });
  });

  // ─── GET /api/auth/me ───

  // Define the handler to retrieve the profile for the currently logged-in user
  fastify.get('/me', {
    // Enforce authentication via the preHandler hook (set up by the auth.plugin decorator)
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Cast request to access the 'user' property attached by the JWT verification hook
    const userId = (request as any).user.id;

    // Call the AuthService to fetch the latest profile data (checks Redis cache first)
    const profile = await AuthService.getMe(fastify.db, redisClient, userId);

    // Return the user's profile data
    return reply.send({ success: true, data: profile });
  });

  // ─── POST /api/auth/logout ───

  // Define the logout handler — clears the session from the server-side cache
  fastify.post('/logout', {
    // Require authentication so we know whose session to destroy
    onRequest: [fastify.authenticate],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract the identity of the user from the decoded JWT payload on the request
    const userId = (request as any).user.id;

    // Command the AuthService to delete the session from Redis
    await AuthService.logout(redisClient, userId);

    // Return a confirmation that the logout was successful
    return reply.send({
      success: true,
      data: { message: 'Logged out successfully' },
    });
  });

  fastify.log.info('✅ Auth module routes registered successfully');
};

export default authRoutes;
