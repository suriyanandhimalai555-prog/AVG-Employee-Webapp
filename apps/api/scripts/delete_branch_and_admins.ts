// apps/api/scripts/delete_branch_and_admins.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

/**
 * Deletes the HQ San Francisco branch and its admin users
 */
async function deleteHQBranchAndAdmins() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Deleting HQ San Francisco branch and admin users...');
    console.log('');

    const branchToDelete = '8b261357-af77-4532-b67b-f52ace2db5f0'; // HQ San Francisco
    const usersToDelete = [
      '6a522f5a-a42c-4549-9c3e-c9bbcd4e339f', // Admin Super
      'cc162f16-478e-4133-ae68-5db7794b2403', // HQ San Francisco Admin
    ];

    // 1. Delete attendance_audit for users in this branch
    const auditResult = await pool.query(
      `DELETE FROM attendance_audit
       WHERE attendance_id IN (
         SELECT id FROM attendance WHERE user_id = ANY($1)
       )`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${auditResult.rowCount} audit records`);

    // 2. Delete attendance records for users in this branch
    const attendanceResult = await pool.query(
      `DELETE FROM attendance WHERE user_id = ANY($1)`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${attendanceResult.rowCount} attendance records`);

    // 3. Unlink the admin from the branch (set admin_id to NULL)
    const unlinkResult = await pool.query(
      `UPDATE branches SET admin_id = NULL WHERE admin_id = ANY($1)`,
      [usersToDelete]
    );
    console.log(`✅ Unlinked ${unlinkResult.rowCount} admins from branches`);

    // 4. Delete user_oversight_branches records
    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches WHERE user_id = ANY($1) OR branch_id = $2`,
      [usersToDelete, branchToDelete]
    );
    console.log(`✅ Deleted ${oversightResult.rowCount} oversight branch records`);

    // 5. Delete the users
    const userResult = await pool.query(
      `DELETE FROM users WHERE id = ANY($1) RETURNING id, name`,
      [usersToDelete]
    );
    console.log(`✅ Deleted ${userResult.rowCount} users`);

    // 6. Delete the branch
    const branchResult = await pool.query(
      `DELETE FROM branches WHERE id = $1 RETURNING id, name`,
      [branchToDelete]
    );
    console.log(`✅ Deleted branch: ${branchResult.rows[0]?.name} (${branchToDelete})`);

    console.log('');
    console.log('Deleted users:');
    userResult.rows.forEach(u => console.log(`  - ${u.name}`));

  } catch (err) {
    console.error('❌ Delete failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteHQBranchAndAdmins();
