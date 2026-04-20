// apps/worker/src/index.ts — bootstrap only.
// Business logic lives in processors/*; infrastructure in db.ts / redis.ts / scheduler.ts.
import './config/env'; // validate env before anything else
import { db } from './db';
import { redis } from './redis';
import { worker } from './worker';
import { schedulerQueue, registerScheduledJobs } from './scheduler';

const startup = async (): Promise<void> => {
  await db.query('SELECT 1');
  console.log('✅ Worker DB connected');

  await redis.ping();
  console.log('✅ Worker Redis connected');

  await registerScheduledJobs();

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
