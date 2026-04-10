// apps/api/scripts/reset_money_data.ts
// Deletes ALL money-related data so you can start fresh.
// Projects are also wiped — recreate them from the MD dashboard after running this.
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import * as readline from 'readline';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'yes');
    });
  });
}

async function resetMoneyData() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('');
  console.log('⚠️  MONEY DATA RESET');
  console.log('────────────────────────────────');
  console.log('This will permanently delete:');
  console.log('  • ALL money_collections records');
  console.log('');
  console.log('Projects are kept. This CANNOT be undone.');
  console.log('');

  const ok = await confirm('Type "yes" to confirm: ');
  if (!ok) {
    console.log('Aborted. No data was changed.');
    await pool.end();
    process.exit(0);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const colResult = await client.query('DELETE FROM money_collections');
    console.log(`✅ Deleted ${colResult.rowCount} money_collections record(s)`);

    await client.query('COMMIT');
    console.log('');
    console.log('✅ Money data reset complete. All balances are now ₹0.');
    console.log('   Projects are intact and ready to use.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Reset failed — rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

resetMoneyData();
