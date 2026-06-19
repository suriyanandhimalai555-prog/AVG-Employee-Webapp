import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { processAttendance } from './processors/attendance';
import { processSignOff } from './processors/signOff';
import { processAutoAbsent } from './processors/autoAbsent';
import { processAutoDeactivate } from './processors/autoDeactivate';
import { processWhatsAppNotification } from './processors/whatsapp';
import { processWhatsAppDispatch } from './processors/whatsapp-dispatch';

/**
 * Routes incoming jobs from the 'attendance' queue to the correct processor.
 *
 * All scheduled (repeatable) jobs flow through the same queue — they are
 * differentiated by job.name. Unknown job names are rejected with an error
 * so they land in the failed queue and trigger the alert path, rather than
 * silently disappearing.
 */
const router = async (job: Job): Promise<{ success: boolean }> => {
  switch (job.name) {
    case 'auto-absent':
      await processAutoAbsent();
      return { success: true };

    case 'auto-deactivate':
      await processAutoDeactivate();
      return { success: true };

    case 'sign-off':
      await processSignOff(job);
      return { success: true };

    case 'mark-attendance':
      return processAttendance(job);

    default:
      throw new Error(`Unknown job name: "${job.name}"`);
  }
};

export const worker = new Worker('attendance', router, {
  connection: redis,
  concurrency: 20,
  limiter: { max: 100, duration: 1000 },
  // Stall recovery: after a crash, jobs locked as "active" are re-queued
  // once their lock expires. Tighter interval + higher count means faster
  // recovery and more retry chances before the job is moved to failed.
  lockDuration: 30000,     // job lock held for 30s while processing
  stalledInterval: 10000,  // check for stalled locks every 10s (default: 30s)
  maxStalledCount: 3,      // allow up to 3 stall recoveries before giving up
});

worker.on('completed', (job) => {
  console.log(`✅ Job ${job.id} (${job.name}) completed`);
});

worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} (${job?.name}) failed:`, err.message);
  if (job && job.attemptsMade >= 3) {
    console.error(`🚨 CRITICAL: Job ${job.id} exhausted retries — manual fix required`);
  }
});

worker.on('error', (err) => {
  console.error('❌ Worker connection error:', err);
});

worker.on('stalled', (jobId) => {
  console.warn(`⚠️  Job ${jobId} stalled — will be retried`);
});

// ── Notifications worker ('notifications' queue) ───────────────────────────────
// Handles 'send-whatsapp' and 'whatsapp-sweep' jobs.
// Separate Worker so message throughput limits never slow attendance processing.
// Meta Cloud API has per-number throughput tiers; conservative limit: 20/s.
const notificationsRouter = async (job: Job): Promise<void> => {
  switch (job.name) {
    case 'send-whatsapp':
      await processWhatsAppNotification(job);
      return;

    case 'whatsapp-sweep':
      await runWhatsAppSweep();
      return;

    case 'whatsapp-dispatch':
      await processWhatsAppDispatch();
      return;

    default:
      throw new Error(`Unknown notifications job name: "${job.name}"`);
  }
};

export const notificationsWorker = new Worker('notifications', notificationsRouter, {
  connection: redis,
  concurrency: 10,
  // TS: Meta limits messages per second per phone number — stay well under the tier ceiling
  limiter: { max: 20, duration: 1000 },
  lockDuration: 30000,
  stalledInterval: 10000,
  maxStalledCount: 3,
});

notificationsWorker.on('completed', (job) => {
  console.log(`✅ Notification job ${job.id} (${job.name}) completed`);
});

notificationsWorker.on('failed', (job, err) => {
  console.error(`❌ Notification job ${job?.id} (${job?.name}) failed:`, err.message);
  if (job && job.attemptsMade >= 5) {
    console.error(`🚨 CRITICAL: Notification job ${job.id} exhausted retries — outbox row stays 'failed'`);
  }
});

notificationsWorker.on('error', (err) => {
  console.error('❌ Notifications worker connection error:', err);
});

// ── Sweep: re-enqueue stuck pending/failed outbox rows ────────────────────────
// Runs on a 2-minute repeatable schedule (registered in scheduler.ts).
// Covers two gaps:
//   1. COMMIT succeeded but the Redis enqueue failed (row stays 'pending').
//   2. Worker process crashed mid-send — row stays 'sending'. Reset those to
//      'failed' after a grace period so the claim's WHERE clause can pick them up.
// Dedup is handled by the atomic claim (UPDATE WHERE status IN ('pending','failed'))
// inside the processor — NOT by a stable jobId here. Using a stable jobId would
// prevent re-enqueueing if the previous sweep job is still in BullMQ's completed
// set, silently stranding rows that keep failing.
const MAX_NOTIFICATION_ATTEMPTS = 5;
const SWEEP_CUTOFF_MS   = 2  * 60 * 1000; // rows older than 2 min get re-driven
const SENDING_GRACE_MS  = 5  * 60 * 1000; // 'sending' rows stuck > 5 min → crashed worker

async function runWhatsAppSweep(): Promise<void> {
  // Import here to avoid circular dep — db is a Pool available in the worker scope
  const { db } = await import('./db.js');
  const { notificationsQueue } = await import('./queues/notifications.js');

  const now = Date.now();
  const retryCutoff   = new Date(now - SWEEP_CUTOFF_MS).toISOString();
  const sendingCutoff = new Date(now - SENDING_GRACE_MS).toISOString();

  // Step 1: reset stale 'sending' rows (crashed worker recovery).
  // After SENDING_GRACE_MS with no completion, assume the worker died — move
  // back to 'failed' so the atomic claim can pick them up on the next enqueue.
  await db.query(
    `UPDATE whatsapp_notifications
     SET status = 'failed', last_error = 'processing_timeout_reset_by_sweep'
     WHERE status = 'sending' AND created_at < $1`,
    [sendingCutoff]
  );

  // Step 2: re-enqueue pending/failed rows older than the retry cutoff.
  // No jobId — the atomic claim inside the processor is the dedup fence.
  // removeOnComplete/removeOnFail on the queue means jobIds don't accumulate,
  // so omitting a stable id here is safe.
  const res = await db.query(
    `SELECT id FROM whatsapp_notifications
     WHERE status IN ('pending', 'failed')
       AND attempts < $1
       AND created_at < $2
     ORDER BY created_at ASC
     LIMIT 100`,
    [MAX_NOTIFICATION_ATTEMPTS, retryCutoff]
  );

  if (res.rows.length === 0) return;

  for (const row of res.rows) {
    await notificationsQueue.add('send-whatsapp', { outboxId: row.id });
  }
  console.log(`♻️  WhatsApp sweep: re-enqueued ${res.rows.length} row(s)`);
}
