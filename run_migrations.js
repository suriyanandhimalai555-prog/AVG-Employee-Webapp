const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env from root first, then apps/api as fallback.
require('dotenv').config({ path: path.join(__dirname, '.env') });
require('dotenv').config({ path: path.join(__dirname, 'apps/api/.env') });

const ALREADY_EXISTS_CODES = new Set([
  '42P07', // duplicate_table
  '42710', // duplicate_object
  '42701', // duplicate_column
  '42P06', // duplicate_schema
  '42723', // duplicate_function
]);

async function migrate() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Track applied migrations so re-runs are idempotent.
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.join(__dirname, 'apps/api/migrations');
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith('.sql'))
      .sort((a, b) => a.localeCompare(b));

    const appliedRows = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(appliedRows.rows.map((r) => r.filename));

    for (const file of files) {
      if (applied.has(file)) {
        console.log(`⏭️  ${file} already recorded — skipping.`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`\n⏳ Running ${file}...`);

      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
          [file]
        );
        await client.query('COMMIT');
        console.log(`✅ ${file} applied.`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});

        // Tolerate "already exists" — record the file and continue, so legacy
        // databases that pre-date the migration tracker stay usable.
        if (ALREADY_EXISTS_CODES.has(err.code)) {
          console.log(`⏭️  ${file} reports already applied (${err.code}) — recording and skipping.`);
          await client.query(
            'INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
            [file]
          );
          continue;
        }
        throw err;
      }
    }

    console.log('\n🎉 All migrations completed.');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

migrate();
