// apps/api/src/modules/branches/branch.service.ts
// Performance: branches list is cached in Redis for 10 minutes.
// Only the MD can create/modify branches — enforced at service level for defense-in-depth.
import { Pool } from 'pg';
import Redis from 'ioredis';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import type { UpdateBranchLocationInput } from './branch.schema';
// runInTransaction ensures setHeadBranch is atomic: clearing the old flag and
// setting the new one never leave the DB with zero or two head branches.
import { runInTransaction } from '../../shared/transaction-helper';

const BRANCHES_CACHE_KEY = 'cache:branches:all';
const BRANCHES_CACHE_TTL = 600; // 10 minutes — branches change rarely

export const BranchService = {

  // ─── LIST ALL BRANCHES ───
  // Cached aggressively: 1500 users hitting this on login would destroy DB without cache.
  async listBranches(db: Pool, redis: Redis): Promise<any[]> {
    // Check Redis cache first
    const cached = await redis.get(BRANCHES_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }

    const result = await db.query(
      `SELECT b.id, b.name, b.shift_start, b.shift_end, b.timezone, b.is_active,
              b.is_head_branch,
              b.latitude, b.longitude, b.geofence_radius_m,
              u_gm.name AS gm_name,
              u_admin.name AS admin_name
       FROM branches b
       LEFT JOIN users u_gm    ON b.gm_id    = u_gm.id
       LEFT JOIN users u_admin ON b.admin_id = u_admin.id
       WHERE b.is_active = true
       ORDER BY b.name ASC`
    );

    const branches = result.rows;

    // Cache result
    await redis.setex(BRANCHES_CACHE_KEY, BRANCHES_CACHE_TTL, JSON.stringify(branches));

    return branches;
  },

  // ─── GET SINGLE BRANCH ───
  async getBranch(db: Pool, redis: Redis, branchId: string): Promise<any> {
    const cacheKey = `cache:branch:${branchId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const result = await db.query(
      `SELECT b.*, u_gm.name AS gm_name, u_admin.name AS admin_name
       FROM branches b
       LEFT JOIN users u_gm    ON b.gm_id    = u_gm.id
       LEFT JOIN users u_admin ON b.admin_id = u_admin.id
       WHERE b.id = $1`,
      [branchId]
    );

    if (result.rows.length === 0) throw new NotFoundError('Branch not found');

    const branch = result.rows[0];
    await redis.setex(cacheKey, BRANCHES_CACHE_TTL, JSON.stringify(branch));
    return branch;
  },

  // ─── CREATE BRANCH (MD only) ───
  async createBranch(
    db: Pool,
    redis: Redis,
    requesterRole: string,
    requesterId: string,
    payload: { name: string; shiftStart?: string; shiftEnd?: string; timezone?: string }
  ): Promise<any> {
    if (requesterRole !== 'md') {
      throw new ForbiddenError('Only the MD can create new branches');
    }

    // Derive a unique client_prefix from the branch name using the same DB function
    // that migration 019 used to populate existing branches. The CTE tries the base
    // 3-letter code first, then appends 2, 3 … 50 if that prefix is already taken,
    // mirroring the disambiguation step in 019_client_prefix.sql.
    const result = await db.query(
      `WITH base AS (
         SELECT derive_branch_prefix($1) AS p
       ),
       candidate AS (
         SELECT COALESCE(
           (SELECT opts.c
            FROM (
              SELECT CASE WHEN n = 1 THEN base.p ELSE base.p || n::text END AS c
              FROM base, generate_series(1, 50) AS n
            ) opts
            WHERE NOT EXISTS (
              SELECT 1 FROM branches b WHERE b.client_prefix = opts.c
            )
            ORDER BY length(opts.c), opts.c
            LIMIT 1),
           base.p
         ) AS prefix
         FROM base
       )
       INSERT INTO branches (name, client_prefix, shift_start, shift_end, timezone)
       SELECT $1, candidate.prefix, $2, $3, $4 FROM candidate
       RETURNING *`,
      [
        payload.name,
        payload.shiftStart ?? '09:00',
        payload.shiftEnd  ?? '18:00',
        payload.timezone  ?? 'Asia/Kolkata',
      ]
    );

    const branch = result.rows[0];

    // Bust both the list cache and the individual cache
    await redis.del(BRANCHES_CACHE_KEY);

    return branch;
  },

  // ─── DELETE BRANCH (MD only — soft delete via is_active = false) ───
  async deleteBranch(
    db: Pool,
    redis: Redis,
    requesterRole: string,
    branchId: string
  ): Promise<void> {
    if (requesterRole !== 'md') {
      throw new ForbiddenError('Only the MD can delete branches');
    }

    const result = await db.query(
      `UPDATE branches SET is_active = false WHERE id = $1 RETURNING id`,
      [branchId]
    );

    if (result.rows.length === 0) throw new NotFoundError('Branch not found');

    await Promise.all([
      redis.del(BRANCHES_CACHE_KEY),
      redis.del(`cache:branch:${branchId}`),
    ]);
  },

  // ─── UPDATE BRANCH (MD only) ───
  async updateBranch(
    db: Pool,
    redis: Redis,
    requesterRole: string,
    branchId: string,
    payload: { name?: string; gmId?: string | null; adminId?: string | null; shiftStart?: string; shiftEnd?: string; isActive?: boolean }
  ): Promise<any> {
    if (requesterRole !== 'md') {
      throw new ForbiddenError('Only the MD can update branches');
    }

    // Build dynamic SET clause
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (payload.name       !== undefined) { fields.push(`name = $${idx++}`);        values.push(payload.name); }
    if (payload.gmId       !== undefined) { fields.push(`gm_id = $${idx++}`);       values.push(payload.gmId); }
    if (payload.adminId    !== undefined) { fields.push(`admin_id = $${idx++}`);    values.push(payload.adminId); }
    if (payload.shiftStart !== undefined) { fields.push(`shift_start = $${idx++}`); values.push(payload.shiftStart); }
    if (payload.shiftEnd   !== undefined) { fields.push(`shift_end = $${idx++}`);   values.push(payload.shiftEnd); }
    if (payload.isActive   !== undefined) { fields.push(`is_active = $${idx++}`);   values.push(payload.isActive); }

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    values.push(branchId);
    const result = await db.query(
      `UPDATE branches SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) throw new NotFoundError('Branch not found');

    // Bust caches
    await Promise.all([
      redis.del(BRANCHES_CACHE_KEY),
      redis.del(`cache:branch:${branchId}`),
    ]);

    return result.rows[0];
  },

  // ─── SET BRANCH LOCATION (Management only) ───
  // Stores the geofence coordinates and radius for a branch.
  // Passing latitude=null / longitude=null clears the geofence — the branch then
  // has no location restriction and check-in works from anywhere.
  async setBranchLocation(
    db: Pool,
    redis: Redis,
    branchId: string,
    payload: UpdateBranchLocationInput
  ): Promise<any> {
    // Build SET clause: radius is only changed when explicitly supplied
    const result = await db.query(
      `UPDATE branches
       SET latitude          = $1,
           longitude         = $2,
           geofence_radius_m = COALESCE($3, geofence_radius_m)
       WHERE id = $4
       RETURNING id, name, latitude, longitude, geofence_radius_m`,
      [
        payload.latitude,
        payload.longitude,
        payload.geofenceRadiusM ?? null,
        branchId,
      ]
    );

    if (result.rows.length === 0) throw new NotFoundError('Branch not found');

    // Bust branch list/detail caches AND the attendance geofence cache so the next
    // office check-in picks up the new coordinates without waiting for the 10-min TTL.
    await Promise.all([
      redis.del(BRANCHES_CACHE_KEY),
      redis.del(`cache:branch:${branchId}`),
      redis.del(`geo:${branchId}`),
    ]);

    return result.rows[0];
  },

  // ─── SET HEAD BRANCH (Management only) ───
  // Atomically moves the is_head_branch flag to the chosen branch. Exactly one
  // branch will have is_head_branch = true after this call completes, or the
  // transaction rolls back leaving the state unchanged.
  async setHeadBranch(db: Pool, redis: Redis, branchId: string): Promise<any> {
    const branch = await runInTransaction(db, async (client) => {
      // Clear the old head branch (0 or 1 row — safe either way)
      await client.query(
        `UPDATE branches SET is_head_branch = false WHERE is_head_branch = true`
      );
      // Set the new one — only succeeds if the branch exists and is active
      const result = await client.query(
        `UPDATE branches
         SET    is_head_branch = true
         WHERE  id = $1 AND is_active = true
         RETURNING id, name, is_head_branch`,
        [branchId]
      );
      if (result.rows.length === 0) {
        // Trigger ROLLBACK: the first UPDATE's cleared flag is also reverted
        throw new NotFoundError('Branch not found or is inactive');
      }
      return result.rows[0];
    });

    // Bust the branches list cache so the next GET /branches reflects the change
    await redis.del(BRANCHES_CACHE_KEY);
    return branch;
  },
};
