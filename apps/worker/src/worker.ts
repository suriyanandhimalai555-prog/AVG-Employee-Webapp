import { Worker, Job } from 'bullmq';
import { redis } from './redis';
import { processAttendance } from './processors/attendance';
import { processSignOff } from './processors/signOff';
import { processAutoAbsent } from './processors/autoAbsent';
import { processAutoDeactivate } from './processors/autoDeactivate';

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
