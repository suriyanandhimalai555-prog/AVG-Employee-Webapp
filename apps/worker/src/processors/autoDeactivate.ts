import { db } from '../db';
import { redis } from '../redis';

const DEACTIVATION_ROLES = ['abm', 'sales_officer', 'oa'];
const ABSENCE_THRESHOLD_DAYS = 60;

const getISTDate = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * Runs once per day at 23:45 IST (after auto-absent finalises the day at 23:30).
 *
 * Deactivates ABM / Sales Officer / OA accounts that have had zero present,
 * half_day, or field attendance in the last 60 calendar days. Only targets
 * accounts that are still is_active = true — re-runs are safe (idempotent).
 *
 * Accounts created fewer than ABSENCE_THRESHOLD_DAYS ago are exempt so new
 * joiners are never immediately caught by this sweep.
 */
export const processAutoDeactivate = async (): Promise<void> => {
  const todayIST = getISTDate();
  console.log(`🔄 Auto-deactivate: checking for chronic absentees on ${todayIST}`);

  const candidates = await db.query<{ id: string; name: string; role: string }>(
    `SELECT u.id, u.name, u.role
     FROM users u
     WHERE u.is_active = true
       AND u.role = ANY($1::text[])
       AND u.created_at < NOW() - ($2 || ' days')::INTERVAL
       AND NOT EXISTS (
         SELECT 1 FROM attendance a
         WHERE a.user_id = u.id
           AND a.date >= ($3::date - ($2 - 1) * INTERVAL '1 day')
           AND a.status IN ('present', 'half_day', 'field')
       )`,
    [DEACTIVATION_ROLES, ABSENCE_THRESHOLD_DAYS, todayIST]
  );

  if (candidates.rows.length === 0) {
    console.log('✅ Auto-deactivate: no chronic absentees found');
    return;
  }

  let deactivatedCount = 0;
  let errorCount = 0;

  for (const user of candidates.rows) {
    try {
      const result = await db.query(
        `UPDATE users
         SET is_active           = false,
             deactivated_at      = NOW(),
             deactivation_reason = 'auto_absent_60d'
         WHERE id = $1 AND is_active = true
         RETURNING id`,
        [user.id]
      );
      if (result.rowCount && result.rowCount > 0) {
        deactivatedCount++;
        console.log(`🔒 Auto-deactivated: ${user.name} (${user.role}) [${user.id}]`);
      }
    } catch (err: any) {
      errorCount++;
      console.error(`❌ Auto-deactivate: failed for user ${user.id}:`, err.message);
    }
  }

  await redis.publish('users:deactivated', JSON.stringify({ date: todayIST, count: deactivatedCount }));
  console.log(
    `✅ Auto-deactivate: ${deactivatedCount} account(s) deactivated` +
    (errorCount > 0 ? ` (${errorCount} errors)` : '')
  );
};
