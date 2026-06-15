import { Job } from 'bullmq';
import { db } from '../db';
import { redis } from '../redis';

/**
 * Writes a queued attendance check-in to Postgres.
 *
 * ON CONFLICT semantics:
 *   - No existing row       → clean insert
 *   - Existing absent row   → overwrite (real check-in beats auto-absent)
 *   - Existing present/field → DO NOTHING (true duplicate, already processed)
 *
 * Always wrapped in a transaction so the audit row stays consistent.
 * Throws on failure so BullMQ can retry with exponential backoff.
 */
export const processAttendance = async (job: Job): Promise<{ success: boolean }> => {
  console.log(`🔄 Attendance job ${job.id} — user ${job.data.userId}`);

  // TS: hoisted so the redis.publish() below (outside try/catch) can read the value
  // set inside the try block. Defaults to false — overwritten after the INSERT result.
  let isDuplicate = false;

  const client = await db.connect();
  try {
    await client.query('BEGIN');

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
        job.data.checkInLat  ?? null,
        job.data.checkInLng  ?? null,
        job.data.photoKey    ?? null,
        job.data.fieldNote   ?? null,
        job.data.markedBy,
      ]
    );

    // TS: assign to the outer-scoped isDuplicate so redis.publish() can read it after
    // the try/finally block. True when ON CONFLICT fired but the WHERE status='absent'
    // guard prevented the update — row already present and non-absent, nothing written.
    isDuplicate = !insertResult.rowCount || insertResult.rowCount === 0;

    if (!isDuplicate) {
      const attendanceId: string = insertResult.rows[0].id;
      await client.query(
        `INSERT INTO attendance_audit (attendance_id, changed_by, change_type, old_data, new_data)
         VALUES ($1, $2, 'initial_mark', NULL,
           (SELECT row_to_json(a) FROM attendance a WHERE a.id = $1))`,
        [attendanceId, job.data.markedBy]
      );
      console.log(`✅ Attendance saved for user ${job.data.userId}`);
    } else {
      console.log(`⏭️  Duplicate skipped — user ${job.data.userId} on ${job.data.date}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await redis.publish(
    'attendance:confirmed',
    JSON.stringify({
      userId:    job.data.userId,
      date:      job.data.date,
      status:    job.data.status,
      jobId:     job.id,
      markedBy:  job.data.markedBy,
      // Socket.io passes this to the frontend; both fresh write and duplicate no-op show
      // a green checkmark, but the client can differentiate if needed (e.g. analytics).
      duplicate: isDuplicate,
    })
  );

  return { success: true };
};
