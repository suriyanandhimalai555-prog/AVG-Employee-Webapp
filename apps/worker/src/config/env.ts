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
  REDIS_URL:    z.string().url(),
  NODE_ENV:     z.enum(['development', 'production', 'test']).default('development'),

  // ── WhatsApp Cloud API (Meta Graph API) ──────────────────────────────────────
  // All optional — worker boots and runs without them (rows skipped with reason
  // 'infra_disabled'). Set WHATSAPP_ENABLED=true once Meta credentials are ready.
  WHATSAPP_ENABLED:              z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID:      z.string().optional(),
  WHATSAPP_ACCESS_TOKEN:         z.string().optional(),
  // TS: default to Meta's latest stable API version
  WHATSAPP_API_VERSION:          z.string().optional().default('v21.0'),
  // TS: Indian mobile numbers stored as 10 digits — prepend this country code
  WHATSAPP_DEFAULT_COUNTRY_CODE: z.string().optional().default('91'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ CRITICAL: Invalid worker environment variables:');
  console.error(JSON.stringify(parsed.error.issues, null, 2));
  process.exit(1);
}

export const env = parsed.data;
