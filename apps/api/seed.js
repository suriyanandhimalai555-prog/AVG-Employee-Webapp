const { Client } = require('pg');
const bcrypt = require('bcrypt');

async function seed() {
  const client = new Client({
    connectionString: 'postgresql://postgres:TJLNnZxJARQWrnvezxuCJBwVRMNavNRk@autorack.proxy.rlwy.net:16344/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    // Generate hashed passwords
    const passwordHash = await bcrypt.hash('password123', 10);

    // 1. Create a Branch
    const branchRes = await client.query(`
      INSERT INTO branches (name, shift_start, shift_end)
      VALUES ('HQ San Francisco', '09:00', '18:00')
      RETURNING id;
    `);
    const branchId = branchRes.rows[0].id;
    console.log(`✅ Branch created with ID: ${branchId}`);

    // 2. Create an Admin User
    const adminRes = await client.query(`
      INSERT INTO users (name, email, password_hash, role, branch_id)
      VALUES ('Admin Super', 'admin@demo.com', $1, 'branch_admin', $2)
      RETURNING id;
    `, [passwordHash, branchId]);
    const adminId = adminRes.rows[0].id;

    // Update branch to point to admin
    await client.query(`UPDATE branches SET admin_id = $1 WHERE id = $2`, [adminId, branchId]);
    console.log(`✅ Admin user seeded (admin@demo.com / password123)`);

    // 3. Create an Employee User
    await client.query(`
      INSERT INTO users (name, email, password_hash, role, branch_id, manager_id)
      VALUES ('Alex Rivera', 'emp@demo.com', $1, 'sales_officer', $2, $3);
    `, [passwordHash, branchId, adminId]);
    console.log(`✅ Employee user seeded (emp@demo.com / password123)`);

    console.log('\n🎉 Database seeding completed successfully!');
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seed();
