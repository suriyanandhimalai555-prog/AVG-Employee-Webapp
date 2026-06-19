// Transactional outbox helper for WhatsApp notifications.
//
// Called INSIDE an existing database transaction (PoolClient) — the outbox row
// is inserted atomically with the scheme purchase/renewal write.  If the
// purchase rolls back, the notification row rolls back too; no phantom messages.
//
// After the transaction COMMITs, the caller passes the returned id to
// addNotificationJob() so the worker can pick it up immediately.  If that
// enqueue fails (Redis hiccup), the scheduler sweep recovers the row.
//
// This is the SINGLE function all scheme write paths call — no per-scheme
// copy-paste, no fetching the phone number here (the worker does that fresh).
import { PoolClient } from 'pg';

// ── Template map ──────────────────────────────────────────────────────────────
// Maps (schemeCode, event) → the pre-approved Meta template name.
// Template names MUST match what is approved in Meta Business Manager.
// Params order must match the template's {{1}} {{2}} … placeholders.
const TEMPLATE_NAMES: Record<string, Record<string, string>> = {
  enrollment: {
    // Default template used by all schemes unless overridden below
    _default:          'scheme_enrollment',
    gold_scheme:       'gold_enrollment',
    trading_academy:   'trading_enrollment',
    gold_coin_scheme:  'goldcoin_enrollment',
    lss_scheme:        'lss_enrollment',
    agila_chit_scheme: 'chit_enrollment',
    builders_scheme:   'builders_enrollment',
    land_scheme:       'land_enrollment',
  },
  renewal: {
    _default:    'scheme_renewal',
    gold_scheme: 'gold_renewal',
  },
};

function resolveTemplateName(schemeCode: string, event: 'enrollment' | 'renewal'): string {
  return TEMPLATE_NAMES[event][schemeCode] ?? TEMPLATE_NAMES[event]['_default'];
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SchemeNotificationArgs {
  // Stable project code — e.g. 'gold_scheme', 'trading_academy'
  schemeCode: string;
  // What triggered this: customer buys ('enrollment') or pays month 2+ ('renewal')
  event: 'enrollment' | 'renewal';
  // Unique ID of the purchase record (member_id, payment_id, slot_id, booking_id …)
  // Used as the dedup key — only ONE notification per (schemeCode, event, sourceId)
  sourceId: string;
  // Customer to notify
  customerId: string;
  branchId: string;
  // Snapshot of display data that the worker will put into the message template.
  // Keys match the template {{1}} {{2}} ordering defined in Meta Business Manager.
  templateParams: {
    customerName: string;
    schemeName: string;
    amount?: number;
    monthNumber?: number;
    dateStr?: string;
    [extra: string]: unknown;
  };
}

// ── Main helper ───────────────────────────────────────────────────────────────

/**
 * Insert an outbox row inside an open transaction.
 *
 * Returns the new row id on success, or null when skipped (management toggle
 * is OFF, ON CONFLICT duplicate, or any infrastructure error).
 *
 * Two layers of protection keep a notification failure from rolling back
 * the scheme write:
 *
 *   1. Business gate — if the management toggle is OFF, we return null
 *      immediately without touching whatsapp_notifications at all.  This is
 *      the primary guard while WhatsApp is not yet live.
 *
 *   2. SAVEPOINT — even with the toggle ON, an unexpected insert failure
 *      (table missing, DB hiccup, etc.) is caught, the savepoint rolls back
 *      just the notification insert, and the outer scheme transaction continues
 *      to COMMIT normally.  A plain try/catch cannot do this because Postgres
 *      aborts the whole transaction on the first failed statement.
 *
 * The caller should enqueue addNotificationJob(id) AFTER COMMIT.
 */
export async function enqueueSchemeNotification(
  client: PoolClient,
  args: SchemeNotificationArgs
): Promise<string | null> {
  // ── 1. Business gate: skip entirely when management has WhatsApp OFF ─────────
  // app_settings always exists (migration 066); this read is always safe.
  // TS: import here to avoid a circular dependency with the guard module
  const { isWhatsappMessagesEnabled } = await import('../../shared/whatsapp-guard');
  if (!(await isWhatsappMessagesEnabled(client))) {
    return null;
  }

  const templateName = resolveTemplateName(args.schemeCode, args.event);

  // ── 2. SAVEPOINT: isolate the insert so a failure doesn't abort the txn ─────
  await client.query('SAVEPOINT scheme_notif');
  try {
    const result = await client.query<{ id: string }>(
      `INSERT INTO whatsapp_notifications
         (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (scheme_code, event, source_id) DO NOTHING
       RETURNING id`,
      [
        args.schemeCode,
        args.event,
        args.sourceId,
        args.customerId,
        args.branchId,
        templateName,
        JSON.stringify(args.templateParams),
      ]
    );
    await client.query('RELEASE SAVEPOINT scheme_notif');
    // TS: RETURNING returns nothing on ON CONFLICT — null signals a duplicate
    return result.rows[0]?.id ?? null;
  } catch (err) {
    // Roll back only the notification insert; the outer scheme transaction
    // stays alive and will COMMIT normally. Log a warning so ops can see it.
    await client.query('ROLLBACK TO SAVEPOINT scheme_notif');
    console.warn('⚠️  WhatsApp outbox enqueue skipped (non-fatal):', (err as Error).message);
    return null;
  }
}
