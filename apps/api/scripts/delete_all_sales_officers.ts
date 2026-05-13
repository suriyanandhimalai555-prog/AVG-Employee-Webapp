import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

async function deleteAllSalesOfficers() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('BEGIN');

    const salesOfficersResult = await pool.query<{ id: string; name: string }>(
      `SELECT id, name
       FROM users
       WHERE role = 'sales_officer'`
    );
    const ids = salesOfficersResult.rows.map((r) => r.id);

    if (ids.length === 0) {
      await pool.query('ROLLBACK');
      console.log('ℹ️ No sales officers found. Nothing to delete.');
      return;
    }

    const attendanceAuditResult = await pool.query(
      `DELETE FROM attendance_audit
       WHERE changed_by = ANY($1::uuid[])
          OR attendance_id IN (
            SELECT id FROM attendance
            WHERE user_id = ANY($1::uuid[])
               OR marked_by = ANY($1::uuid[])
               OR corrected_by = ANY($1::uuid[])
          )`,
      [ids]
    );

    const attendanceResult = await pool.query(
      `DELETE FROM attendance
       WHERE user_id = ANY($1::uuid[])
          OR marked_by = ANY($1::uuid[])
          OR corrected_by = ANY($1::uuid[])`,
      [ids]
    );

    const transactionAuditResult = await pool.query(
      `DELETE FROM transaction_audit
       WHERE changed_by = ANY($1::uuid[])
          OR transaction_id IN (
            SELECT id FROM transactions
            WHERE sender_id = ANY($1::uuid[]) OR receiver_id = ANY($1::uuid[])
          )`,
      [ids]
    );

    const transactionsResult = await pool.query(
      `DELETE FROM transactions
       WHERE sender_id = ANY($1::uuid[]) OR receiver_id = ANY($1::uuid[])`,
      [ids]
    );

    const messagesResult = await pool.query(
      `DELETE FROM messages
       WHERE sender_id = ANY($1::uuid[]) OR recipient_id = ANY($1::uuid[])`,
      [ids]
    );

    const oversightResult = await pool.query(
      `DELETE FROM user_oversight_branches
       WHERE user_id = ANY($1::uuid[])`,
      [ids]
    );

    const branchUnlinkResult = await pool.query(
      `UPDATE branches
       SET gm_id = NULL, admin_id = NULL
       WHERE gm_id = ANY($1::uuid[]) OR admin_id = ANY($1::uuid[])`,
      [ids]
    );

    const managerUnlinkResult = await pool.query(
      `UPDATE users
       SET manager_id = NULL
       WHERE manager_id = ANY($1::uuid[])`,
      [ids]
    );

    const userDeleteResult = await pool.query(
      `DELETE FROM users
       WHERE id = ANY($1::uuid[])
       RETURNING id, name`,
      [ids]
    );

    await pool.query('COMMIT');

    console.log('✅ Sales officer purge completed');
    console.log(`   sales officers deleted: ${userDeleteResult.rowCount}`);
    console.log(`   attendance_audit: ${attendanceAuditResult.rowCount}`);
    console.log(`   attendance: ${attendanceResult.rowCount}`);
    console.log(`   transaction_audit: ${transactionAuditResult.rowCount}`);
    console.log(`   transactions: ${transactionsResult.rowCount}`);
    console.log(`   messages: ${messagesResult.rowCount}`);
    console.log(`   oversight links: ${oversightResult.rowCount}`);
    console.log(`   branch unlink rows: ${branchUnlinkResult.rowCount}`);
    console.log(`   subordinate manager unlink rows: ${managerUnlinkResult.rowCount}`);
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('❌ Delete failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

deleteAllSalesOfficers();
