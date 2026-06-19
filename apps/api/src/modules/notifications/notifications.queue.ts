// BullMQ producer for the 'notifications' queue.
//
// Mirrors the attendance.queue.ts pattern exactly — a typed Queue instance
// and a fire-and-forget enqueue helper.  The worker side (apps/worker) has
// its own Queue instance pointing at the same Redis connection.
//
// addNotificationJob is called AFTER a scheme transaction COMMITs — it carries
// only the outbox row id; the worker fetches all details fresh from the DB.
// This keeps job payloads tiny and avoids stale-data races.
import { Queue } from 'bullmq';
// TS: shared Redis client — same pool used by the attendance queue
import redis from '../../config/redis';

// ── Job data shape ─────────────────────────────────────────────────────────────
// TS: small payload — the outbox row id is all the worker needs
export interface NotificationJobData {
  // TS: UUID of the whatsapp_notifications row to process
  outboxId: string;
}

// ── Queue instance ─────────────────────────────────────────────────────────────
// Separate queue from 'attendance' — message surges never throttle attendance
// processing and vice versa.
export const notificationsQueue = new Queue<NotificationJobData>('notifications', {
  connection: redis,
  defaultJobOptions: {
    // TS: 5 attempts with exponential backoff gives the Meta API time to recover
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 5000,   // 5s → 10s → 20s → 40s → 80s
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});

// ── Producer helper ────────────────────────────────────────────────────────────

/**
 * Enqueue a WhatsApp send job after a scheme transaction commits.
 *
 * Non-throwing: a Redis failure here is non-fatal because the scheduler sweep
 * will re-enqueue any pending/failed outbox rows older than 2 minutes.
 * The caller should wrap in try/catch and log — never await inside a transaction.
 */
export const addNotificationJob = async (outboxId: string): Promise<void> => {
  await notificationsQueue.add('send-whatsapp', { outboxId });
  console.log(`📱 WhatsApp notification job queued for outbox: ${outboxId}`);
};

export default notificationsQueue;
