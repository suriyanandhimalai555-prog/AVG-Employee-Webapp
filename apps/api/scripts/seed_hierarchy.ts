/**
 * seed_hierarchy.ts
 *
 * Seeds all Directors and GMs with their oversight branch assignments.
 * Idempotent — safe to run multiple times (uses ON CONFLICT DO NOTHING / DO UPDATE).
 *
 * What it does:
 *   1. Ensures every required branch exists (inserts missing ones).
 *   2. Inserts 9 Directors (3 per group) under the MD.
 *   3. Inserts 30 GMs under their respective Director (round-robin within group).
 *   4. Inserts user_oversight_branches rows for each GM's branches.
 *
 * Run:
 *   npx ts-node -P tsconfig.json scripts/seed_hierarchy.ts
 *   (from the apps/api/ directory)
 */

import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// ─── Default password for all seeded staff accounts ───────────────────────────
const DEFAULT_PASS = 'Staff@2026';

// ─── Hierarchy data ────────────────────────────────────────────────────────────
//
// Branch names here MUST match (case-sensitive) what is in the branches table.
// Names that differ from the user-provided text are noted in comments.
//
const GROUPS = [
  {
    label: 'Group 1 – Tamil Nadu (South / Puducherry)',
    directors: [
      { name: 'Thirupathi', email: 'thirupathi.director@avg.com' },
      { name: 'Perumal',    email: 'perumal.director@avg.com'    },
      { name: 'Murugan',    email: 'murugan.director@avg.com'    },
    ],
    gms: [
      // director assigned by index % directors.length (0,1,2,0,1,2,…)
      { name: 'Sivashakthi',  email: 'sivashakthi.gm@avg.com',  branches: ['Villiyanur',    'Ariyankuppam']                      },
      { name: 'Sathya',       email: 'sathya.gm@avg.com',       branches: ['Nettapakkam',   'Thirukkanur']                       },
      { name: 'Rajalakshmi',  email: 'rajalakshmi.gm@avg.com',  branches: ['Villupuram',    'Devanur']       /* DHEEVANUR */      },
      { name: 'Prabhu',       email: 'prabhu.gm@avg.com',       branches: ['Karaikal',      'Neyveli']                           },
      { name: 'Murthy',       email: 'murthy.gm@avg.com',       branches: ['Panruti',       'Cuddalore']     /* PANRUTTY */       },
      { name: 'Sivaraman',    email: 'sivaraman.gm@avg.com',    branches: ['Tindivanam',    'Andimadam',    'Thittakudi']        },
      { name: 'Gomathi',      email: 'gomathi.gm@avg.com',      branches: ['Veppur',        'Virudhachalam']                     },
      { name: 'Sargunam',     email: 'sargunam.gm@avg.com',     branches: ['Perampalur',    'Ariyalur']      /* PERAMBALUR */     },
      { name: 'Elumalai',     email: 'elumalai.gm@avg.com',     branches: ['Tiruchi',       'Dindigul']      /* TRICHY */         },
      { name: 'Velmurugan',   email: 'velmurugan.gm@avg.com',   branches: ['Tirupur',       'Dharapuram']                        },
      { name: 'Sameetha Banu',email: 'sameetha.gm@avg.com',     branches: ['Palani',        'Ottanchatiram'] /* OTTANSATHIRAM */ },
    ],
  },
  {
    label: 'Group 2 – Tamil Nadu (North / Vellore / Dharmapuri)',
    directors: [
      { name: 'Subramani', email: 'subramani.director@avg.com' },
      { name: 'Kamaraj',   email: 'kamaraj.director@avg.com'   },
      { name: 'Vinoth',    email: 'vinoth.director@avg.com'    },
    ],
    gms: [
      { name: 'Ramesh',        email: 'ramesh.gm@avg.com',        branches: ['Kallakurichi',       'Thirukovilur']                               },
      { name: 'Venkatesan',    email: 'venkatesan.gm@avg.com',    branches: ['Ulundurpet',         'Sankarapuram']                               },
      { name: 'Ramachandran',  email: 'ramachandran.gm@avg.com',  branches: ['Tiruvannamalai',     'Aarani']           /* ARANI */               },
      { name: 'Sarathy',       email: 'sarathy.gm@avg.com',       branches: ['Kaniyambadi',        'Jamunamarathur']   /* JAMUNAMUTHUR */        },
      { name: 'Mohan',         email: 'mohan.gm@avg.com',         branches: ['Avalurpet',          'Melmalayanur']     /* MELMALAIYANUR */       },
      { name: 'Kavitha',       email: 'kavitha.gm@avg.com',       branches: ['Polur',              'Thenmathimangalam'] /* THENMAATHIMANGALAM */ },
      { name: 'Siva',          email: 'siva.gm@avg.com',          branches: ['Chengam',            'Thandarampattu',   'Moongil Thuraipattu']   },
      { name: 'Antony Sagayaraj', email: 'antony.gm@avg.com',     branches: ['Attur',              'Thalaivasal']      /* AATHUR */              },
      { name: 'Rameshkumar',   email: 'rameshkumar.gm@avg.com',   branches: ['Gingee',             'Kandachipuram']                              },
      { name: 'Malligasri',    email: 'malligasri.gm@avg.com',    branches: ['Pappireddy Patti',   'Uthangarai']       /* PAPPIREDDYPATTI */     },
      { name: 'Sudha',         email: 'sudha.gm@avg.com',         branches: ['Harur',              'Dharmapuri']                                 },
      { name: 'Sundaravel',    email: 'sundaravel.gm@avg.com',    branches: ['Krishnagiri',        'Thirupathur']                                },
    ],
  },
  {
    label: 'Group 3 – Karnataka & Andhra Pradesh',
    directors: [
      { name: 'Muthusamy',     email: 'muthusamy.director@avg.com'  },
      { name: 'Krishnasamy',   email: 'krishnasamy.director@avg.com'},
      { name: 'Uma Maheswari', email: 'uma.director@avg.com'        },
    ],
    gms: [
      // Karnataka
      { name: 'Ramesh (Karnataka)', email: 'ramesh.ka.gm@avg.com',   branches: ['Attibele',    'Anekal',    'Mysore',   'Mandya']    /* MANDIA */ },
      { name: 'Lakshmanan',         email: 'lakshmanan.gm@avg.com',  branches: ['Hasan',       'Bellary',   'Gowribidanur']                       },
      // Andhra Pradesh
      { name: 'Sivakumar',          email: 'sivakumar.gm@avg.com',   branches: ['Eluru',       'Vijayawada','Ongole']                             },
      { name: 'Hajrath',            email: 'hajrath.gm@avg.com',     branches: ['Nellore',     'Sullurpet', 'Kalasthri']  /* SULURPET/KALAHASTHI */ },
      { name: 'Vijayasanthi',       email: 'vijayasanthi.gm@avg.com',branches: ['Chittoor',    'Naidupeta', 'Gudur']      /* CHITTOR/GUDURU */     },
      { name: 'Sunitha',            email: 'sunitha.gm@avg.com',     branches: ['Thirupathi',  'Puttur',    'Bangarupalayam'] /* TIRUPATI/PUTHUR */ },
      { name: 'Yasodha',            email: 'yasodha.gm@avg.com',     branches: ['Thiruthani',  'Palamaner', 'V Kottah']                            },
    ],
  },
] as const;

