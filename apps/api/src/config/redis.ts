import Redis from 'ioredis';
import { env } from './env';

const redis = new Redis(env.REDIS_URL, {
  // Never surface "too many retries" errors — let retryStrategy control reconnection
  maxRetriesPerRequest: null,
  // Exponential backoff: 200ms → 400ms → … → 5s cap
  retryStrategy: (times) => Math.min(times * 200, 5000),
  // Don't block startup waiting for a PING confirmation
  enableReadyCheck: false,
});

redis.on('connect',      () => console.log('✅ Redis connected'));
redis.on('ready',        () => console.log('✅ Redis ready'));
redis.on('error',        (err) => console.error('❌ Redis error (will retry):', err.message));
redis.on('close',        () => console.warn('⚠️  Redis connection closed'));
redis.on('reconnecting', () => console.warn('🔄 Redis reconnecting…'));

export default redis;
