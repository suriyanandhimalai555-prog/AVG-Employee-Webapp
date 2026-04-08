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

const ADMIN_PASSWORD = 'qwertyuiop';

async function seedBranchAdmins() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  try {
    console.log('🔄 Fetching all branches...');
    const branchRes = await pool.query('SELECT id, name FROM branches WHERE is_active = true');
    const branches = branchRes.rows;
    console.log(`📍 Found ${branches.length} active branches. Starting admin creation...`);

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, saltRounds);

    let createdCount = 0;
    let linkedCount = 0;
    let skippedCount = 0;

    for (const branch of branches) {
      // Format email: branchname.admin@gmail.com (lowercase, no spaces)
      const sanitizedBranchName = branch.name.toLowerCase().replace(/\s+/g, '');
      const email = `${sanitizedBranchName}.admin@gmail.com`;
      const displayName = `${branch.name} Admin`;

      // 1. Check if user already exists
      let userId: string;
      const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
      
      if (userCheck.rows.length > 0) {
        userId = userCheck.rows[0].id;
        console.log(`  ℹ️  User already exists: ${email}`);
        skippedCount++;
      } else {
        // 2. Create the user
        const userInsert = await pool.query(
          `INSERT INTO users (name, email, password_hash, role, branch_id, has_smartphone)
           VALUES ($1, $2, $3, 'branch_admin', $4, true)
           RETURNING id`,
          [displayName, email, passwordHash, branch.id]
        );
        userId = userInsert.rows[0].id;
        console.log(`  ✅ Created user: ${email}`);
        createdCount++;
      }

      // 3. Ensure the branch.admin_id is set to this user
      const branchUpdate = await pool.query(
        'UPDATE branches SET admin_id = $1 WHERE id = $2 AND admin_id IS NULL RETURNING id',
        [userId, branch.id]
      );

      if (branchUpdate.rowCount && branchUpdate.rowCount > 0) {
        console.log(`  🔗 Linked as admin for branch: ${branch.name}`);
        linkedCount++;
      }
    }

    console.log(`\n🎉 Process complete!`);
    console.log(`   🆕 Users Created: ${createdCount}`);
    console.log(`   ⏭️  Users Skipped: ${skippedCount}`);
    console.log(`   🔗 Branches linked to admin: ${linkedCount}`);
    console.log(`   🔑 Default Password: ${ADMIN_PASSWORD}`);

  } catch (err) {
    console.error('❌ Failed to seed branch admins:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seedBranchAdmins();
