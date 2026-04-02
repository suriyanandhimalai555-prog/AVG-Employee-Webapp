const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function migrate() {
  const client = new Client({
    connectionString: 'postgresql://postgres:TJLNnZxJARQWrnvezxuCJBwVRMNavNRk@autorack.proxy.rlwy.net:16344/railway'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Railway PostgreSQL');

    const migrationsDir = path.join(__dirname, 'apps/api/migrations');
    const files = [
      '003_transactions_and_messages.sql'
    ];

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      console.log(`\n⏳ Running ${file}...`);
      await client.query(sql);
      console.log(`✅ ${file} applied successfully.`);
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
