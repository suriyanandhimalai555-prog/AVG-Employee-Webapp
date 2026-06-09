// apps/api/scripts/seed_management.ts
// Creates the single system-level Management account.
//
// This account sits outside the org-chart hierarchy (no manager_id, no branch_id)
// and is used exclusively for entering historical / backdated scheme records.
// It is seeded once, like the MD account — it is NOT created through the app UI.
//
// Run: npx ts-node apps/api/scripts/seed_management.ts

import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const MGMT_EMAIL = 'management@avg.com';
const MGMT_PASS  = 'Mgmt@Avg2026';
const MGMT_NAME  = 'Management';

async function seedManagement() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('🔄 Seeding Management account…');
    const saltRounds   = 10;
    const passwordHash = await bcrypt.hash(MGMT_PASS, saltRounds);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, has_smartphone, branch_id, manager_id)
       VALUES ($1, $2, $3, 'management', false, NULL, NULL)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash,
             role          = 'management',
             branch_id     = NULL,
             manager_id    = NULL
       RETURNING id, email`,
      [MGMT_NAME, MGMT_EMAIL, passwordHash]
    );

    console.log(`✅ Management account seeded: ${result.rows[0].email} (ID: ${result.rows[0].id})`);
    console.log(`🔑 Credentials: ${MGMT_EMAIL} / ${MGMT_PASS}`);
  } catch (err) {
    console.error('❌ Failed to seed management account:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedManagement();
