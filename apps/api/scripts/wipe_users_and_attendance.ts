// apps/api/scripts/wipe_users_and_attendance.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

/**
 * ⚠️  DESTRUCTIVE: Wipes all users except branch_admin and md roles.
 * Also wipes ALL attendance and attendance_audit records.
 *
 * This is useful for resetting dev/test databases.
 */
async function wipeUsersAndAttendance() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('⚠️  WARNING: This will DELETE all users except branch_admin and md');
    console.log('⚠️  WARNING: This will DELETE all attendance records');
    console.log('');

    // Safety check — only run if NODE_ENV is set and not production
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ BLOCKED: Cannot run wipe script in production');
      process.exit(1);
    }

    console.log('🔄 Wiping data...');
    console.log('');

    // 1. Delete all attendance_audit records (foreign key refs attendance)
    const auditResult = await pool.query(
      `DELETE FROM attendance_audit`
    );
    console.log(`✅ Deleted ${auditResult.rowCount} attendance audit records`);

    // 2. Delete all attendance records
    const attendanceResult = await pool.query(
      `DELETE FROM attendance`
    );
    console.log(`✅ Deleted ${attendanceResult.rowCount} attendance records`);

    // 3. Delete all users EXCEPT branch_admin and md
    // Also preserve user_oversight_branches referential integrity
    const userResult = await pool.query(
      `DELETE FROM users
       WHERE role NOT IN ('branch_admin', 'md')`
    );
    console.log(`✅ Deleted ${userResult.rowCount} users (kept branch_admin and md)`);

    // 4. Clean up orphaned user_oversight_branches if any
    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches
       WHERE user_id NOT IN (SELECT id FROM users)`
    );
    console.log(`✅ Deleted ${oversightResult.rowCount} orphaned oversight branch records`);

    console.log('');
    console.log('✅ Wipe complete!');
    console.log('');
    console.log('Summary:');
    console.log(`  - Attendance records: ${attendanceResult.rowCount} deleted`);
    console.log(`  - Audit records: ${auditResult.rowCount} deleted`);
    console.log(`  - Users: ${userResult.rowCount} deleted`);
    console.log(`  - Orphaned oversight records: ${oversightResult.rowCount} deleted`);
    console.log('');
    console.log('Preserved:');
    const preserved = await pool.query(
      `SELECT COUNT(*), role FROM users GROUP BY role`
    );
    for (const row of preserved.rows) {
      console.log(`  - ${row.role}: ${row.count}`);
    }
  } catch (err) {
    console.error('❌ Wipe failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

wipeUsersAndAttendance();
