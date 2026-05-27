const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    const usersToDelete = [
      '6a522f5a-a42c-4549-9c3e-c9bbcd4e339f', // Admin Super
      'cc162f16-478e-4133-ae68-5db7794b2403', // HQ San Francisco Admin
    ];

    console.log('\n=== BRANCHES THESE ADMINS MANAGE ===');
    const result = await pool.query(
      `SELECT id, name, admin_id FROM branches WHERE admin_id = ANY($1)`,
      [usersToDelete]
    );

    console.log('Branches managed by these admins:');
    console.table(result.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
