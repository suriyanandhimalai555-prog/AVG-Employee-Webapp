// apps/api/scripts/seed_branch_admins.ts
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const COMMON_PASS = 'BranchAdmin@123';

/**
 * Creates one branch_admin account for every branch in the database.
 * Email format: branchname.admin@avg.com
 */
async function seedBranchAdmins() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔄 Fetching all branches...');
    const branchRes = await pool.query('SELECT id, name FROM branches WHERE is_active = true');
    const branches = branchRes.rows;
    console.log(`📍 Found ${branches.length} branches. Starting accounts creation...`);

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(COMMON_PASS, saltRounds);

    let createdCount = 0;
    let skippedCount = 0;

    for (const branch of branches) {
      // Sanitize branch name for email (e.g., "Thirukkovilur" -> "thirukovilur.admin@avg.com")
      const sanitizedName = branch.name.toLowerCase().replace(/\s+/g, '_');
      const email = `${sanitizedName}.admin@avg.com`;
      const name = `${branch.name} Admin`;

      // Check if user already exists
      const checkRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      
      if (checkRes.rowCount && checkRes.rowCount > 0) {
        skippedCount++;
        // Optionally update the branch_id if it's missing
        await pool.query('UPDATE users SET branch_id = $1 WHERE id = $2 AND branch_id IS NULL', [branch.id, checkRes.rows[0].id]);
        continue;
      }

      await pool.query(
        `INSERT INTO users (name, email, password_hash, role, branch_id, has_smartphone)
         VALUES ($1, $2, $3, 'branch_admin', $4, true)`,
        [name, email, passwordHash, branch.id]
      );
      
      createdCount++;
      console.log(`  ✅ Created: ${email} for ${branch.name}`);
    }

    console.log(`\n🎉 Process complete!`);
    console.log(`🆕 Created: ${createdCount}`);
    console.log(`⏭️  Skipped (Already existed): ${skippedCount}`);
    console.log(`🔑 Common Password: ${COMMON_PASS}`);

  } catch (err) {
    console.error('❌ Failed to seed branch admins:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedBranchAdmins();
