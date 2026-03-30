// src/plugins/redis.plugin.ts
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import Redis from 'ioredis';
import { env } from '../config/env';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPE OVERRIDE FOR FASTIFY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Declare shared types for Fastify so that 'fastify.redis' is recognized
declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// REDIS PLUGIN IMPLEMENTATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const redisPlugin: FastifyPluginAsync = fp(async (fastify: FastifyInstance) => {
  // Create a new Redis instance using the validated environment URL
  const redis = new Redis(env.REDIS_URL, {
    // BullMQ requires maxRetriesPerRequest to be null for proper job handling
    maxRetriesPerRequest: null,
    // Automatically reconnect on connection loss
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });

  redis.on('error', (err) => {
    fastify.log.error({ err }, '❌ Redis connection error');
  });

  // Decorate the fastify instance with the redis instance
  fastify.decorate('redis', redis);

  // Close the redis connection when Fastify is shutting down
  fastify.addHook('onClose', async (instance) => {
    instance.log.info('🔄 Closing Redis connection...');
    instance.redis.disconnect();
    instance.log.info('✅ Redis connection closed');
  });

  fastify.log.info('✅ Redis plugin registered successfully');
});

export default redisPlugin;
