const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function wipeGoldScheme() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const payments = await client.query('DELETE FROM gold_scheme_payments RETURNING id');
    const members  = await client.query('DELETE FROM gold_scheme_members  RETURNING id');

    await client.query('COMMIT');

    console.log(`✅ Deleted ${payments.rowCount} payment(s)`);
    console.log(`✅ Deleted ${members.rowCount}  member(s)`);
    console.log('Gold scheme data wiped.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

wipeGoldScheme();