// Branches not present in the existing seed_branches.ts — script will insert them.
const EXTRA_BRANCHES = [
  'Dharapuram',    // GM Velmurugan (Group 1) — distinct from Dharmapuram (Cuddalore)
  'Ottanchatiram', // GM Sameetha Banu (Group 1) — OTTANSATHIRAM
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getBranchId(pool: Pool, name: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `SELECT id FROM branches WHERE name = $1 AND is_active = true LIMIT 1`,
    [name],
  );
  if (res.rowCount === 0) {
    throw new Error(`Branch not found: "${name}". Check the name matches exactly.`);
  }
  return res.rows[0].id;
}

async function upsertUser(
  pool: Pool,
  opts: {
    name: string;
    email: string;
    role: 'director' | 'gm';
    managerId: string;
    passwordHash: string;
  },
): Promise<string> {
  const res = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, password_hash, role, manager_id, has_smartphone)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email) DO UPDATE
       SET name       = EXCLUDED.name,
           role       = EXCLUDED.role,
           manager_id = EXCLUDED.manager_id
     RETURNING id`,
    [opts.name, opts.email, opts.passwordHash, opts.role, opts.managerId],
  );
  return res.rows[0].id;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    await pool.query('SELECT 1');
    console.log('✅ Connected to database\n');

    // 1. Ensure extra branches exist
    console.log('── Step 1: Ensuring extra branches exist ──────────────────');
    for (const name of EXTRA_BRANCHES) {
      const res = await pool.query(
        `INSERT INTO branches (name, shift_start, shift_end, timezone)
         VALUES ($1, '09:00', '18:00', 'Asia/Kolkata')
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [name],
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`  ✅ Inserted branch: ${name}`);
      } else {
        console.log(`  ⏭️  Branch already exists: ${name}`);
      }
    }

    // 2. Get MD id (must already exist via seed_md.ts)
    console.log('\n── Step 2: Fetching MD account ────────────────────────────');
    const mdRes = await pool.query<{ id: string }>(
      `SELECT id FROM users WHERE role = 'md' LIMIT 1`,
    );
    if (mdRes.rowCount === 0) {
      console.error('❌ No MD account found. Run seed_md.ts first.');
      process.exit(1);
    }
    const mdId = mdRes.rows[0].id;
    console.log(`  ✅ MD id: ${mdId}`);

    // Hash password once — reused for all new accounts
    const passwordHash = await bcrypt.hash(DEFAULT_PASS, 10);

    let totalDirectors = 0;
    let totalGMs = 0;
    let totalOversight = 0;

    // 3. Process each group
    for (const group of GROUPS) {
      console.log(`\n══ ${group.label} ══`);

      // 3a. Insert/update directors
      const directorIds: string[] = [];
      for (const dir of group.directors) {
        const id = await upsertUser(pool, {
          name:         dir.name,
          email:        dir.email,
          role:         'director',
          managerId:    mdId,
          passwordHash,
        });
        directorIds.push(id);
        console.log(`  ✅ Director: ${dir.name} <${dir.email}> (id: ${id})`);
        totalDirectors++;
      }

      // 3b. Insert/update GMs, round-robin across directors
      for (let i = 0; i < group.gms.length; i++) {
        const gm = group.gms[i];
        const assignedDirectorId = directorIds[i % directorIds.length];
        const assignedDirectorName = group.directors[i % group.directors.length].name;

        const gmId = await upsertUser(pool, {
          name:         gm.name,
          email:        gm.email,
          role:         'gm',
          managerId:    assignedDirectorId,
          passwordHash,
        });
        console.log(`  ✅ GM: ${gm.name} <${gm.email}> → Director: ${assignedDirectorName}`);
        totalGMs++;

        // 3c. Assign oversight branches
        for (const branchName of gm.branches) {
          let branchId: string;
          try {
            branchId = await getBranchId(pool, branchName);
          } catch (err: any) {
            console.warn(`     ⚠️  ${err.message} — skipping oversight assignment`);
            continue;
          }

          await pool.query(
            `INSERT INTO user_oversight_branches (user_id, branch_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [gmId, branchId],
          );
          console.log(`     🔗 Oversight: ${branchName}`);
          totalOversight++;
        }
      }
    }

    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`🎉 Seeding complete!`);
    console.log(`   Directors inserted/updated : ${totalDirectors}`);
    console.log(`   GMs inserted/updated       : ${totalGMs}`);
    console.log(`   Oversight rows inserted    : ${totalOversight}`);
    console.log(`   Default password           : ${DEFAULT_PASS}`);
    console.log('═══════════════════════════════════════════════════════');

  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
