const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:TJLNnZxJARQWrnvezxuCJBwVRMNavNRk@autorack.proxy.rlwy.net:16344/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    const migrationsDir = path.join(__dirname, 'apps/api/migrations');

    // Run migrations in order. Already-applied ones must be idempotent.
    const files = [
      '001_init.sql',
      '002_attendance.sql',
      '003_transactions_and_messages.sql',
      '004_user_oversight_branches.sql',
      '005_indexes.sql',
    ];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${file} (file not found)`);
        continue;
      }
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`\n⏳ Running ${file}...`);
      try {
        await client.query(sql);
        console.log(`✅ ${file} applied successfully.`);
      } catch (err) {
        // Tolerate "already exists" errors so re-running is safe
        if (err.code === '42P07' || err.code === '42710') {
          console.log(`⏭️  ${file} already applied — skipping.`);
        } else {
          throw err;
        }
      }
    }

    console.log('\n🎉 All migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
