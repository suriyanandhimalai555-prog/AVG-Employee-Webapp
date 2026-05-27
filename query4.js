const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const branchId = '8b261357-af77-4532-b67b-f52ace2db5f0'; // HQ San Francisco

    console.log('\n=== USERS IN HQ SAN FRANCISCO BRANCH ===');
    const result = await pool.query(
      `SELECT id, name, email, role FROM users WHERE branch_id = $1`,
      [branchId]
    );

    console.log(`Found ${result.rows.length} users:`);
    console.table(result.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
