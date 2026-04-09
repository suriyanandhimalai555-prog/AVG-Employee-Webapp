// src/app.ts
import Fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';

// Infrastructure Configuration: validated environment variables
import { env } from './config/env';
// Redis client used for session caching and rate limiting
import redisClient from './config/redis';

// Infrastructure Plugins: DB, Auth decorators, and Global Error Handling
import dbPlugin from './plugins/db.plugin';
import redisPlugin from './plugins/redis.plugin';
import authPlugin from './plugins/auth.plugin';
import errorHandlerPlugin from './plugins/error-handler.plugin';
import socketPlugin from './plugins/socket.plugin';

// Feature Modules: encapsulated routes and business logic
import authRoutes from './modules/auth/auth.routes';
import attendanceRoutes from './modules/attendance/attendance.routes';
import branchRoutes from './modules/branches/branch.routes';
import transactionRoutes from './modules/transactions/transaction.routes';
import userRoutes from './modules/users/user.routes';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// APP FACTORY IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Creates and configures the Fastify application instance.
 * Following the industry-standard modular approach:
 * 1. Global Setup (Logger, CORS)
 * 2. Infrastructure Plugins (DB, JWT, Rate Limiting, Error Handling)
 * 3. Feature Modules (Auth, Attendance)
 */
const buildApp = async (): Promise<FastifyInstance> => {
  // Step 1: Create Fastify instance with environment-aware logging
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'warn' : 'info',
    },
  });

  // Step 2: Register Global CORS policy
  // Allows the frontend to interact with the API securely
  await app.register(fastifyCors, {
    origin: [env.FRONTEND_URL, /^http:\/\/localhost:\d+$/],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 3: Infrastructure Registration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Register the Database plugin (decorates instance with 'fastify.db')
  await app.register(dbPlugin);

  // Register the Redis plugin (decorates instance with 'fastify.redis')
  await app.register(redisPlugin);

  // Register the Authentication plugin (decorates instance with 'fastify.authenticate')
  await app.register(authPlugin);

  // Step 4: Register Rate Limiting AFTER authPlugin so request.user.id is populated when
  // keyGenerator runs — limits are per authenticated user, not per IP. Dashboard roles
  // (MD, GM) legitimately fire many requests per minute (branch summaries, photo URLs for
  // every employee), so the ceiling is raised to 300 to avoid false-positive 429s.
  await app.register(fastifyRateLimit, {
    max: 300,
    timeWindow: 60000,
    redis: redisClient,
    // With auth registered first, request.user.id is always available for logged-in requests
    keyGenerator: (request: any) => request.user?.id ?? request.ip,
    errorResponseBuilder: () => ({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
      },
    }),
  });

  // Register Socket.io after auth so fastify.jwt is available for socket token verification
  await app.register(socketPlugin);

  // Register the Global Error Handling plugin (handles 404s and all exceptions)
  await app.register(errorHandlerPlugin);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 5: Feature Module Registration
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Register a simple health check route (used by monitoring/deployment tools)
  app.get('/health', async () => ({
    success: true,
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.NODE_ENV,
    },
  }));

  // Register the Authentication module (Login, Me, Logout)
  // Mounts under the '/api/auth' prefix
  await app.register(authRoutes, { prefix: '/api/auth' });

  // Register the Attendance module (Submission, Listing, Summaries)
  // Mounts under the '/api/attendance' prefix
  await app.register(attendanceRoutes, { prefix: '/api/attendance' });

  // Register the Branches module (List, Create, Update — MD only for writes)
  // Mounts under the '/api/branches' prefix
  await app.register(branchRoutes, { prefix: '/api/branches' });

  // Register the Transactions module (Create, List, Update status — automatic auditing)
  // Mounts under the '/api/transactions' prefix
  await app.register(transactionRoutes, { prefix: '/api/transactions' });

  // Register the Money Collections module
  // Mounts under the '/api/money' prefix
  const moneyRoutes = require('./modules/money/money.routes').default;
  await app.register(moneyRoutes, { prefix: '/api/money' });

  // Register the User Management module (MD only for creation)
  // Mounts under the '/api/users' prefix
  await app.register(userRoutes, { prefix: '/api/users' });

  return app;
};

// Export the buildApp factory function for use in index.ts or test runners
export default buildApp;
