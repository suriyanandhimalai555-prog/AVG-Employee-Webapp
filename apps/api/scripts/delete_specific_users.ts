// apps/api/scripts/delete_specific_users.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

/**
 * Deletes specific users by ID and cleans up their records
 */
async function deleteSpecificUsers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // IDs of users to delete
  const usersToDelete = [
    '6a522f5a-a42c-4549-9c3e-c9bbcd4e339f', // Admin Super
    'cc162f16-478e-4133-ae68-5db7794b2403', // HQ San Francisco Admin
  ];

  try {
    console.log('🔄 Deleting specific users and their records...');
    console.log('');

    // 1. Delete attendance_audit records for these users
    const auditResult = await pool.query(
      `DELETE FROM attendance_audit
       WHERE attendance_id IN (
         SELECT id FROM attendance WHERE user_id = ANY($1)
       )`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${auditResult.rowCount} audit records`);

    // 2. Delete attendance records
    const attendanceResult = await pool.query(
      `DELETE FROM attendance WHERE user_id = ANY($1)`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${attendanceResult.rowCount} attendance records`);

    // 3. Delete user_oversight_branches records
    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches WHERE user_id = ANY($1)`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${oversightResult.rowCount} oversight branch records`);

    // 4. Delete the users themselves
    const userResult = await pool.query(
      `DELETE FROM users WHERE id = ANY($1) RETURNING id, name`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${userResult.rowCount} users`);

    console.log('');
    console.log('Deleted users:');
    userResult.rows.forEach(u => console.log(`  - ${u.name} (${u.id})`));

  } catch (err) {
    console.error('❌ Delete failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteSpecificUsers();
