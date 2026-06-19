// WhatsApp dispatch sweep processor.
//
// Runs on a 5-minute repeatable schedule ('whatsapp-dispatch' job).
// Reads whatsapp_dispatch_cursors to know how far each scheme has been processed,
// then scans the scheme tables for new records and inserts outbox rows into
// whatsapp_notifications.  The existing 'whatsapp-sweep' job + send processor
// picks up those rows and delivers them.
//
// Decoupling guarantee:
//   No scheme service touches this file or imports any notification helper.
//   The dispatch sweep is a pure observer — it reads scheme tables but never
//   writes to them.
//
// Rate-limit guard (per-customer, per-scheme, 24 h):
//   The INSERT subquery excludes customers who already have a non-skipped
//   notification for the same scheme_code in the last 24 hours.  This covers
//   cases where a customer buys multiple slots in one session (gold-coin / LSS)
//   and we don't want to spam them.
//
// Gold-coin / LSS dedup:
//   A customer can buy multiple slots in one session.  We group by
//   (customer_id, room_id, DATE(created_at)) and use MIN(id) as source_id so
//   only one notification is inserted per day-per-room-per-customer batch.
//   ON CONFLICT (scheme_code, event, source_id) DO NOTHING is still present as
//   a second dedup fence for subsequent sweep runs.

import { Pool } from 'pg';

// TS: cutoff buffer — ignore records committed in the last 30 s to let
// in-flight transactions finish before the sweep reads them
const BUFFER_MS = 30 * 1000;
// TS: dead-letter threshold — rows that have been tried this many times without
// succeeding need manual ops intervention
const DEAD_LETTER_ATTEMPTS = 5;

// ── Per-scheme dispatch helpers ───────────────────────────────────────────────
// Each helper inserts new outbox rows for one (scheme_code, event) cursor and
// returns { count, maxCreatedAt } so the caller can advance the cursor.
//
// All helpers share the same INSERT shape:
//   INSERT INTO whatsapp_notifications (scheme_code, event, source_id,
//     customer_id, branch_id, template_name, template_params)
//   SELECT ...
//   WHERE created_at > $after AND created_at < $before
//     AND NOT EXISTS (24 h rate-limit subquery)
//   ON CONFLICT (scheme_code, event, source_id) DO NOTHING
//   RETURNING created_at AS source_created_at

interface DispatchResult {
  count: number;
  maxCreatedAt: Date | null;
}

