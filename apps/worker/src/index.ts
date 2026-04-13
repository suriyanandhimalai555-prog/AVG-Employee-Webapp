// apps/worker/src/index.ts
import { Worker, Job, Queue } from 'bullmq';
import IORedis from 'ioredis';
import pg, { Pool } from 'pg';
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

// Override pg DATE type parser — pg converts DATE columns to JS Date objects by default, which
// shifts the date back one day when the server runs in IST (+05:30) due to UTC conversion.
// Returning the raw string keeps '2026-04-04' as '2026-04-04' in all serialised job payloads.
pg.types.setTypeParser(1082, (val: string) => val);

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
// AUTO-ABSENT PROCESSOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Runs once daily at 23:30 IST — marks every active employee who has no attendance
// record for today as absent. ON CONFLICT DO NOTHING makes it safe to run multiple times.
const processAutoAbsent = async (): Promise<void> => {
  // IST date string (YYYY-MM-DD) without UTC shift — mirrors getCompanyToday() on the API
  const todayIST: string = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

  console.log(`🔄 Auto-absent: checking for unmarked employees on ${todayIST}`);

  // Select all active employees (excluding md and client) who have no record today.
  // branch_id may be NULL for Directors/GMs — that's expected and handled below.
  const missing = await db.query(
    `SELECT u.id, u.branch_id FROM users u
     WHERE u.is_active = true
       AND u.role NOT IN ('md', 'client')
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.user_id = u.id AND a.date = $1
       )`,
    [todayIST]
  );

  if (missing.rows.length === 0) {
    console.log('✅ Auto-absent: all employees already have records for today');
    return;
  }

  let markedCount = 0;
  let errorCount = 0;

  // Insert one absent record per missing employee; audit each insertion.
  // Each insert is wrapped in its own try/catch so a single failure
  // (e.g. FK constraint) never kills the loop for everyone else.
  for (const row of missing.rows as Array<{ id: string; branch_id: string | null }>) {
    try {
      // Skip if the Redis dupe-guard key exists — it means the employee already
      // submitted attendance but the BullMQ worker hasn't written to the DB yet.
      // Without this check, auto-absent wins the race and the real check-in is
      // silently dropped by ON CONFLICT DO NOTHING when the worker later processes it.
      const dupeKey: string = `att:${row.id}:${todayIST}`;
      const queued: number = await redis.exists(dupeKey);
      if (queued) {
        console.log(`⏭️  Auto-absent: skipping ${row.id} — check-in queued in Redis`);
        continue;
      }

      const insertResult = await db.query(
        `INSERT INTO attendance (user_id, branch_id, date, mode, status, marked_by, submitted_at)
         VALUES ($1, $2, $3, 'office', 'absent', $1, NOW())
         ON CONFLICT (user_id, date) DO NOTHING
         RETURNING id`,
        [row.id, row.branch_id, todayIST]
      );

      // Only audit if the row was actually inserted (not a race-condition duplicate)
      if (insertResult.rowCount && insertResult.rowCount > 0) {
        const attendanceId: string = insertResult.rows[0].id;
        await db.query(
          `INSERT INTO attendance_audit (attendance_id, changed_by, change_type, old_data, new_data)
           VALUES ($1, $2, 'auto_absent', NULL,
             (SELECT row_to_json(a) FROM attendance a WHERE a.id = $1))`,
          [attendanceId, row.id]
        );
        markedCount++;
      }
    } catch (err: any) {
      errorCount++;
      console.error(`❌ Auto-absent: failed to mark user ${row.id}:`, err.message);
    }
  }

  // Notify connected clients so dashboards refresh automatically
  await redis.publish('absent:marked', JSON.stringify({ date: todayIST, count: markedCount }));
  console.log(`✅ Auto-absent: marked ${markedCount} employees as absent for ${todayIST}${errorCount > 0 ? ` (${errorCount} errors)` : ''}`);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SIGN-OFF PROCESSOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const processSignOff = async (job: Job): Promise<void> => {
  console.log(`🔄 Processing sign-off job ${job.id} for user ${job.data.userId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // UPDATE only if check_out_time is still NULL — makes the write idempotent
    const updateResult = await client.query(
      `UPDATE attendance
       SET check_out_time = $1, check_out_lat = $2, check_out_lng = $3
       WHERE user_id = $4 AND date = $5 AND check_out_time IS NULL
       RETURNING id`,
      [
        job.data.checkOutTime,
        job.data.checkOutLat,
        job.data.checkOutLng,
        job.data.userId,
        job.data.date,
      ]
    );

    if (updateResult.rowCount && updateResult.rowCount > 0) {
      const attendanceId: string = updateResult.rows[0].id;

      // Audit the sign-off in the immutable audit table
      await client.query(
        `INSERT INTO attendance_audit (attendance_id, changed_by, change_type, old_data, new_data)
         VALUES (
           $1, $2, 'sign_off',
           (SELECT row_to_json(a) FROM attendance a WHERE a.id = $1),
           jsonb_build_object(
             'check_out_time', $3::text,
             'check_out_lat',  $4::float,
             'check_out_lng',  $5::float,
             'signed_off_by',  $6::text
           )
         )`,
        [
          attendanceId,
          job.data.signedOffBy,
          job.data.checkOutTime,
          job.data.checkOutLat,
          job.data.checkOutLng,
          job.data.signedOffBy,
        ]
      );

      console.log(`✅ Sign-off saved and audited for user ${job.data.userId}`);
    } else {
      console.log(`⏭️  Sign-off duplicate skipped for user ${job.data.userId} on ${job.data.date}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // Re-throw so BullMQ retries the job
  } finally {
    client.release();
  }

  // Publish sign-off confirmation to Redis pub/sub for Socket.io relay
  await redis.publish(
    'signoff:confirmed',
    JSON.stringify({
      userId: job.data.userId,
      date: job.data.date,
      jobId: job.id,
      signedOffBy: job.data.signedOffBy,
    })
  );

  console.log(`✅ Sign-off confirmation published for user ${job.data.userId}`);
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// JOB PROCESSOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const processAttendanceJob = async (job: Job): Promise<{ success: boolean }> => {
  // Route auto-absent scheduled jobs to their dedicated processor
  if (job.name === 'auto-absent') {
    await processAutoAbsent();
    return { success: true };
  }

  // Route sign-off jobs to their dedicated processor
  if (job.name === 'sign-off') {
    await processSignOff(job);
    return { success: true };
  }
  console.log(`🔄 Processing attendance job ${job.id} for user ${job.data.userId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // Write to PostgreSQL.
    // ON CONFLICT DO UPDATE WHERE status = 'absent' means:
    //   - Fresh insert → always writes (no conflict)
    //   - Conflict with an auto-absent record → overwrites it with the real check-in (layer 2 safety net)
    //   - Conflict with an existing present/field record → DO NOTHING (true duplicate, safe to skip)
    // This ensures a real check-in always wins over auto-absent regardless of timing.
    const insertResult = await client.query(
      `INSERT INTO attendance (
        user_id, branch_id, date, mode, status,
        check_in_time, check_in_lat, check_in_lng,
        photo_key, field_note, marked_by, submitted_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()
      )
      ON CONFLICT (user_id, date) DO UPDATE SET
        status        = EXCLUDED.status,
        mode          = EXCLUDED.mode,
        check_in_time = EXCLUDED.check_in_time,
        check_in_lat  = EXCLUDED.check_in_lat,
        check_in_lng  = EXCLUDED.check_in_lng,
        photo_key     = EXCLUDED.photo_key,
        field_note    = EXCLUDED.field_note,
        marked_by     = EXCLUDED.marked_by,
        submitted_at  = EXCLUDED.submitted_at
      WHERE attendance.status = 'absent'
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

    // rowCount > 0 means either a fresh insert OR an absent-record overwrite — audit both
    if (insertResult.rowCount && insertResult.rowCount > 0) {
      const attendanceId = insertResult.rows[0].id;

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

// Separate Queue instance used only to register the repeatable auto-absent job on startup.
// The Worker above processes all jobs from the same 'attendance' queue.
const schedulerQueue = new Queue('attendance', { connection: redis });

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

    // Register the daily auto-absent repeatable job (23:30 IST = 18:00 UTC).
    // BullMQ deduplicates by jobId so restarting the worker never creates duplicates.
    await schedulerQueue.add('auto-absent', {}, {
      repeat: { pattern: '0 18 * * *' },
      jobId: 'auto-absent-daily',
    });
    console.log('✅ Auto-absent job scheduled (23:30 IST daily)');
    console.log('✅ Attendance worker started (Waiting for jobs...)');
  } catch (err) {
    console.error('❌ Worker startup failed:', err);
    process.exit(1);
  }
})();

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
