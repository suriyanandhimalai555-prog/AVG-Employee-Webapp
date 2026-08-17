import { db } from '../db';
import { redis } from '../redis';

const DEACTIVATION_ROLES = ['abm', 'sales_officer', 'oa'];

// Master switch + threshold now live in app_settings (management-controlled).
// The worker can't import apps/api/src/shared, so it reads the keys inline —
// same pattern as whatsapp-dispatch.ts. Fallback keeps the sweep sane if a seed
// row is ever missing (mirrors AUTO_DEACTIVATION_DEFAULT_DAYS on the API side).
const AUTO_DEACTIVATION_ENABLED_KEY = 'auto_deactivation_enabled';
const AUTO_DEACTIVATION_THRESHOLD_KEY = 'auto_deactivation_threshold_days';
const DEFAULT_THRESHOLD_DAYS = 90;

const getISTDate = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/**
 * Runs once per day at 23:45 IST (after auto-absent finalises the day at 23:30).
 *
 * Deactivates ABM / Sales Officer / OA accounts that have had zero present,
 * half_day, or field attendance in the last <threshold> calendar days. Only
 * targets accounts that are still is_active = true — re-runs are safe (idempotent).
 *
 * The master switch (auto_deactivation_enabled) and the threshold in days
 * (auto_deactivation_threshold_days) are read fresh from app_settings each run,
 * so Management can pause the sweep or change the window without a redeploy.
 *
 * Accounts created fewer than <threshold> days ago are exempt so new joiners are
 * never immediately caught by this sweep.
 */
export const processAutoDeactivate = async (): Promise<void> => {
  const todayIST = getISTDate();

  // Master switch — read fresh; missing/false row means the feature is paused.
  const enabledRes = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [AUTO_DEACTIVATION_ENABLED_KEY]
  );
  if (enabledRes.rows[0]?.value !== true) {
    console.log('⏸️  Auto-deactivate: disabled by management toggle — skipping');
    return;
  }

  // Absence threshold in days — JSONB number arrives as a JS number; fall back
  // to the default if the seed is missing or holds a non-positive value.
  const thresholdRes = await db.query(
    `SELECT value FROM app_settings WHERE key = $1`,
    [AUTO_DEACTIVATION_THRESHOLD_KEY]
  );
  const rawThreshold = thresholdRes.rows[0]?.value;
  const thresholdDays =
    typeof rawThreshold === 'number' && rawThreshold > 0 ? rawThreshold : DEFAULT_THRESHOLD_DAYS;

  console.log(
    `🔄 Auto-deactivate: checking for chronic absentees (>${thresholdDays}d) on ${todayIST}`
  );

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
    [DEACTIVATION_ROLES, thresholdDays, todayIST]
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
             deactivation_reason = 'auto_absent'
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
