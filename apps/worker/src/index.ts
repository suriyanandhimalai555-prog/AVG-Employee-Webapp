// apps/worker/src/index.ts
import { Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LAYERED ENV LOADING & VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// 1. Load local overrides (.env in apps/worker/)
dotenv.config();

// 2. Load shared defaults (.env in the root)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// 3. Strict Zod validation for worker environment variables
const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ CRITICAL: Invalid worker environment variables:');
  console.error(JSON.stringify(parsed.error.format(), null, 2));
  process.exit(1);
}

const env = parsed.data;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONNECTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Create a PostgreSQL connection pool with max 30 connections for worker throughput
const db = new Pool({
  connectionString: env.DATABASE_URL,
  max: 30,
});

// Create a Redis connection for BullMQ with required settings
const redis = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Required by BullMQ to prevent connection recursion errors
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOB PROCESSOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const processAttendanceJob = async (job: Job): Promise<{ success: boolean }> => {
  console.log(`🔄 Processing attendance job ${job.id} for user ${job.data.userId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Write to PostgreSQL with idempotency (ON CONFLICT DO NOTHING)
    const insertResult = await client.query(
      `INSERT INTO attendance (
        user_id, branch_id, date, mode, status,
        check_in_time, check_in_lat, check_in_lng,
        photo_key, field_note, marked_by, submitted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      )
      ON CONFLICT (user_id, date) DO NOTHING
      RETURNING id`,
      [
        job.data.userId,
        job.data.branchId,
        job.data.date,
        job.data.mode,
        job.data.status,
        job.data.checkInTime,
        job.data.checkInLat ?? null,
        job.data.checkInLng ?? null,
        job.data.photoKey ?? null,
        job.data.fieldNote ?? null,
        job.data.markedBy,
      ]
    );

    // Only log to audit if a new row was actually inserted (not a duplicate)
    if (insertResult.rowCount && insertResult.rowCount > 0) {
      const attendanceId = insertResult.rows[0].id;

      // Log the initial check-in to the immutable audit table
      await client.query(
        `INSERT INTO attendance_audit (
          attendance_id, changed_by, change_type, old_data, new_data
        ) VALUES (
          $1, $2, 'initial_mark', NULL,
          (SELECT row_to_json(a) FROM attendance a WHERE a.id = $1)
        )`,
        [attendanceId, job.data.markedBy]
      );

      console.log(`✅ Attendance saved and audited for user ${job.data.userId}`);
    } else {
      console.log(`⏭️  Duplicate job skipped for user ${job.data.userId} on ${job.data.date}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // Re-throw so BullMQ retries the job
  } finally {
    client.release();
  }

  // Publish confirmation event to Redis Pub/Sub for real-time API updates
  await redis.publish(
    'attendance:confirmed',
    JSON.stringify({
      userId: job.data.userId,
      date: job.data.date,
      status: job.data.status,
      jobId: job.id,
      // Include markedBy so the socket layer can also notify the admin who marked on behalf of someone else
      markedBy: job.data.markedBy,
    })
  );

  console.log(`✅ Confirmation published for user ${job.data.userId}`);
  return { success: true };
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BULLMQ WORKER SETUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const worker = new Worker(
  'attendance',
  processAttendanceJob,
  {
    connection: redis,
    concurrency: 20,
    limiter: {
      max: 100,
      duration: 1000,
    },
  }
);

// Worker Lifecycle Logging
worker.on('completed', (job) => console.log(`✅ Job ${job.id} completed`));
worker.on('failed', (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
  if (job && job.attemptsMade >= 3) {
    console.error(`🚨 CRITICAL: Job ${job.id} exhausted retries (Manual Fix Required)`);
  }
});
worker.on('error', (err) => console.error('❌ Worker connection error:', err));
worker.on('stalled', (jobId) => console.warn(`⚠️ Job ${jobId} stalled — retrying...`));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// STARTUP & SHUTDOWN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(async () => {
  try {
    await db.query('SELECT 1');
    console.log('✅ Worker DB connected');
    await redis.ping();
    console.log('✅ Worker Redis connected');
    console.log('✅ Attendance worker started (Waiting for jobs...)');
  } catch (err) {
    console.error('❌ Worker startup failed:', err);
    process.exit(1);
  }
})();

const shutdown = async (): Promise<void> => {
  console.log('🔄 Worker shutting down gracefully...');
  await worker.close();
  await db.end();
  redis.disconnect();
  console.log('✅ Worker shut down complete');
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
