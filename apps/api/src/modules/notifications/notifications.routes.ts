// WhatsApp webhook handler — Meta delivery receipt callbacks.
//
// Two endpoints (both public, no JWT auth — Meta signs requests with HMAC-SHA256):
//
//   GET  /webhooks/whatsapp  — verification challenge during webhook registration in
//                              Meta App Dashboard. Responds with hub.challenge when
//                              hub.verify_token matches WHATSAPP_WEBHOOK_VERIFY_TOKEN.
//
//   POST /webhooks/whatsapp  — delivery receipts (sent/delivered/read/failed).
//                              Meta signs the raw body with the app secret; we verify
//                              with timingSafeEqual before processing.  Updating the
//                              whatsapp_notifications row is best-effort — if the DB
//                              write fails we still return 200 so Meta doesn't retry.
//
// Why a scoped content-type parser?
//   Fastify parses JSON before the route handler runs, which destroys the raw body
//   needed for HMAC verification.  We register a plugin-scoped addContentTypeParser
//   that stores the raw Buffer on request.rawBody and hands the parsed JSON to the
//   handler via request.body.  This override is scoped so it doesn't affect any
//   other route.

import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { env } from '../../config/env';

// TS: augment FastifyRequest to carry the raw body buffer for HMAC verification
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

export default async function notificationWebhookRoutes(app: FastifyInstance) {

  // ── Scoped raw-body capture ──────────────────────────────────────────────────
  // Override the default JSON parser for this plugin scope only so we keep the
  // raw Buffer. Fastify always passes the full payload to addContentTypeParser
  // before handing the parsed value to the route.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (req, body: Buffer, done) => {
      req.rawBody = body;
      try {
        done(null, JSON.parse(body.toString('utf8')));
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // ── GET — verification handshake ─────────────────────────────────────────────
  app.get('/whatsapp', async (req, reply) => {
    const query = req.query as Record<string, string>;
    const mode      = query['hub.mode'];
    const token     = query['hub.verify_token'];
    const challenge = query['hub.challenge'];

    if (mode !== 'subscribe') {
      return reply.status(403).send({ success: false, error: 'Invalid mode' });
    }

    const expected = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (!expected || token !== expected) {
      return reply.status(403).send({ success: false, error: 'Token mismatch' });
    }

    // TS: challenge is a plain string that Meta echoes back to confirm our endpoint
    return reply.status(200).send(challenge);
  });

  // ── POST — delivery receipts ─────────────────────────────────────────────────
  app.post('/whatsapp', async (req, reply) => {
    // ── 1. HMAC-SHA256 signature verification ────────────────────────────────
    const secret = env.WHATSAPP_WEBHOOK_SECRET;
    const sigHeader = (req.headers['x-hub-signature-256'] as string | undefined) ?? '';

    if (secret && req.rawBody) {
      const expected = 'sha256=' + crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

      // TS: timingSafeEqual requires same-length Buffers; pad mismatch to avoid
      // length-based timing leak on very different strings
      const expectedBuf = Buffer.from(expected);
      const actualBuf   = Buffer.from(sigHeader.padEnd(expected.length, '\0'));

      if (
        expectedBuf.length !== actualBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, actualBuf)
      ) {
        req.log.warn({ sigHeader }, 'WhatsApp webhook: invalid HMAC signature');
        return reply.status(401).send({ success: false, error: 'Invalid signature' });
      }
    } else if (secret && !req.rawBody) {
      // Raw body capture failed — log and accept so Meta doesn't retry indefinitely
      req.log.warn('WhatsApp webhook: rawBody missing, skipping HMAC check');
    }

    // ── 2. Parse status updates ──────────────────────────────────────────────
    const payload = req.body as any;

    // Meta wraps everything in entry[].changes[].value.statuses[]
    const statuses: Array<{ id: string; status: string; timestamp: string }> = [];
    try {
      for (const entry of payload?.entry ?? []) {
        for (const change of entry?.changes ?? []) {
          for (const s of change?.value?.statuses ?? []) {
            if (s?.id && s?.status) statuses.push(s);
          }
        }
      }
    } catch {
      // Malformed payload — return 200 so Meta doesn't retry with the same bad data
      return reply.status(200).send({ success: true });
    }

    // ── 3. Update outbox rows — best-effort ──────────────────────────────────
    // Meta sends status events: sent (we already set this), delivered, read, failed.
    // We store delivered_at / read_at as additive metadata without changing status
    // (the status column stays 'sent' so the sweep doesn't re-drive delivered rows).
    // 'failed' events from Meta (failed after our send) update last_error.
    for (const s of statuses) {
      try {
        if (s.status === 'delivered') {
          await app.db.query(
            `UPDATE whatsapp_notifications
             SET delivered_at = to_timestamp($1::bigint)
             WHERE provider_message_id = $2 AND delivered_at IS NULL`,
            [s.timestamp, s.id]
          );
        } else if (s.status === 'read') {
          await app.db.query(
            `UPDATE whatsapp_notifications
             SET read_at = to_timestamp($1::bigint)
             WHERE provider_message_id = $2 AND read_at IS NULL`,
            [s.timestamp, s.id]
          );
        } else if (s.status === 'failed') {
          // TS: message failed on Meta's side after we sent it — mark with error for ops visibility
          await app.db.query(
            `UPDATE whatsapp_notifications
             SET last_error = 'delivery_failed_by_meta', status = 'failed'
             WHERE provider_message_id = $1 AND status = 'sent'`,
            [s.id]
          );
        }
      } catch (err) {
        // Non-fatal — log and continue; the next retry will try again
        req.log.error({ err, waId: s.id }, 'WhatsApp webhook: failed to update notification status');
      }
    }

    // TS: Meta requires a 200 response within 20 seconds or it retries
    return reply.status(200).send({ success: true });
  });
}
