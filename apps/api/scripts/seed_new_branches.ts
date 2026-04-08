import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility for path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const BRANCHES = [
  'VEPPUR', 'KALLAKURICHI', 'VILLUPURAM', 'ULUNDURPET', 'TIRUVANNAMALAI',
  'ANEKAL', 'AVALURPET', 'PANRUTI', 'SANKARAPURAM', 'PERAMBALUR',
  'VILLIYANUR', 'THITAKUDI', 'THIRUKKANUR', 'NEYVELI', 'THANDARAMPATTU',
  'TINDIVANAM', 'ARIYANKUPPAM', 'NETTAPAKKAM', 'KANDACHIPURAM', 'POLUR',
  'GINGEE', 'CHENGAM', 'VIRUTHACHALAM', 'JAMUNAMARATHUR', 'THENNATHIMANGALAM',
  'MELMALAYANUR', 'THIRUKOVILUR', 'HARUR', 'MOONGIL THURAIPATTU', 'UTHANGARAI',
  'KRISHNAGIRI', 'ANDIMADAM', 'DINDIGUL', 'ATTUR', 'NAIDUPETA',
  'THIRUPATHUR', 'BANGARUPALAYAM', 'KANIYAMBADI', 'RANIPET', 'CUDDALORE',
  'NELLORE', 'THIRUPATHI', 'DHARMAPURI', 'KALAHASTHI', 'DEVANUR',
  'ATTIBEL', 'TIRUCHI', 'ARIYALUR', 'PALANI', 'THALAIVASAL',
  'AARANI', 'KARAIKAL', 'BELLARY', 'GOWRIBIDANUR', 'PAPPIREDY PATTI',
  'THIRUTHANI', 'GUDUR', 'CHITTOOR', 'PUTTUR', 'SULLURPET',
  'DHARAPURAM', 'ELURU', 'SURYAPET', 'TIRUPUR', 'PALACODE',
  'PALAMANER', 'MANDYA', 'ONGOLE', 'HASAN', 'VIJAYAWADA',
  'MYSORE', 'V KOTTAH'
];

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    // Ensure we have a unique index on branch name to use ON CONFLICT
    // Since migration 001 didn't have it, we check and add it if missing
    await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_name_unique ON branches(name)');

    let inserted = 0;
    let skipped = 0;

    for (const name of BRANCHES) {
      // We check for existing name case-insensitively to avoid dupes like "Veppur" vs "VEPPUR"
      const existing = await pool.query('SELECT id FROM branches WHERE UPPER(name) = $1', [name]);
      
      if (existing.rows.length > 0) {
        skipped++;
        console.log(`  ⏭️  Already exists (case-insensitive check): ${name}`);
        continue;
      }

      const result = await pool.query(
        `INSERT INTO branches (name, shift_start, shift_end, timezone)
         VALUES ($1, '09:00', '18:00', 'Asia/Kolkata')
         RETURNING id`,
        [name]
      );

      if (result.rowCount && result.rowCount > 0) {
        inserted++;
        console.log(`  ✅ Inserted: ${name}`);
      }
    }

    console.log(`\n🎉 Seeding complete!`);
    console.log(`   New branches inserted: ${inserted}`);
    console.log(`   Skipped (already exist): ${skipped}`);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
