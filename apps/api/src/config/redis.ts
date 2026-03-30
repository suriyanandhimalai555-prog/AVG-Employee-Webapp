import Redis from 'ioredis';
import { env } from './env';

// Create a new Redis client instance using the validated REDIS_URL from the env config
const redis = new Redis(env.REDIS_URL);

// Register an event listener for when the Redis client establishes a connection
redis.on('connect', () => {
  // Output a success message to the console on a successful connection
  console.log('✅ Redis connected');
});

// Register an event listener for when an error occurs during a connection
redis.on('error', (err) => {
  // Output the error to the console with a descriptive label
  console.error('❌ Redis connection error:', err);
  // Terminate the application immediately with exit code 1 to ensure cache consistency
  process.exit(1);
});

// Export the redis client as the default export for use in components that need cache access
export default redis;
