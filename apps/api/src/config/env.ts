// src/config/env.ts
import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYERED ENV LOADING
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 1. Load local overrides (.env in apps/api/)
// dotnev.config() defaults to the current working directory.
dotenv.config();

// 2. Load shared defaults (.env in the root)
// We look up four levels from src/config/ to the root of the monorepo.
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STRICT ZOD VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Define a schema using Zod to validate the structure and content of environment variables
const envSchema = z.object({
  // Infrastructure: Database and Redis
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // Authentication: JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('8h'),

  // Storage: AWS S3 for field photos
  AWS_ACCESS_KEY_ID: z.string(),
  AWS_SECRET_ACCESS_KEY: z.string(),
  AWS_REGION: z.string(),
  S3_BUCKET_NAME: z.string(),
  S3_PRESIGN_EXPIRES: z.preprocess((val) => Number(val), z.number().default(300)),

  // Server Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess((val) => Number(val), z.number().default(3000)),
  FRONTEND_URL: z.string().url(),
});

// Infer the TypeScript type from the Zod schema for compile-time type safety
type Env = z.infer<typeof envSchema>;

// Validate the current process.env against the schema defined above
const parsed = envSchema.safeParse(process.env);

// Check if the validation failed and handle the error with a clear message map
if (!parsed.success) {
  console.error('❌ CRITICAL: Invalid environment variables:');
  // Format the Zod error into a more readable map for the operator
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  // Terminate the process immediately to prevent silent failure
  process.exit(1);
}

// Export the validated environment object with the inferred Env type
export const env: Env = parsed.data;