async function dispatchGoldEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'gold_scheme', 'enrollment', m.id, m.customer_id, m.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Gold Savings Scheme',
         'amount',       m.monthly_amount,
         'dateStr',      to_char(m.start_date, 'DD Mon YYYY')
       )
     FROM gold_scheme_members m
     JOIN customers c ON c.id = m.customer_id
     WHERE m.created_at > $1 AND m.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = m.customer_id
           AND wn.scheme_code = 'gold_scheme'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchGoldRenewals(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  // TS: renewal source is the payment row, not the member row
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'gold_scheme', 'renewal', p.id, m.customer_id, m.branch_id,
       'scheme_renewal',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Gold Savings Scheme',
         'amount',       p.amount,
         'monthNumber',  p.month_number,
         'dateStr',      to_char(p.paid_date, 'DD Mon YYYY')
       )
     FROM gold_scheme_payments p
     JOIN gold_scheme_members m ON m.id = p.member_id
     JOIN customers c ON c.id = m.customer_id
     WHERE p.created_at > $1 AND p.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = m.customer_id
           AND wn.scheme_code = 'gold_scheme'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchTradingAcademyEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'trading_academy', 'enrollment', m.id, m.customer_id, m.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Trading Academy',
         'amount',       m.amount,
         'dateStr',      to_char(m.enrollment_date, 'DD Mon YYYY')
       )
     FROM trading_academy_members m
     JOIN customers c ON c.id = m.customer_id
     WHERE m.created_at > $1 AND m.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = m.customer_id
           AND wn.scheme_code = 'trading_academy'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchGoldCoinEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  // TS: group by (customer_id, room_id, day) so one bulk-purchase session = one notification;
  // MIN(id) as source_id is the dedup key in ON CONFLICT
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'gold_coin_scheme', 'enrollment', batch.source_id,
       batch.customer_id, batch.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Gold Coin Scheme',
         'amount',       batch.total_amount,
         'dateStr',      to_char(batch.slot_date, 'DD Mon YYYY')
       )
     FROM (
       SELECT
         MIN(s.id)                     AS source_id,
         s.customer_id,
         s.branch_id,
         DATE(s.created_at)            AS slot_date,
         SUM(s.amount_paid)            AS total_amount,
         MAX(s.created_at)             AS max_created_at
       FROM gold_coin_slots s
       WHERE s.created_at > $1 AND s.created_at < $2
       GROUP BY s.customer_id, s.room_id, s.branch_id, DATE(s.created_at)
     ) batch
     JOIN customers c ON c.id = batch.customer_id
     WHERE NOT EXISTS (
       SELECT 1 FROM whatsapp_notifications wn
       WHERE wn.customer_id = batch.customer_id
         AND wn.scheme_code = 'gold_coin_scheme'
         AND wn.status NOT IN ('skipped')
         AND wn.created_at > now() - INTERVAL '24 hours'
     )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchLssEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  // TS: same day-batching pattern as gold-coin
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'lss_scheme', 'enrollment', batch.source_id,
       batch.customer_id, batch.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'LSS Scheme',
         'amount',       batch.total_amount,
         'dateStr',      to_char(batch.slot_date, 'DD Mon YYYY')
       )
     FROM (
       SELECT
         MIN(s.id)                     AS source_id,
         s.customer_id,
         s.branch_id,
         DATE(s.created_at)            AS slot_date,
         SUM(s.amount_paid)            AS total_amount,
         MAX(s.created_at)             AS max_created_at
       FROM lss_slots s
       WHERE s.created_at > $1 AND s.created_at < $2
       GROUP BY s.customer_id, s.room_id, s.branch_id, DATE(s.created_at)
     ) batch
     JOIN customers c ON c.id = batch.customer_id
     WHERE NOT EXISTS (
       SELECT 1 FROM whatsapp_notifications wn
       WHERE wn.customer_id = batch.customer_id
         AND wn.scheme_code = 'lss_scheme'
         AND wn.status NOT IN ('skipped')
         AND wn.created_at > now() - INTERVAL '24 hours'
     )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchChitEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  // TS: agila_chit_members has no branch_id — get it from the group
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'agila_chit_scheme', 'enrollment', m.id, m.customer_id, g.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Agila Chit Fund',
         'amount',       g.full_amount,
         'dateStr',      to_char(m.created_at, 'DD Mon YYYY')
       )
     FROM agila_chit_members m
     JOIN agila_chit_groups g ON g.id = m.group_id
     JOIN customers c ON c.id = m.customer_id
     WHERE m.created_at > $1 AND m.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = m.customer_id
           AND wn.scheme_code = 'agila_chit_scheme'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchBuildersEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'builders_scheme', 'enrollment', p.id, p.customer_id, p.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Builders Scheme',
         'amount',       p.investment_amount,
         'dateStr',      to_char(p.lump_sum_date, 'DD Mon YYYY')
       )
     FROM builders_plans p
     JOIN customers c ON c.id = p.customer_id
     WHERE p.created_at > $1 AND p.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = p.customer_id
           AND wn.scheme_code = 'builders_scheme'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

async function dispatchLandEnrollments(
  db: Pool,
  after: Date,
  before: Date
): Promise<DispatchResult> {
  const res = await db.query<{ source_created_at: Date }>(
    `INSERT INTO whatsapp_notifications
       (scheme_code, event, source_id, customer_id, branch_id, template_name, template_params)
     SELECT
       'land_scheme', 'enrollment', b.id, b.customer_id, b.branch_id,
       'scheme_enrollment',
       jsonb_build_object(
         'customerName', c.name,
         'schemeName',   'Land Scheme',
         'amount',       pl.land_cost,
         'dateStr',      to_char(b.booking_date, 'DD Mon YYYY')
       )
     FROM land_bookings b
     JOIN land_plots pl ON pl.id = b.plot_id
     JOIN customers c ON c.id = b.customer_id
     WHERE b.created_at > $1 AND b.created_at < $2
       AND NOT EXISTS (
         SELECT 1 FROM whatsapp_notifications wn
         WHERE wn.customer_id = b.customer_id
           AND wn.scheme_code = 'land_scheme'
           AND wn.status NOT IN ('skipped')
           AND wn.created_at > now() - INTERVAL '24 hours'
       )
     ON CONFLICT (scheme_code, event, source_id) DO NOTHING
     RETURNING created_at AS source_created_at`,
    [after, before]
  );
  return {
    count: res.rowCount ?? 0,
    maxCreatedAt: res.rows.length > 0
      ? new Date(Math.max(...res.rows.map((r) => new Date(r.source_created_at).getTime())))
      : null,
  };
}

// ── Cursor dispatch table ─────────────────────────────────────────────────────
// Maps (scheme_code, event) → the helper that generates outbox rows for it.
// Add entries here when new schemes are introduced.

type DispatchFn = (db: Pool, after: Date, before: Date) => Promise<DispatchResult>;

