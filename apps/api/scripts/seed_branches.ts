// apps/api/scripts/seed_branches.ts
// Idempotent branch seeding script — safe to run multiple times (uses ON CONFLICT DO NOTHING)
// Run with: ts-node -P tsconfig.json scripts/seed_branches.ts
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const BRANCHES = [
  'Veppur', 'Kallakurichi', 'Villupuram', 'Ulundurpet', 'Tiruvannamalai',
  'Anekal', 'Avalurpet', 'Panruti', 'Sankarapuram', 'Perampalur',
  'Villiyanur', 'Thittakudi', 'Thirukkanur', 'Neyveli', 'Thandarampattu',
  'Tindivanam', 'Ariyankuppam', 'Nettapakkam', 'Kandachipuram', 'Polur',
  'Gingee', 'Chengam', 'Virudhachalam', 'Jamunamarathur', 'Thenmathimangalam',
  'Melmalayanur', 'Thirukovilur', 'Harur', 'Moongil Thuraipattu', 'Uthangarai',
  'Krishnagiri', 'Andimadam', 'Dindigul', 'Attur', 'Naidupeta',
  'Thirupathur', 'Bangarupalayam', 'Kaniyambadi', 'Ranipet', 'Cuddalore',
  'Nellore', 'Thirupathi', 'Dharmapuri', 'Kalasthri', 'Devanur',
  'Attibele', 'Tiruchi', 'Ariyalur', 'Palani', 'Thalaivasal',
  'Aarani', 'Karaikal', 'Bellary', 'Gowribidanur', 'Pappireddy Patti',
  'Thiruthani', 'Gudur', 'Chittoor', 'Puttur', 'Sullurpet',
  'Dharmapuram', 'Eluru', 'Suryapet', 'Tirupur', 'Palacode',
  'Palamaner', 'Mandya', 'Ongole', 'Hasan', 'Vijayawada',
  'Mysore', 'V Kottah',
];

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database');

    let inserted = 0;
    let skipped = 0;

    for (const name of BRANCHES) {
      const result = await pool.query(
        `INSERT INTO branches (name, shift_start, shift_end, timezone)
         VALUES ($1, '09:00', '18:00', 'Asia/Kolkata')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [name]
      );
      if (result.rowCount && result.rowCount > 0) {
        inserted++;
        console.log(`  ✅ Inserted: ${name}`);
      } else {
        skipped++;
        console.log(`  ⏭️  Already exists: ${name}`);
      }
    }

    console.log(`\n🎉 Seeding complete! Inserted: ${inserted}, Skipped: ${skipped}`);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
