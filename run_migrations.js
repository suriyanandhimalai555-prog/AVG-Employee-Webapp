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

    // Auto-discover migrations in lexical order (001_*, 002_*, ...).
    // This prevents missing new files when adding future migrations.
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

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