const DISPATCH_TABLE: Record<string, DispatchFn> = {
  'gold_scheme:enrollment':       dispatchGoldEnrollments,
  'gold_scheme:renewal':          dispatchGoldRenewals,
  'trading_academy:enrollment':   dispatchTradingAcademyEnrollments,
  'gold_coin_scheme:enrollment':  dispatchGoldCoinEnrollments,
  'lss_scheme:enrollment':        dispatchLssEnrollments,
  'agila_chit_scheme:enrollment': dispatchChitEnrollments,
  'builders_scheme:enrollment':   dispatchBuildersEnrollments,
  'land_scheme:enrollment':       dispatchLandEnrollments,
};

// ── Main entry point ──────────────────────────────────────────────────────────

export async function processWhatsAppDispatch(): Promise<void> {
  // TS: dynamic import avoids circular dep — same pattern as runWhatsAppSweep in worker.ts
  const { db } = await import('../db.js');
  const { notificationsQueue } = await import('../queues/notifications.js');

  // ── 1. Business gate ─────────────────────────────────────────────────────
  const toggleRes = await db.query(
    `SELECT value FROM app_settings WHERE key = 'whatsapp_messages_enabled'`
  );
  // TS: value is stored as JSONB boolean — postgres-node returns it as a JS boolean
  if (toggleRes.rows[0]?.value !== true) {
    console.log('📱 WhatsApp dispatch: messages_disabled — nothing to dispatch');
    return;
  }

  // ── 2. Read all cursors ───────────────────────────────────────────────────
  const cursorRes = await db.query<{
    scheme_code: string;
    event: string;
    dispatched_through: Date;
  }>(`SELECT scheme_code, event, dispatched_through FROM whatsapp_dispatch_cursors ORDER BY scheme_code, event`);

  if (cursorRes.rows.length === 0) {
    console.log('📱 WhatsApp dispatch: no cursors registered — nothing to do');
    return;
  }

  // TS: buffer so we never read a timestamp from a transaction that hasn't committed yet
  const before = new Date(Date.now() - BUFFER_MS);

  let totalInserted = 0;

  // ── 3. Per-cursor dispatch ────────────────────────────────────────────────
  for (const cursor of cursorRes.rows) {
    const key = `${cursor.scheme_code}:${cursor.event}`;
    const dispatchFn = DISPATCH_TABLE[key];

    if (!dispatchFn) {
      // Unknown (scheme_code, event) — skip silently; could be a future scheme
      console.warn(`📱 WhatsApp dispatch: no handler for cursor ${key}, skipping`);
      continue;
    }

    const after = new Date(cursor.dispatched_through);
    if (after >= before) {
      // Cursor is already past the buffer window — nothing new yet
      continue;
    }

    let result: DispatchResult;
    try {
      result = await dispatchFn(db, after, before);
    } catch (err) {
      // TS: log and continue so one scheme failure doesn't block others
      console.error(`📱 WhatsApp dispatch: error processing ${key}:`, err);
      continue;
    }

    if (result.count === 0) continue;

    totalInserted += result.count;
    console.log(`📱 WhatsApp dispatch: inserted ${result.count} row(s) for ${key}`);

    // ── 4. Advance cursor — use before as the new watermark ──────────────
    // Even if maxCreatedAt is available, advancing to `before` is safe:
    // the next run will use `before` as the new `after`, catching anything
    // in the gap if `before` happens to fall between two records.
    await db.query(
      `UPDATE whatsapp_dispatch_cursors
       SET dispatched_through = $1
       WHERE scheme_code = $2 AND event = $3`,
      [before, cursor.scheme_code, cursor.event]
    );

    // ── 5. Enqueue one 'send-whatsapp' job per new outbox row ────────────
    // Fetch the ids we just inserted so we can enqueue precisely the new rows
    const newRows = await db.query<{ id: string }>(
      `SELECT id FROM whatsapp_notifications
       WHERE scheme_code = $1 AND event = $2 AND status = 'pending'
         AND created_at >= $3
       ORDER BY created_at ASC`,
      [cursor.scheme_code, cursor.event, new Date(before.getTime() - 60_000)]
    );
    for (const row of newRows.rows) {
      await notificationsQueue.add('send-whatsapp', { outboxId: row.id });
    }
  }

  if (totalInserted > 0) {
    console.log(`✅ WhatsApp dispatch sweep: inserted ${totalInserted} total outbox row(s)`);
  }

  // ── 6. Dead-letter check ──────────────────────────────────────────────────
  const deadRes = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM whatsapp_notifications
     WHERE attempts >= $1 AND status = 'failed'`,
    [DEAD_LETTER_ATTEMPTS]
  );
  const deadCount = parseInt(deadRes.rows[0].count, 10);
  if (deadCount > 0) {
    console.error(
      `🚨 CRITICAL: ${deadCount} WhatsApp notification(s) in dead-letter state ` +
      `(attempts >= ${DEAD_LETTER_ATTEMPTS}, status=failed) — manual review required`
    );
  }
}
