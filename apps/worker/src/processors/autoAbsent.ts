import { db } from '../db';
import { redis } from '../redis';

// Returns today's date as YYYY-MM-DD in IST — matches getCompanyToday() on the API.
const getISTDate = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * Runs once per day at 23:30 IST.
 *
 * Finds every active non-MD/non-client employee who has no attendance record
 * for today and inserts an absent row. Each insert is guarded by:
 *   1. A Redis key check — skips users whose check-in is queued but not yet
 *      written to Postgres, preventing auto-absent from racing the worker.
 *   2. ON CONFLICT DO NOTHING — safe to run multiple times.
 *
 * Each successful insert is immediately audited in attendance_audit.
 */
export const processAutoAbsent = async (): Promise<void> => {
  const todayIST = getISTDate();
  console.log(`🔄 Auto-absent: checking for unmarked employees on ${todayIST}`);

  const missing = await db.query<{ id: string; branch_id: string | null }>(
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

  for (const row of missing.rows) {
    try {
      // Skip if a real check-in is already queued in Redis but not yet persisted.
      const queued = await redis.exists(`att:${row.id}:${todayIST}`);
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
      console.error(`❌ Auto-absent: failed for user ${row.id}:`, err.message);
    }
  }

  await redis.publish('absent:marked', JSON.stringify({ date: todayIST, count: markedCount }));
  console.log(
    `✅ Auto-absent: marked ${markedCount} employees absent for ${todayIST}` +
    (errorCount > 0 ? ` (${errorCount} errors)` : '')
  );
};
