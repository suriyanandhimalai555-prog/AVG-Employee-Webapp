// apps/worker/src/index.ts — bootstrap only.
// Business logic lives in processors/*; infrastructure in db.ts / redis.ts / scheduler.ts.
import './config/env'; // validate env before anything else
import { db } from './db';
import { redis } from './redis';
import { worker } from './worker';
import { schedulerQueue, registerScheduledJobs, recoverFailedAttendanceJobs } from './scheduler';

/**
 * Wait for DB and Redis to be reachable before proceeding.
 *
 * Railway can restart a service before its dependencies (PgBouncer, Redis) are
 * fully ready. Without retries the worker would crash immediately, Railway would
 * restart it, and any job that was picked up during that brief window would stall
 * → retry → eventually fail permanently. Ten attempts with linear back-off gives
 * dependencies up to ~55 seconds to become available.
 */
const waitForDependencies = async (): Promise<void> => {
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await db.query('SELECT 1');
      await redis.ping();
      console.log('✅ Worker DB + Redis connected');
      return;
    } catch (err) {
      if (attempt === 10) {
        throw new Error(`Dependencies unavailable after 10 attempts: ${(err as Error).message}`);
      }
      const wait = attempt * 1000;
      console.warn(`⏳ Dependency check failed (attempt ${attempt}/10) — retrying in ${wait}ms...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
};

const startup = async (): Promise<void> => {
  await waitForDependencies();

  await registerScheduledJobs();

  // Re-queue any mark-attendance jobs that failed because the worker crashed
  // during a previous startup before this job could be processed.
  await recoverFailedAttendanceJobs();

  console.log('✅ Attendance worker started — waiting for jobs...');
};

const shutdown = async (): Promise<void> => {
  console.log('🔄 Worker shutting down gracefully...');
  await schedulerQueue.close();
  await worker.close();
  await db.end();
  redis.disconnect();
  console.log('✅ Worker shut down complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

startup().catch((err) => {
  console.error('❌ Worker startup failed:', err);
  process.exit(1);
});
