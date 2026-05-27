import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

async function deleteUserByEmail() {
  const email = process.argv[2];
  if (!email) {
    console.error('❌ Usage: npx ts-node --esm scripts/delete_user_by_email.ts <email>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('BEGIN');

    const targetUser = await pool.query<{ id: string; name: string; role: string }>(
      `SELECT id, name, role FROM users WHERE email = $1`,
      [email]
    );

    if (targetUser.rows.length === 0) {
      throw new Error(`User not found with email: ${email}`);
    }

    const userId = targetUser.rows[0].id;
    console.log(`🔍 Found user: ${targetUser.rows[0].name} (${targetUser.rows[0].role}) ID: ${userId}`);

    // 1. Delete Attendance Audits
    const attendanceAuditResult = await pool.query(
      `DELETE FROM attendance_audit
       WHERE changed_by = $1
          OR attendance_id IN (
            SELECT id FROM attendance
            WHERE user_id = $1 OR marked_by = $1 OR corrected_by = $1
          )`,
      [userId]
    );

    // 2. Delete Attendance Records
    const attendanceResult = await pool.query(
      `DELETE FROM attendance
       WHERE user_id = $1 OR marked_by = $1 OR corrected_by = $1`,
      [userId]
    );

    // 3. Delete Transaction Audits
    const transactionAuditResult = await pool.query(
      `DELETE FROM transaction_audit
       WHERE changed_by = $1
          OR transaction_id IN (
            SELECT id FROM transactions
            WHERE sender_id = $1 OR receiver_id = $1
          )`,
      [userId]
    );

    // 4. Delete Transactions
    const transactionsResult = await pool.query(
      `DELETE FROM transactions
       WHERE sender_id = $1 OR receiver_id = $1`,
      [userId]
    );

    // 5. Delete Messages
    // const messagesResult = await pool.query(
    //   `DELETE FROM messages
    //    WHERE sender_id = $1 OR recipient_id = $1`,
    //   [userId]
    // );

    // 6. Delete Money Collections (including both submitter and verifier)
    const collectionsResult = await pool.query(
      `DELETE FROM money_collections
       WHERE user_id = $1 OR assigned_verifier_id = $1`,
      [userId]
    );

    // 7. Delete Oversight Links
    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches
       WHERE user_id = $1`,
      [userId]
    );

    // 8. Unlink from Branches (if user was GM or Admin)
    const branchUnlinkResult = await pool.query(
      `UPDATE branches
       SET gm_id = NULL, admin_id = NULL
       WHERE gm_id = $1 OR admin_id = $1`,
      [userId]
    );

    // 10. Unlink from subordinate users
    const managerUnlinkResult = await pool.query(
      `UPDATE users
       SET manager_id = NULL
       WHERE manager_id = $1`,
      [userId]
    );

    // 11. Final Deletion of User
    const userDeleteResult = await pool.query(
      `DELETE FROM users
       WHERE id = $1
       RETURNING id, name, role`,
      [userId]
    );

    await pool.query('COMMIT');

    const deleted = userDeleteResult.rows[0];
    console.log('✅ User purge completed successfully');
    console.log(`   User: ${deleted.name} (${deleted.role}) ${deleted.id}`);
    console.log(`   attendance_audit: ${attendanceAuditResult.rowCount}`);
    console.log(`   attendance: ${attendanceResult.rowCount}`);
    console.log(`   transaction_audit: ${transactionAuditResult.rowCount}`);
    console.log(`   transactions: ${transactionsResult.rowCount}`);
    console.log(`   money_collections: ${collectionsResult.rowCount}`);
    console.log(`   oversight links: ${oversightResult.rowCount}`);
    console.log(`   branch unlink rows: ${branchUnlinkResult.rowCount}`);
    console.log(`   subordinate manager unlink rows: ${managerUnlinkResult.rowCount}`);
    
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Purge failed:', error instanceof Error ? error.message : error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteUserByEmail();
