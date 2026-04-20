import IORedis from 'ioredis';
import { env } from './config/env';

// maxRetriesPerRequest: null is required by BullMQ — prevents the client from
// bubbling a "too many retries" error back into the worker connection loop.
export const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});
