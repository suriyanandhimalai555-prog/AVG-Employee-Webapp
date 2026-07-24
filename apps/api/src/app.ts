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
import moneyRoutes from './modules/money/money.routes';
import userRoutes from './modules/users/user.routes';
import goldRoutes from './modules/gold/gold.routes';
import incentiveRoutes from './modules/incentives/incentives.routes';
import salaryRoutes from './modules/salaries/salaries.routes';
import tradingAcademyRoutes from './modules/trading-academy/trading-academy.routes';
import customerRoutes from './modules/customers/customers.routes';
import goldCoinRoutes from './modules/gold-coin/gold-coin.routes';
import lssRoutes from './modules/lss/lss.routes';
import chitRoutes from './modules/chit/chit.routes';
import buildersRoutes from './modules/builders/builders.routes';
import landRoutes from './modules/land/land.routes';
import schemesAggregateRoutes from './modules/schemes/aggregate.routes';
import pendingEnrollmentRoutes from './modules/pending-enrollments/pending-enrollments.routes';
import settingsRoutes from './modules/settings/settings.routes';
import reconciliationRoutes from './modules/reconciliation/reconciliation.routes';
import notificationWebhookRoutes from './modules/notifications/notifications.routes';
import appVersionRoutes from './modules/app-version/app-version.routes';

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
  // Origin list comes from ALLOWED_ORIGINS (comma-separated), then FRONTEND_URL,
  // then a localhost regex fallback for developer machines. No hardcoded prod URLs.
  const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s: string) => s.trim())
    .filter(Boolean);
  await app.register(fastifyCors, {
    origin: [
      ...new Set([env.FRONTEND_URL, ...allowedOrigins]),
      /^http:\/\/localhost:\d+$/,
    ],
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
  await app.register(moneyRoutes, { prefix: '/api/money' });

  // Register the User Management module (MD only for creation)
  // Mounts under the '/api/users' prefix
  await app.register(userRoutes, { prefix: '/api/users' });

  // Register the Gold Savings Scheme module (branch_admin writes, managers read)
  // Mounts under the '/api/gold' prefix
  await app.register(goldRoutes, { prefix: '/api/gold' });

  // Register the Incentive Wallet module (managers credit, employees view own)
  // Mounts under the '/api/incentives' prefix
  await app.register(incentiveRoutes, { prefix: '/api/incentives' });

  // Register the Salary Management module (MD/Director set, employees view own)
  // Mounts under the '/api/salaries' prefix
  await app.register(salaryRoutes, { prefix: '/api/salaries' });

  // Register the Trading Academy scheme module (branch_admin writes, managers read)
  // Mounts under the '/api/trading-academy' prefix
  await app.register(tradingAcademyRoutes, { prefix: '/api/trading-academy' });

  // Register the Customers module (search, create, view scheme history)
  // Mounts under the '/api/customers' prefix
  await app.register(customerRoutes, { prefix: '/api/customers' });

  // Register the Gold Coin scheme (16-slot rooms, monthly draws, head-branch combine)
  // Mounts under the '/api/gold-coin' prefix
  await app.register(goldCoinRoutes, { prefix: '/api/gold-coin' });

  // Register the LSS scheme (20-slot rooms, monthly draws, level-based payout)
  // Mounts under the '/api/lss' prefix
  await app.register(lssRoutes, { prefix: '/api/lss' });

  // Register the Agila Chit Fund scheme (20-member groups, 20 months, manual winner selection)
  // Mounts under the '/api/chit' prefix
  await app.register(chitRoutes, { prefix: '/api/chit' });

  // Register the Builders Scheme (individual lump-sum plans, 60-month payouts, house or cash)
  // Mounts under the '/api/builders' prefix
  await app.register(buildersRoutes, { prefix: '/api/builders' });

  // Register the Land Sales Management System (sites, plots, bookings, 60-month buyback)
  // Mounts under the '/api/land' prefix
  await app.register(landRoutes, { prefix: '/api/land' });

  // Register the cross-scheme aggregate dashboard (MD / Director only).
  // Walks the scheme registry — every scheme that implements getOverviewByBranch
  // appears here automatically; no per-scheme edits needed in this file.
  await app.register(schemesAggregateRoutes, { prefix: '/api/schemes' });

  // Partial / installment enrollment staging layer (all schemes except Land).
  await app.register(pendingEnrollmentRoutes, { prefix: '/api/pending-enrollments' });

  // App-level settings (backdated-entry permission flag)
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // Daily collection reconciliation (branch admin declaration + live panel + management overview)
  await app.register(reconciliationRoutes, { prefix: '/api/reconciliation' });

  // WhatsApp delivery-receipt webhooks — public, no JWT auth.
  // Meta verifies ownership via GET challenge and signs POST bodies with HMAC-SHA256.
  await app.register(notificationWebhookRoutes, { prefix: '/api/webhooks' });

  // Mobile app version gate — GET is public (native app checks on launch before login).
  // PATCH is management-only to update version strings and the force-update flag.
  await app.register(appVersionRoutes, { prefix: '/api/app-version' });

  return app;
};

// Export the buildApp factory function for use in index.ts or test runners
export default buildApp;
