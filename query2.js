const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    console.log('\n=== LOOKING FOR SPECIFIC USERS ===');
    const result = await pool.query(
      `SELECT id, name, email, branch_id, role FROM users
       WHERE name ILIKE '%Admin Super%' OR name ILIKE '%HQ San Francisco%'`
    );

    console.log('Found users:');
    console.table(result.rows);

    if (result.rows.length > 0) {
      console.log('\nUser IDs to delete:');
      result.rows.forEach(u => console.log(`  - ${u.id} (${u.name})`));
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
