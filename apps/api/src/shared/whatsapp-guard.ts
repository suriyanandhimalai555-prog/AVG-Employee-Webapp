// Guard for the management-controlled WhatsApp messaging toggle.
//
// The 'whatsapp_messages_enabled' key in app_settings is the BUSINESS gate —
// it controls whether the company wants messages sent at all.  There is a
// separate INFRA gate (WHATSAPP_ENABLED env var) for whether the worker has
// credentials wired.  Both must be true for a message to be delivered.
//
// Read directly from app_settings on every check — no cache — so that a
// management toggle takes effect immediately for the next purchase.
import { Pool, PoolClient } from 'pg';

// TS: stable key constant so the service and guard never disagree on spelling
export const WHATSAPP_MESSAGES_KEY = 'whatsapp_messages_enabled';

// Reads the business toggle from app_settings.
// Returns false if the row is missing (safe default: off until seeded).
export async function isWhatsappMessagesEnabled(
  db: Pool | PoolClient
): Promise<boolean> {
  const res = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [WHATSAPP_MESSAGES_KEY]
  );
  // TS: JSONB 'false' arrives parsed as boolean false; missing row = disabled
  return res.rows[0]?.value === true;
}
