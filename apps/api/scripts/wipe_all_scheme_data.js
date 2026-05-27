// Wipe ALL scheme data and customers for a clean slate.
//
// DELETED:
//   - employee_incentives          (entire ledger — every credit ever made)
//   - gold_scheme_payments         (monthly payment records)
//   - gold_scheme_members          (gold enrollments)
//   - trading_academy_members      (trading academy enrollments)
//   - customers                    (all customer records)
//
// RESET:
//   - customer_code_sequences      (last_seq → 0 so next customer is <PREFIX>0001)
//
// KEPT:
//   - users, branches              (employees + org structure)
//   - projects                     (scheme registry — what schemes exist)
//   - scheme_commission_rules      (per-scheme per-role rates)
//
// All deletes run in one transaction; failure rolls back everything.

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function wipe() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Order matters: FK-dependent rows first, then their parents.
    const incentives    = await client.query('DELETE FROM employee_incentives        RETURNING id');
    const goldPayments  = await client.query('DELETE FROM gold_scheme_payments       RETURNING id');
    const goldMembers   = await client.query('DELETE FROM gold_scheme_members        RETURNING id');
    const tradingMembers= await client.query('DELETE FROM trading_academy_members    RETURNING id');
    const customers     = await client.query('DELETE FROM customers                  RETURNING id');
    const seqReset      = await client.query('UPDATE customer_code_sequences SET last_seq = 0 RETURNING branch_id');

    await client.query('COMMIT');

    console.log('Clean slate.');
    console.log(`  employee_incentives:       ${incentives.rowCount}`);
    console.log(`  gold_scheme_payments:      ${goldPayments.rowCount}`);
    console.log(`  gold_scheme_members:       ${goldMembers.rowCount}`);
    console.log(`  trading_academy_members:   ${tradingMembers.rowCount}`);
    console.log(`  customers:                 ${customers.rowCount}`);
    console.log(`  customer_code_sequences:   ${seqReset.rowCount} branch counters reset to 0`);
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
