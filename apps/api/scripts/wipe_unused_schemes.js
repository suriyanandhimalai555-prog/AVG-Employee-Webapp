// Wipe unused scheme projects.
//
// KEPT (matched by name):
//   - AGILAVETRI TRADING ACADEMY PVT LTD   (code: trading_academy)
//   - MONTHLY CARD                         (code: gold_scheme)
// These are the only two schemes wired into services + routes.
//
// DELETED: every other row in `projects`.
//   scheme_commission_rules.project_id is ON DELETE CASCADE, so commission
//   rules for deleted projects vanish automatically.
//
// SAFETY: trading_academy_members.project_id and money_collections.project_id
// are NO ACTION. If either still references a project being deleted, the
// statement aborts and the transaction rolls back — no silent data loss.

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const KEEP_NAMES = [
  'AGILAVETRI TRADING ACADEMY PVT LTD',
  'MONTHLY CARD',
];

async function wipe() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const before = await client.query(
      `SELECT name FROM projects WHERE name <> ALL($1::text[]) ORDER BY name`,
      [KEEP_NAMES]
    );

    const result = await client.query(
      `DELETE FROM projects WHERE name <> ALL($1::text[]) RETURNING id, name`,
      [KEEP_NAMES]
    );

    await client.query('COMMIT');

    console.log(`Deleted ${result.rowCount} project(s):`);
    for (const row of before.rows) console.log('  - ' + row.name);
    console.log('\nKept:');
    for (const name of KEEP_NAMES) console.log('  - ' + name);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Wipe failed (rolled back):', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

wipe();
