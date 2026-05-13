import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility for path resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const DIR_NAME = 'A.THIRUPATHI';
const DIR_EMAIL = 'thiru1970thiru@gmail.com';
const GM_NAME = 'Sutha';
const GM_EMAIL = 'sutha@gmail.com';
const PASS = 'qwertyuiop';

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔄 Seeding Director and GM...');
    
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(PASS, saltRounds);

    // 1. Find MD to link Director to (optional)
    const mdResult = await pool.query("SELECT id FROM users WHERE role = 'md' LIMIT 1");
    const mdId = mdResult.rows[0]?.id || null;
    if (mdId) console.log(`   Found MD ID: ${mdId}`);

    // 2. Create/Update Director
    let directorId: string;
    const existingDir = await pool.query('SELECT id FROM users WHERE email = $1', [DIR_EMAIL]);
    
    if (existingDir.rows.length > 0) {
      directorId = existingDir.rows[0].id;
      await pool.query(
        'UPDATE users SET name = $1, role = $2, manager_id = $3 WHERE id = $4',
        [DIR_NAME, 'director', mdId, directorId]
      );
      console.log(`   ✅ Director updated: ${DIR_EMAIL}`);
    } else {
      const dirInsert = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, manager_id, has_smartphone)
         VALUES ($1, $2, $3, 'director', $4, true)
         RETURNING id`,
        [DIR_NAME, DIR_EMAIL, passwordHash, mdId]
      );
      directorId = dirInsert.rows[0].id;
      console.log(`   ✅ Director created: ${DIR_EMAIL}`);
    }

    // 3. Create/Update GM linked to Director
    const existingGm = await pool.query('SELECT id FROM users WHERE email = $1', [GM_EMAIL]);
    if (existingGm.rows.length > 0) {
      await pool.query(
        'UPDATE users SET name = $1, role = $2, manager_id = $3 WHERE id = $4',
        [GM_NAME, 'gm', directorId, existingGm.rows[0].id]
      );
      console.log(`   ✅ GM updated: ${GM_EMAIL} (reporting to ${DIR_NAME})`);
    } else {
      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, manager_id, has_smartphone)
         VALUES ($1, $2, $3, 'gm', $4, true)`,
        [GM_NAME, GM_EMAIL, passwordHash, directorId]
      );
      console.log(`   ✅ GM created: ${GM_EMAIL} (reporting to ${DIR_NAME})`);
    }

    console.log('\n🎉 Finished seeding successfully!');

  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
