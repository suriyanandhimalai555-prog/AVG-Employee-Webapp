import { Job } from 'bullmq';
import { db } from '../db';
import { redis } from '../redis';

/**
 * Persists a sign-off (check-out) for a given attendance record.
 *
 * The UPDATE is guarded by `check_out_time IS NULL` so duplicate job
 * deliveries are safe — only the first write lands.
 *
 * Uses a transaction so the audit row is always consistent with the
 * attendance row; a failure rolls back both and BullMQ retries the job.
 */
export const processSignOff = async (job: Job): Promise<void> => {
  console.log(`🔄 Sign-off job ${job.id} — user ${job.data.userId}`);

  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const updateResult = await client.query(
      `UPDATE attendance
       SET check_out_time = $1,
           check_out_lat  = $2,
           check_out_lng  = $3
       WHERE user_id = $4
         AND date = $5
         AND check_out_time IS NULL
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

      console.log(`✅ Sign-off saved for user ${job.data.userId}`);
    } else {
      console.log(`⏭️  Sign-off duplicate skipped — user ${job.data.userId} on ${job.data.date}`);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err; // re-throw so BullMQ retries
  } finally {
    client.release();
  }

  await redis.publish(
    'signoff:confirmed',
    JSON.stringify({
      userId: job.data.userId,
      date: job.data.date,
      jobId: job.id,
      signedOffBy: job.data.signedOffBy,
    })
  );
};
