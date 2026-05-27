const pg = require('pg');
require('dotenv').config();

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

(async () => {
  try {
    console.log('\n=== BRANCHES ===');
    const branches = await pool.query('SELECT id, name FROM branches ORDER BY name');
    console.table(branches.rows);

    console.log('\n=== BRANCH ADMINS ===');
    const admins = await pool.query(
      `SELECT id, name, email, branch_id, role FROM users WHERE role = 'branch_admin' ORDER BY name`
    );
    console.table(admins.rows);

    console.log('\n=== ALL USERS (by role) ===');
    const allUsers = await pool.query(
      `SELECT id, name, email, branch_id, role FROM users ORDER BY role, name`
    );
    console.table(allUsers.rows);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
