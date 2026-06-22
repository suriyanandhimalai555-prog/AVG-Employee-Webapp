// WhatsApp notification processor.
//
// Consumes 'send-whatsapp' jobs from the 'notifications' BullMQ queue.
// Each job carries only an outbox row id — all details are fetched fresh from
// the DB so stale job data is never a problem.
//
// Gate hierarchy (checked in order; short-circuits on first false):
//   1. Atomic claim  — UPDATE WHERE status IN ('pending','failed'); 0 rows = already owned
//   2. Infra gate    — WHATSAPP_ENABLED env is 'true' (creds wired in this env)
//   3. Business gate — app_settings.whatsapp_messages_enabled = true (Management toggle)
//   4. Customer gate — has_whatsapp = true AND phone is non-empty
//   5. Delivery      — normalize phone → E.164 → POST to Meta Graph API
//
// On success: row status → 'sent', provider_message_id stored, sent_at set.
// On skip:    row status → 'skipped', skip_reason stored (terminal, no retry).
// On failure: throw so BullMQ retries (exponential backoff); revert to 'failed'.
//             After all BullMQ attempts are exhausted the row stays 'failed'.
//             The scheduler sweep re-drives 'failed' rows with attempts < MAX.

import { Job } from 'bullmq';
import { PoolClient } from 'pg';
import { db } from '../db';
import { env } from '../config/env';
import { normalizeToE164 } from '../lib/phone';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OutboxRow {
  id:              string;
  customer_id:     string;
  event:           string;
  template_name:   string;
  template_params: Record<string, unknown>;
}

interface CustomerRow {
  phone:        string | null;
  has_whatsapp: boolean;
}

// ── Message text builder ──────────────────────────────────────────────────────

// TS: builds the plain-text body for each event type from the stored params snapshot
function buildMessageText(event: string, params: Record<string, unknown>): string {
  const name   = String(params.customerName ?? '');
  const scheme = String(params.schemeName   ?? '');
  const amount = params.amount !== undefined ? `₹${params.amount}` : '';
  const date   = String(params.dateStr      ?? '');

  if (event === 'renewal') {
    const month = params.monthNumber !== undefined ? ` for month ${params.monthNumber}` : '';
    return `Hi ${name}, we received your ${scheme} payment of ${amount}${month} on ${date}. Thank you! 🙏`;
  }
  // enrollment (default for all other schemes)
  return `Hi ${name}, your enrollment in ${scheme} for ${amount} on ${date} is confirmed. Welcome to Agilavetri PrimeTech! 🎉`;
}

// ── Meta Cloud API sender ─────────────────────────────────────────────────────

