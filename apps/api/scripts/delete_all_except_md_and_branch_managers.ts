import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

async function deleteAllExceptMdAndBranchManagers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('BEGIN');

    const usersToKeep = await pool.query<{ id: string; role: string }>(
      `SELECT id, role
       FROM users
       WHERE role IN ('md', 'branch_manager')`
    );
    const keepIds = usersToKeep.rows.map((r) => r.id);

    const usersToDelete = await pool.query<{ id: string; name: string; role: string }>(
      `SELECT id, name, role
       FROM users
       WHERE role NOT IN ('md', 'branch_manager')`
    );
    const deleteIds = usersToDelete.rows.map((r) => r.id);

    if (deleteIds.length === 0) {
      await pool.query('ROLLBACK');
      console.log('ℹ️ No users to delete. Only md/branch_manager users exist.');
      return;
    }

    const attendanceAuditResult = await pool.query(
      `DELETE FROM attendance_audit
       WHERE changed_by = ANY($1::uuid[])
          OR attendance_id IN (
            SELECT id
            FROM attendance
            WHERE user_id = ANY($1::uuid[])
               OR marked_by = ANY($1::uuid[])
               OR corrected_by = ANY($1::uuid[])
          )`,
      [deleteIds]
    );

    const attendanceResult = await pool.query(
      `DELETE FROM attendance
       WHERE user_id = ANY($1::uuid[])
          OR marked_by = ANY($1::uuid[])
          OR corrected_by = ANY($1::uuid[])`,
      [deleteIds]
    );

    const transactionAuditResult = await pool.query(
      `DELETE FROM transaction_audit
       WHERE changed_by = ANY($1::uuid[])
          OR transaction_id IN (
            SELECT id
            FROM transactions
            WHERE sender_id = ANY($1::uuid[])
               OR receiver_id = ANY($1::uuid[])
          )`,
      [deleteIds]
    );

    const transactionsResult = await pool.query(
      `DELETE FROM transactions
       WHERE sender_id = ANY($1::uuid[])
          OR receiver_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const messagesResult = await pool.query(
      `DELETE FROM messages
       WHERE sender_id = ANY($1::uuid[])
          OR recipient_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches
       WHERE user_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const gmDirectorLinksResult = await pool.query(
      `DELETE FROM gm_director_links
       WHERE gm_id = ANY($1::uuid[])
          OR director_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const branchUnlinkResult = await pool.query(
      `UPDATE branches
       SET gm_id = NULL, admin_id = NULL
       WHERE gm_id = ANY($1::uuid[])
          OR admin_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const managerUnlinkResult = await pool.query(
      `UPDATE users
       SET manager_id = NULL
       WHERE manager_id = ANY($1::uuid[])`,
      [deleteIds]
    );

    const usersDeleteResult = await pool.query(
      `DELETE FROM users
       WHERE id = ANY($1::uuid[])
       RETURNING id, name, role`,
      [deleteIds]
    );

    await pool.query('COMMIT');

    console.log('✅ Purge completed (kept only md + branch_manager users)');
    console.log(`   kept users: ${keepIds.length}`);
    console.log(`   deleted users: ${usersDeleteResult.rowCount}`);
    console.log(`   attendance_audit: ${attendanceAuditResult.rowCount}`);
    console.log(`   attendance: ${attendanceResult.rowCount}`);
    console.log(`   transaction_audit: ${transactionAuditResult.rowCount}`);
    console.log(`   transactions: ${transactionsResult.rowCount}`);
    console.log(`   messages: ${messagesResult.rowCount}`);
    console.log(`   oversight links: ${oversightResult.rowCount}`);
    console.log(`   gm-director links: ${gmDirectorLinksResult.rowCount}`);
    console.log(`   branch unlink rows: ${branchUnlinkResult.rowCount}`);
    console.log(`   manager unlink rows: ${managerUnlinkResult.rowCount}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Delete failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteAllExceptMdAndBranchManagers();
