import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// Load local overrides first, then fall back to the monorepo root .env
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// Tight validation matches the API — a malformed URL should fail fast at boot
// rather than surface as an opaque pg/ioredis connect error mid-job.
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ CRITICAL: Invalid worker environment variables:');
  console.error(JSON.stringify(parsed.error.issues, null, 2));
  process.exit(1);
}

export const env = parsed.data;
