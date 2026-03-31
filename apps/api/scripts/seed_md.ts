// apps/api/scripts/seed_md.ts
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

/**
 * Creates the initial Managing Director (MD) account.
 * This user will have root-level permissions to create other admins.
 */
async function seedMD() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const MD_EMAIL = 'md@avg.com';
  const MD_PASS = 'MD@Admin2026';
  const MD_NAME = 'Managing Director';

  try {
    console.log('🔄 Seeding MD account...');
    
    // Hash the password with bcrypt
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(MD_PASS, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, has_smartphone)
       VALUES ($1, $2, $3, 'md', true)
       ON CONFLICT (email) DO UPDATE 
       SET password_hash = EXCLUDED.password_hash,
           role = 'md'
       RETURNING id, email`,
      [MD_NAME, MD_EMAIL, passwordHash]
    );

    console.log(`✅ MD account seeded successfully: ${result.rows[0].email} (ID: ${result.rows[0].id})`);
    console.log(`🔑 Credentials: ${MD_EMAIL} / ${MD_PASS}`);
  } catch (err) {
    console.error('❌ Failed to seed MD account:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedMD();
