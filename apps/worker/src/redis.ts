import IORedis from 'ioredis';
import { env } from './config/env';

// maxRetriesPerRequest: null — required by BullMQ (prevents "too many retries" errors).
// retryStrategy — exponential backoff (200ms → 5s cap) so the worker reconnects
//   automatically after ECONNRESET / ETIMEDOUT without crashing.
// enableReadyCheck: false — skip the PING confirmation on startup; BullMQ handles
//   its own health checks internally.
// reconnectOnError — reconnect on any error (not just specific codes) so idle-timeout
//   resets from cloud Redis providers don't strand the worker permanently.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times) => Math.min(times * 200, 5000),
  reconnectOnError: () => true,
});

redis.on('error',        (err) => console.error('❌ Redis error (will retry):', err.message));
redis.on('reconnecting', () => console.warn('🔄 Redis reconnecting…'));
redis.on('ready',        () => console.log('✅ Redis ready'));
