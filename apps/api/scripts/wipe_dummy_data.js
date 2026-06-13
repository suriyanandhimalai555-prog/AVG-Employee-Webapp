// apps/api/scripts/wipe_dummy_data.js
//
// ╔══════════════════════════════════════════════════════════════════╗
// ║           PRODUCTION DUMMY-DATA WIPE — READ BEFORE RUNNING       ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  KEPT (real data — never touched):                               ║
// ║    users, branches, user_oversight_branches                      ║
// ║    schema_migrations, projects, scheme_commission_rules          ║
// ║    gold_coin_packages, lss_plans, chit_packages                  ║
// ║    builders_packages, builders_incentive_rules                   ║
// ║    land_sites, land_layouts, land_plots                          ║
// ║    land_site_commission_rules, land_layout_commission_rules       ║
// ║    app_settings, customer_code_sequences (rows kept, counter→0)  ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  WIPED (dummy transactional data):                               ║
// ║    attendance, attendance_audit                                  ║
// ║    transactions, transaction_audit                               ║
// ║    employee_incentives, employee_salaries                        ║
// ║    money_collections                                             ║
// ║    gold_scheme_payments, gold_scheme_members                     ║
// ║    gold_coin_draws, gold_coin_slots, gold_coin_rooms             ║
// ║    lss_draws, lss_slots, lss_rooms                               ║
// ║    agila_chit_winners, agila_chit_payments                       ║
// ║    agila_chit_members, agila_chit_groups                         ║
// ║    trading_academy_members                                       ║
// ║    builders_payouts, builders_plans                              ║
// ║    land_buyback_payouts, land_bookings, land_audit_log           ║
// ║    scheme_corrections_audit                                      ║
// ║    customers                                                     ║
// ╠══════════════════════════════════════════════════════════════════╣
// ║  Usage:                                                          ║
// ║    node apps/api/scripts/wipe_dummy_data.js           # dry run  ║
// ║    node apps/api/scripts/wipe_dummy_data.js --execute # real run ║
// ╚══════════════════════════════════════════════════════════════════╝

'use strict';

const { Pool }    = require('pg');
const path        = require('path');
const readline    = require('readline');

// Load env: root .env first, then apps/api/.env as fallback
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// ─── TABLE LISTS ─────────────────────────────────────────────────────────────

// Wiped in dependency order (children before parents).
// One TRUNCATE handles circular/self FKs atomically.
const WIPE_TABLES = [
  // Audit leaves (must go first — no other table FKs to them)
  'attendance_audit',
  'transaction_audit',
  'scheme_corrections_audit',
  'land_audit_log',

  // Attendance
  'attendance',

  // Money
  'money_collections',
  'transactions',
  'employee_incentives',
  'employee_salaries',

  // Gold scheme
  'gold_scheme_payments',
  'gold_scheme_members',

  // Gold coin (circular: slots↔draws → TRUNCATE resolves atomically)
  'gold_coin_draws',
  'gold_coin_slots',
  'gold_coin_rooms',

  // LSS (same circular pattern)
  'lss_draws',
  'lss_slots',
  'lss_rooms',

  // Agila chit (groups has self-FK combined_into_group_id)
  'agila_chit_winners',
  'agila_chit_payments',
  'agila_chit_members',
  'agila_chit_groups',

  // Trading academy
  'trading_academy_members',

  // Builders
  'builders_payouts',
  'builders_plans',

  // Land bookings only (land_sites/layouts/plots are KEPT as real config)
  'land_buyback_payouts',
  'land_bookings',

  // Customers (FK target for all scheme member tables above — goes last)
  'customers',
];

// These are never touched — documented here as the authoritative KEEP list.
const KEEP_TABLES = [
  'users',
  'branches',
  'user_oversight_branches',
  'schema_migrations',
  'projects',
  'scheme_commission_rules',
  'gold_coin_packages',
  'lss_plans',
  'chit_packages',
  'builders_packages',
  'builders_incentive_rules',
  'app_settings',
  'land_sites',
  'land_layouts',
  'land_plots',
  'land_site_commission_rules',
  'land_layout_commission_rules',
  'customer_code_sequences',  // rows kept; last_seq values reset to 0
];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Parse host + dbname from a postgres connection URL (never logs the password). */
function parseDbTarget(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? ':' + u.port : ''}/${u.pathname.replace(/^\//, '')}`;
  } catch {
    return '(could not parse URL)';
  }
}

