import { Queue } from 'bullmq';
import { redis } from './redis';

// Separate Queue instance — used for registering repeatable jobs and recovery.
// The Worker instance in worker.ts processes all jobs from this same queue.
export const schedulerQueue = new Queue('attendance', { connection: redis });

// TS: separate queue for notification-related repeatable jobs (sweep)
export const notificationsSchedulerQueue = new Queue('notifications', { connection: redis });

const REPEATABLE_JOB_NAMES         = new Set(['auto-absent', 'auto-deactivate']);
const NOTIFICATION_REPEATABLE_NAMES = new Set(['whatsapp-sweep']);

/**
 * Removes any stale repeatable jobs from prior deployments and registers
 * the canonical schedules.
 *
 * BullMQ keys repeatable jobs by (name + cron + jobId). Changing the cron
 * expression produces a new key while leaving old timestamps in the delayed
 * set — causing double-fires. Purging first ensures exactly one schedule.
 */
export const registerScheduledJobs = async (): Promise<void> => {
  const existing = await schedulerQueue.getRepeatableJobs();
  for (const job of existing) {
    if (REPEATABLE_JOB_NAMES.has(job.name)) {
      await schedulerQueue.removeRepeatableByKey(job.key);
      console.log(`🧹 Removed stale repeatable job: ${job.key}`);
    }
  }

  // 23:30 IST — mark all unmarked employees absent for the day
  await schedulerQueue.add('auto-absent', {}, {
    repeat: { pattern: '30 23 * * *', tz: 'Asia/Kolkata' },
    jobId:  'auto-absent-daily',
  });
  console.log('✅ Scheduled: auto-absent at 23:30 IST daily');

  // 23:45 IST — deactivate chronic absentees (after absent sweep finalises)
  await schedulerQueue.add('auto-deactivate', {}, {
    repeat: { pattern: '45 23 * * *', tz: 'Asia/Kolkata' },
    jobId:  'auto-deactivate-daily',
  });
  console.log('✅ Scheduled: auto-deactivate at 23:45 IST daily');

  // ── WhatsApp sweep: re-enqueue stuck pending/failed outbox rows ──────────────
  // Purge stale schedules first (same pattern as above)
  const existingNotifJobs = await notificationsSchedulerQueue.getRepeatableJobs();
  for (const job of existingNotifJobs) {
    if (NOTIFICATION_REPEATABLE_NAMES.has(job.name)) {
      await notificationsSchedulerQueue.removeRepeatableByKey(job.key);
      console.log(`🧹 Removed stale notification repeatable job: ${job.key}`);
    }
  }

  // Every 2 minutes — recovers rows where COMMIT succeeded but enqueue failed
  await notificationsSchedulerQueue.add('whatsapp-sweep', {}, {
    repeat: { every: 2 * 60 * 1000 },   // TS: every = ms interval
    jobId:  'whatsapp-sweep-recurring',
  });
  console.log('✅ Scheduled: whatsapp-sweep every 2 minutes');
};

/**
 * On every worker restart, scan for failed mark-attendance jobs from the last
 * 24 hours and re-queue them. This covers the case where the worker crashed
 * mid-startup (job went active → stalled → failed) while a user had already
 * submitted attendance — the Redis key shows "checked in" but DB has no row.
 *
 * Safe to retry: the processor's ON CONFLICT clause is idempotent — a duplicate
 * job writes nothing if a present/half_day row already exists.
 */
export const recoverFailedAttendanceJobs = async (): Promise<void> => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // only today's jobs
  const failedJobs = await schedulerQueue.getFailed(0, 500);

  let recovered = 0;
  for (const job of failedJobs) {
    if (job.name === 'mark-attendance' && (job.timestamp ?? 0) > cutoff) {
      await job.retry();
      recovered++;
      console.log(`♻️  Recovered failed attendance job ${job.id} — user ${job.data?.userId}`);
    }
  }

  if (recovered > 0) {
    console.log(`✅ Startup recovery: ${recovered} attendance job(s) re-queued`);
  } else {
    console.log('✅ Startup recovery: no failed attendance jobs to recover');
  }
};