async function sendViaMetaCloudApi(
  phone: string,
  event: string,
  templateParams: Record<string, unknown>
): Promise<string> {
  const url = `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  // TS: send as free-form text message (no template required)
  const body = {
    messaging_product: 'whatsapp',
    to:                phone,
    type:              'text',
    text: {
      preview_url: false,
      body:        buildMessageText(event, templateParams),
    },
  };

  const response = await fetch(url, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta API error ${response.status}: ${errorText}`);
  }

  const responseData = (await response.json()) as { messages?: Array<{ id: string }> };
  // TS: Meta returns the WAMID in messages[0].id
  return responseData.messages?.[0]?.id ?? 'unknown';
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function skip(client: PoolClient, id: string, reason: string): Promise<void> {
  await client.query(
    `UPDATE whatsapp_notifications SET status='skipped', skip_reason=$2 WHERE id=$1`,
    [id, reason]
  );
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processWhatsAppNotification(job: Job): Promise<void> {
  const { outboxId } = job.data as { outboxId: string };
  if (!outboxId) throw new Error('Missing outboxId in job data');

  const client = await db.connect();
  try {
    // ── 1. Atomic claim — the single concurrency fence ────────────────────────
    // Only one worker wins this UPDATE — whichever gets the lock first.
    // Any other worker (sweep job, BullMQ stall recovery) racing here sees
    // status='sending' (or 'sent'/'skipped') → gets 0 rows → exits cleanly.
    // This is what prevents duplicate WhatsApp messages when two jobs race.
    const claim = await client.query<OutboxRow>(
      `UPDATE whatsapp_notifications
       SET status = 'sending', attempts = attempts + 1
       WHERE id = $1 AND status IN ('pending', 'failed')
       RETURNING id, customer_id, event, template_name, template_params`,
      [outboxId]
    );
    if (claim.rows.length === 0) {
      console.log(`📱 WhatsApp outbox ${outboxId} already claimed or processed — skipping`);
      return;
    }
    const row = claim.rows[0];

    // ── 2. Infra gate — WHATSAPP_ENABLED env ─────────────────────────────────
    if (env.WHATSAPP_ENABLED !== 'true') {
      await skip(client, outboxId, 'infra_disabled');
      console.log(`📱 WhatsApp ${outboxId} skipped: infra_disabled (WHATSAPP_ENABLED != 'true')`);
      return;
    }

    // ── 3. Business gate — management toggle in app_settings ──────────────────
    const settingRes = await client.query(
      `SELECT value FROM app_settings WHERE key = 'whatsapp_messages_enabled'`
    );
    if (settingRes.rows[0]?.value !== true) {
      await skip(client, outboxId, 'messages_disabled');
      console.log(`📱 WhatsApp ${outboxId} skipped: messages_disabled (management toggle off)`);
      return;
    }

    // ── 4. Customer gate — has_whatsapp + phone ───────────────────────────────
    const custRes = await client.query<CustomerRow>(
      `SELECT phone, has_whatsapp FROM customers WHERE id = $1`,
      [row.customer_id]
    );
    const customer = custRes.rows[0];

    if (!customer) {
      await skip(client, outboxId, 'customer_not_found');
      console.log(`📱 WhatsApp ${outboxId} skipped: customer_not_found`);
      return;
    }
    if (!customer.has_whatsapp) {
      await skip(client, outboxId, 'no_whatsapp');
      console.log(`📱 WhatsApp ${outboxId} skipped: no_whatsapp (customer flag off)`);
      return;
    }
    if (!customer.phone) {
      await skip(client, outboxId, 'no_phone');
      console.log(`📱 WhatsApp ${outboxId} skipped: no_phone`);
      return;
    }

    // ── 5. Normalize phone → E.164 ────────────────────────────────────────────
    const e164 = normalizeToE164(customer.phone);
    if (!e164) {
      await skip(client, outboxId, 'phone_unformattable');
      console.log(`📱 WhatsApp ${outboxId} skipped: phone_unformattable (raw: "${customer.phone}")`);
      return;
    }

    // ── 6. Send via Meta Cloud API ────────────────────────────────────────────
    console.log(`📱 Sending WhatsApp [${row.event}] → ${e164} (outbox ${outboxId})`);
    const wamid = await sendViaMetaCloudApi(e164, row.event, row.template_params);

    // ── 7. Mark sent ──────────────────────────────────────────────────────────
    await client.query(
      `UPDATE whatsapp_notifications
       SET status = 'sent', provider_message_id = $2, sent_at = now()
       WHERE id = $1`,
      [outboxId, wamid]
    );
    console.log(`✅ WhatsApp sent (wamid: ${wamid}) for outbox ${outboxId}`);
  } catch (err) {
    // Revert 'sending' → 'failed' so BullMQ can retry and the sweep can
    // re-drive later. Attempts were already incremented at claim time — don't
    // increment again here or exhausted rows will be driven past their cap.
    try {
      await client.query(
        `UPDATE whatsapp_notifications SET status = 'failed', last_error = $2 WHERE id = $1`,
        [outboxId, (err as Error).message]
      );
    } catch {
      // Swallow secondary DB error — the primary error is what BullMQ sees
    }
    throw err; // BullMQ schedules exponential-backoff retry
  } finally {
    client.release();
  }
}