/** Extract dbname from a postgres connection URL. */
function parseDbName(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

/** Check whether a table exists in the public schema via to_regclass. */
async function tableExists(client, name) {
  const res = await client.query(
    `SELECT to_regclass($1::text) IS NOT NULL AS exists`,
    [`public.${name}`]
  );
  return res.rows[0].exists;
}

/** Count rows in a table. */
async function countRows(client, table) {
  const res = await client.query(`SELECT COUNT(*)::bigint AS n FROM ${table}`);
  return parseInt(res.rows[0].n, 10);
}

/** Prompt the user for a line of input. */
function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = !process.argv.includes('--execute');

  // Guard 1 — env check
  if (!process.env.DATABASE_URL) {
    console.error('\n❌  DATABASE_URL is not set. Aborting.\n');
    process.exit(1);
  }

  const dbTarget = parseDbTarget(process.env.DATABASE_URL);
  const dbName   = parseDbName(process.env.DATABASE_URL);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('  PRODUCTION DUMMY-DATA WIPE');
  console.log('══════════════════════════════════════════════════════════════');
  console.log(`  Target database : ${dbTarget}`);
  console.log(`  Mode            : ${isDryRun ? 'DRY RUN — no changes will be made' : '⚠️  EXECUTE — data will be permanently deleted'}`);
  console.log('══════════════════════════════════════════════════════════════\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    // ── PHASE 1: check which WIPE tables actually exist ───────────────────
    const existingWipeTables = [];
    const missingTables      = [];
    for (const t of WIPE_TABLES) {
      if (await tableExists(client, t)) {
        existingWipeTables.push(t);
      } else {
        missingTables.push(t);
      }
    }

    if (missingTables.length > 0) {
      console.log(`⚠️  The following tables were not found in the DB (skipping):`);
      missingTables.forEach(t => console.log(`     - ${t}`));
      console.log('');
    }

    // ── PHASE 2: preview report ───────────────────────────────────────────
    console.log('─── WIPE PREVIEW (rows that will be deleted) ──────────────────');
    let totalWipeRows = 0;
    const wipeSnapshot = {};
    for (const t of existingWipeTables) {
      const n = await countRows(client, t);
      wipeSnapshot[t] = n;
      totalWipeRows  += n;
      const marker = n > 0 ? '⚠️ ' : '  ';
      console.log(`  ${marker} ${t.padEnd(36)} ${n.toLocaleString()} rows`);
    }
    console.log(`  ${'─'.repeat(50)}`);
    console.log(`     ${'TOTAL TO DELETE'.padEnd(34)} ${totalWipeRows.toLocaleString()} rows`);
    console.log('');

    console.log('─── KEEP PREVIEW (rows that will be preserved) ─────────────────');
    const keepSnapshot = {};
    for (const t of KEEP_TABLES) {
      if (!(await tableExists(client, t))) { console.log(`     ${t.padEnd(36)} (not found)`); continue; }
      const n = await countRows(client, t);
      keepSnapshot[t] = n;
      console.log(`     ${t.padEnd(36)} ${n.toLocaleString()} rows`);
    }
    console.log('');

    // ── DRY RUN exits here ────────────────────────────────────────────────
    if (isDryRun) {
      console.log('Dry-run complete. No data was changed.');
      console.log('Re-run with --execute to perform the wipe.\n');
      return;
    }

    // ── PHASE 3: production confirmation ─────────────────────────────────
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  ⚠️  THIS WILL PERMANENTLY DELETE ALL DUMMY DATA.');
    console.log('  THIS CANNOT BE UNDONE.');
    console.log('');
    console.log('  STRONGLY RECOMMENDED: take a backup first:');
    console.log(`    pg_dump "$DATABASE_URL" > backup_before_wipe.sql`);
    console.log('══════════════════════════════════════════════════════════════\n');

    const answer = await prompt(`Type the database name ("${dbName}") to confirm, or anything else to abort: `);
    if (answer !== dbName) {
      console.log('\nAborted — input did not match. No data was changed.\n');
      return;
    }

    // ── PHASE 4: execute inside a transaction ─────────────────────────────
    console.log('\n⏳ Starting wipe...\n');
    await client.query('BEGIN');

    // Single TRUNCATE — resolves circular FKs (slots↔draws, self-ref groups/rooms) atomically.
    // RESTART IDENTITY resets any serial sequences on those tables.
    // No CASCADE: if a KEEP table unexpectedly FKs a WIPE table, Postgres will error loudly.
    const truncateList = existingWipeTables.join(', ');
    await client.query(`TRUNCATE ${truncateList} RESTART IDENTITY`);

    // Reset customer code counters (keep the per-branch rows, just zero the counter)
    await client.query(`UPDATE customer_code_sequences SET last_seq = 0`);

    // ── PHASE 5: post-wipe verification (still in transaction) ───────────
    console.log('🔍 Verifying...\n');
    let verifyFailed = false;

    for (const t of existingWipeTables) {
      const n = await countRows(client, t);
      if (n !== 0) {
        console.error(`❌  ${t} still has ${n} rows after TRUNCATE!`);
        verifyFailed = true;
      }
    }

    // Spot-check KEEP tables — counts must be unchanged
    for (const t of ['users', 'branches', 'user_oversight_branches']) {
      if (keepSnapshot[t] === undefined) continue;
      const n = await countRows(client, t);
      if (n !== keepSnapshot[t]) {
        console.error(`❌  ${t} count changed! Before: ${keepSnapshot[t]}, After: ${n}`);
        verifyFailed = true;
      }
    }

    if (verifyFailed) {
      await client.query('ROLLBACK');
      console.error('\n❌ Verification failed — rolled back. Nothing was changed.\n');
      process.exit(1);
    }

    await client.query('COMMIT');

    // ── PHASE 6: summary ─────────────────────────────────────────────────
    console.log('\n══════════════════════════════════════════════════════════════');
    console.log('  ✅ WIPE COMPLETE — ALL DUMMY DATA HAS BEEN REMOVED');
    console.log('══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Rows deleted per table:');
    for (const [t, n] of Object.entries(wipeSnapshot)) {
      if (n > 0) console.log(`    ${t.padEnd(36)} ${n.toLocaleString()} rows deleted`);
    }
    console.log('');
    console.log('  customer_code_sequences: all branch counters reset to 0');
    console.log('');
    console.log('  Preserved (sample check):');
    for (const t of ['users', 'branches', 'user_oversight_branches']) {
      if (keepSnapshot[t] !== undefined)
        console.log(`    ${t.padEnd(36)} ${keepSnapshot[t].toLocaleString()} rows intact`);
    }
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\n❌ Wipe failed — rolled back:', err.message, '\n');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
