// src/plugins/db.plugin.ts
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { Pool, types } from 'pg';
import { env } from '../config/env';

// Override pg DATE type parser — pg converts DATE columns to JS Date objects by default, which
// shifts the date back one day when the server runs in IST (+05:30) due to UTC conversion.
// Returning the raw string keeps '2026-04-04' as '2026-04-04' in all JSON responses.
types.setTypeParser(1082, (val) => val);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE OVERRIDE FOR FASTIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Declare shared types for Fastify so that 'fastify.db' is recognized by the compiler
declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB PLUGIN IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Use 'fastify-plugin' to ensure this plugin is NOT encapsulated (so the decoration is global)
const dbPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Create a new PostgreSQL connection pool using the validated environment URL
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Set a maximum of 20 connections in the pool for this service
    max: 20,
    // Set a 30 second timeout for acquiring a connection from the pool
    connectionTimeoutMillis: 30000,
    // Automatically close idle connections after 10 seconds
    idleTimeoutMillis: 10000,
  });

  // Attach an error listener to the pool to catch unexpected connection drops
  pool.on('error', (err) => {
    fastify.log.error({ err }, '❌ Unexpected database error on idle client');
  });

  // Decorate the fastify instance with the pool instance
  // This makes 'fastify.db' available in all routes and plugins
  fastify.decorate('db', pool);

  // Add a hook to close the pool when the Fastify instance is shutting down
  // This ensures a clean exit and releases all database connections
  fastify.addHook('onClose', async (instance) => {
    instance.log.info('🔄 Closing database connection pool...');
    await pool.end();
    instance.log.info('✅ Database pool closed');
  });

  fastify.log.info('✅ Database plugin registered successfully');
});

export default dbPlugin;
