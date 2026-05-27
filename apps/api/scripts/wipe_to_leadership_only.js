// Wipe everything except MD / Director / GM user identities.
//
// KEPT:
//   - users where role IN ('md', 'director', 'gm')
//   - branches (gm_id preserved; admin_id cleared because branch admins are deleted)
//   - projects, scheme_commission_rules (scheme registry + rate config)
//   - schema_migrations
//
// DELETED:
//   - users where role NOT IN ('md', 'director', 'gm')
//     → branch_manager, abm, sales_officer, branch_admin, oa, client
//   - ALL attendance + attendance_audit (every row, including leadership's own)
//   - ALL transactions + transaction_audit
//   - ALL money_collections
//   - ALL employee_salaries
//   - ALL user_documents
//   - user_oversight_branches rows whose user_id is being deleted
//
// FK CLEANUP before user delete:
//   - branches.admin_id  → NULL where it points to a deleted user
//   - users.manager_id   → NULL where it points to a deleted user
//
// Already-empty after previous wipe (no work needed):
//   customers, employee_incentives, gold_scheme_members,
//   gold_scheme_payments, trading_academy_members
//
// All operations run in one transaction; failure rolls everything back.

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KEEP_ROLES = ['md', 'director', 'gm'];

async function wipe() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Operational data — wipe in FK order (children before parents)
    const attAudit     = await client.query('DELETE FROM attendance_audit       RETURNING id');
    const attendance   = await client.query('DELETE FROM attendance             RETURNING id');
    const txAudit      = await client.query('DELETE FROM transaction_audit      RETURNING id');
    const transactions = await client.query('DELETE FROM transactions           RETURNING id');
    const moneyColl    = await client.query('DELETE FROM money_collections      RETURNING id');
    const salaries     = await client.query('DELETE FROM employee_salaries      RETURNING id');
    const userDocs     = await client.query('DELETE FROM user_documents         RETURNING id');

    // 2. Oversight rows for users that are about to be deleted
    const oversight = await client.query(
      `DELETE FROM user_oversight_branches
       WHERE user_id IN (SELECT id FROM users WHERE role <> ALL($1::text[]))
       RETURNING user_id`,
      [KEEP_ROLES]
    );

    // 3. Pre-delete FK cleanup so the users DELETE doesn't violate references
    const adminCleared = await client.query(
      `UPDATE branches SET admin_id = NULL
       WHERE admin_id IN (SELECT id FROM users WHERE role <> ALL($1::text[]))
       RETURNING id`,
      [KEEP_ROLES]
    );
    const managerCleared = await client.query(
      `UPDATE users SET manager_id = NULL
       WHERE manager_id IN (SELECT id FROM users WHERE role <> ALL($1::text[]))
       RETURNING id`,
      [KEEP_ROLES]
    );

    // 4. Delete the non-leadership users
    const usersDeleted = await client.query(
      `DELETE FROM users WHERE role <> ALL($1::text[]) RETURNING id`,
      [KEEP_ROLES]
    );

    await client.query('COMMIT');

    console.log('Wiped — leadership only.');
    console.log(`  attendance_audit:           ${attAudit.rowCount}`);
    console.log(`  attendance:                 ${attendance.rowCount}`);
    console.log(`  transaction_audit:          ${txAudit.rowCount}`);
    console.log(`  transactions:               ${transactions.rowCount}`);
    console.log(`  money_collections:          ${moneyColl.rowCount}`);
    console.log(`  employee_salaries:          ${salaries.rowCount}`);
    console.log(`  user_documents:             ${userDocs.rowCount}`);
    console.log(`  user_oversight_branches:    ${oversight.rowCount}`);
    console.log(`  branches.admin_id NULL'd:   ${adminCleared.rowCount}`);
    console.log(`  users.manager_id NULL'd:    ${managerCleared.rowCount}`);
    console.log(`  users deleted:              ${usersDeleted.rowCount}`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Wipe failed (rolled back):', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

wipe();
