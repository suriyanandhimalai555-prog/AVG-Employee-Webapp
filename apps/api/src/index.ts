// src/index.ts
import buildApp from './app';
// Environment validation: ensuring all variables are present before starting
import { env } from './config/env';

/**
 * Main server execution entry point.
 * 1. Build the Fastify instance using the app factory.
 * 2. Start the HTTP server on the configured port and host.
 * 3. Handle graceful shutdown for SIGTERM/SIGINT signals.
 */
async function startServer(): Promise<void> {
  // Step 1: Initialize the configured Fastify application and its plugins
  const app = await buildApp();

  try {
    // Step 2: Start the server listening on the configured port
    // Binds to 0.0.0.0 so the container is accessible externally (required for Railway)
    await app.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });

    app.log.info(`✅ Attendance API running on port ${env.PORT}`);
    app.log.info(`✅ Environment: ${env.NODE_ENV}`);
  } catch (error) {
    // If the server fails to start (e.g. port already in use), log and exit
    app.log.error({ err: error }, '❌ Failed to start server');
    process.exit(1);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // GRACEFUL SHUTDOWN
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Handler function for a clean exit from the process
  const gracefulShutdown = async (signal: string) => {
    app.log.warn(`🔄 Received ${signal}. Shutting down gracefully...`);
    
    // Commands the Fastify instance to stop accepting new connections
    // and wait for in-progress requests to finish. This also triggers
    // any 'onClose' hooks registered by plugins (like the database pool).
    await app.close();

    app.log.info('✅ Shutdown complete. Goodbye!');
    process.exit(0);
  };

  // Listen for termination signals from the operating system or hosting platform
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

// Invoke the startup function to boot the application
startServer();
