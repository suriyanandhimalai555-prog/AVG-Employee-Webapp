// apps/api/src/modules/users/user.service.ts
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { CreateUserInput, UserResponse, UpdateOversightBranchesInput } from './user.schema';
import { populateAvatarUrls } from '../../shared/avatar.util';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';
import { bustHierarchyCache } from '../../shared/hierarchy';
import { getHierarchyVisibleUserIds } from '../../shared/hierarchy-visibility';
import { resolveAndValidateManagerId } from '../../shared/hierarchy-policy';

export const UserService = {

  // Create a new user (with password hashing)
  async createUser(
    db: Pool,
    redis: Redis,
    requesterId: string,
    requesterRole: string,
    requesterBranchId: string | null,
    payload: CreateUserInput
  ): Promise<UserResponse> {
    // ── Permission matrix ──
    // MD: can create director, gm, branch_manager, abm, sales_officer, branch_admin, client
    // GM: can create branch_manager, abm, sales_officer, branch_admin, client
    // Branch Admin: can create branch_manager, abm, sales_officer, client (own branch only)
    const creatableByRole: Record<string, string[]> = {
      md:           ['director', 'gm', 'branch_manager', 'abm', 'sales_officer', 'branch_admin', 'client'],
      gm:           ['branch_manager', 'abm', 'sales_officer', 'branch_admin', 'client'],
      branch_admin: ['branch_manager', 'abm', 'sales_officer', 'client'],
    };

    const allowed = creatableByRole[requesterRole];
    if (!allowed) {
      throw new ForbiddenError('You do not have permission to create users');
    }
    if (!allowed.includes(payload.role)) {
      throw new ForbiddenError(`Your role cannot create a user with role "${payload.role}"`);
    }

    // Only one MD may exist at any time
    if (payload.role === 'md') {
      const existing = await db.query(`SELECT id FROM users WHERE role = 'md' LIMIT 1`);
      if (existing.rows.length > 0) {
        throw new ConflictError('A Managing Director already exists. Only one MD is allowed.');
      }
    }

    // Branch Admin can only add users to their own branch
    if (requesterRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(db, requesterId, requesterBranchId);
      payload.branchId = branchId;
    }

    // Duplicate email check
    const emailResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [payload.email]
    );
    if (emailResult.rows.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(payload.password, saltRounds);

    // Director and GM never have a branch_id — their branch access comes entirely from
    // user_oversight_branches. Nullify here regardless of what the caller sent.
    if (payload.role === 'director' || payload.role === 'gm') {
      payload.branchId = null;
    }

    // Centralized hierarchy validation for manager_id assignment.
    payload.managerId = await resolveAndValidateManagerId(db, {
      id: requesterId,
      role: requesterRole,
    }, {
      role: payload.role,
      managerId: payload.managerId ?? null,
      branchId: payload.branchId ?? null,
    });

    const result = await db.query(
      `INSERT INTO users (
        name, email, password_hash, role, branch_id, manager_id, has_smartphone
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [
        payload.name,
        payload.email,
        passwordHash,
        payload.role,
        payload.branchId || null,
        payload.managerId || null,
        payload.hasSmartphone,
      ]
    );

    const newUserId: string = result.rows[0].id;

    // GM gets direct oversight branch assignments.
    if (payload.role === 'gm' && payload.oversightBranchIds?.length) {
      for (const branchId of payload.oversightBranchIds) {
        await db.query(
          `INSERT INTO user_oversight_branches (user_id, branch_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUserId, branchId]
        );
      }
    }

    // If a GM reports to a Director via manager_id, persist the explicit GM↔Director link too.
    // This keeps MD assignment UI (which reads gm_director_links) in sync with hierarchy creation.
    if (payload.role === 'gm' && payload.managerId) {
      const managerRoleResult = await db.query<{ role: string }>(
        `SELECT role FROM users WHERE id = $1`,
        [payload.managerId]
      );
      if (managerRoleResult.rows[0]?.role === 'director') {
        await db.query(
          `INSERT INTO gm_director_links (gm_id, director_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUserId, payload.managerId]
        );
      }
    }

    // Director gets assigned to selected GMs, then inherits the combined GM branch scope.
    if (payload.role === 'director' && payload.oversightGmIds?.length) {
      const gmValidation = await db.query<{ id: string }>(
        `SELECT id
         FROM users
         WHERE id = ANY($1::uuid[])
           AND role = 'gm'
           AND is_active = true`,
        [payload.oversightGmIds]
      );
      if (gmValidation.rows.length !== payload.oversightGmIds.length) {
        throw new NotFoundError('One or more selected GMs were not found');
      }

      for (const gmId of payload.oversightGmIds) {
        await db.query(
          `INSERT INTO gm_director_links (gm_id, director_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [gmId, newUserId]
        );
      }

      const gmBranches = await db.query<{ branch_id: string }>(
        `SELECT DISTINCT branch_id
         FROM user_oversight_branches
         WHERE user_id = ANY($1::uuid[])
           AND branch_id IS NOT NULL`,
        [payload.oversightGmIds]
      );
      for (const row of gmBranches.rows) {
        await db.query(
          `INSERT INTO user_oversight_branches (user_id, branch_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUserId, row.branch_id]
        );
      }
    }

    // For branch_admin, link them to their branch so resolveBranchAdminBranchId works without a JWT refresh
    if (payload.role === 'branch_admin' && payload.branchId) {
      await db.query(
        `UPDATE branches SET admin_id = $1 WHERE id = $2`,
        [newUserId, payload.branchId]
      );
    }

    // Bust the full ancestor chain from newUserId so every level above (ABM → BM → GM → Director)
    // sees the new subordinate immediately — bustHierarchyCache now walks up the tree itself
    if (payload.managerId) {
      await bustHierarchyCache(newUserId);
    }

    return this.getUserById(db, redis, newUserId);
  },

  // ─── GET USER BY ID ───
  async getUserById(db: Pool, redis: Redis, userId: string): Promise<UserResponse> {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id AS "branchId",
              b.name AS "branchName", u.manager_id AS "managerId",
              u.profile_photo_key,
              u.is_active AS "isActive", u.created_at AS "createdAt"
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    const user = result.rows[0];
    
    await populateAvatarUrls(redis, [user], u => u.profile_photo_key, (u, url) => u.profilePhotoUrl = url);
    delete user.profile_photo_key;

    return user;
  },

  // Fetch the oversight branch IDs assigned to a Director or GM
  async getOversightBranches(
    db: Pool,
    _requesterId: string,
    requesterRole: string,
    targetUserId: string
  ): Promise<{ branchIds: string[]; gmIds: string[] }> {
    if (requesterRole !== 'md') {
      throw new ForbiddenError('Only MD can view oversight branch assignments');
    }

    const targetResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [targetUserId]
    );
    if (targetResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    if (!['director', 'gm'].includes(targetResult.rows[0].role)) {
      throw new ForbiddenError('Oversight branches only apply to Director and GM roles');
    }

    const branchResult = await db.query(
      `SELECT branch_id FROM user_oversight_branches WHERE user_id = $1 ORDER BY branch_id`,
      [targetUserId]
    );

    const gmResult = await db.query(
      `SELECT DISTINCT gm_id
       FROM (
         SELECT gdl.gm_id
         FROM gm_director_links gdl
         WHERE gdl.director_id = $1
         UNION
         SELECT u.id AS gm_id
         FROM users u
         WHERE u.role = 'gm'
           AND u.manager_id = $1
           AND u.is_active = true
       ) x
       ORDER BY gm_id`,
      [targetUserId]
    );

    return {
      branchIds: branchResult.rows.map((r: any) => r.branch_id),
      gmIds: gmResult.rows.map((r: any) => r.gm_id),
    };
  },

  // Replace the full set of oversight branches for a Director or GM (MD only)
  async updateOversightBranches(
    db: Pool,
    redis: Redis,
    _requesterId: string,
    requesterRole: string,
    targetUserId: string,
    payload: UpdateOversightBranchesInput
  ): Promise<UserResponse> {
    if (requesterRole !== 'md') {
      throw new ForbiddenError('Only MD can edit oversight branch assignments');
    }

    const targetResult = await db.query(
      `SELECT role FROM users WHERE id = $1`,
      [targetUserId]
    );
    if (targetResult.rows.length === 0) {
      throw new NotFoundError('User not found');
    }
    if (!['director', 'gm'].includes(targetResult.rows[0].role)) {
      throw new ForbiddenError('Oversight branches only apply to Director and GM roles');
    }

    const targetRole = targetResult.rows[0].role;

    // GM keeps direct branch assignments.
    if (targetRole === 'gm') {
      await db.query(`DELETE FROM user_oversight_branches WHERE user_id = $1`, [targetUserId]);
      for (const branchId of payload.branchIds) {
        await db.query(
          `INSERT INTO user_oversight_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [targetUserId, branchId]
        );
      }
    }

    // Director uses GM links and inherited branch scope from those GMs.
    if (targetRole === 'director') {
      const gmIds = payload.gmIds ?? [];
      if (gmIds.length > 0) {
        const gmValidation = await db.query<{ id: string }>(
          `SELECT id
           FROM users
           WHERE id = ANY($1::uuid[])
             AND role = 'gm'
             AND is_active = true`,
          [gmIds]
        );
        if (gmValidation.rows.length !== gmIds.length) {
          throw new NotFoundError('One or more selected GMs were not found');
        }
      }

      await db.query(`DELETE FROM gm_director_links WHERE director_id = $1`, [targetUserId]);
      await db.query(`DELETE FROM user_oversight_branches WHERE user_id = $1`, [targetUserId]);

      for (const gmId of gmIds) {
        await db.query(
          `INSERT INTO gm_director_links (gm_id, director_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [gmId, targetUserId]
        );
      }

      if (gmIds.length > 0) {
        const gmBranches = await db.query<{ branch_id: string }>(
          `SELECT DISTINCT branch_id
           FROM user_oversight_branches
           WHERE user_id = ANY($1::uuid[])
             AND branch_id IS NOT NULL`,
          [gmIds]
        );

        for (const row of gmBranches.rows) {
          await db.query(
            `INSERT INTO user_oversight_branches (user_id, branch_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
            [targetUserId, row.branch_id]
          );
        }
      }
    }

    // Bust cache so the Director/GM immediately sees their new scope
    await bustHierarchyCache(targetUserId);

    return this.getUserById(db, redis, targetUserId);
  },

  // List users for management table, scoped per role, with pagination and search
  async listUsers(
    db: Pool,
    redis: Redis,
    requesterId: string,
    requesterRole: string,
    requesterBranchId: string | null,
    queryParams: { role?: string; branchId?: string; search?: string; page?: number; limit?: number }
  ): Promise<{ data: UserResponse[]; total: number; page: number; limit: number; totalPages: number }> {
    const page = Math.max(1, queryParams.page ?? 1);
    const limit = Math.min(100, Math.max(1, queryParams.limit ?? 50));

    const base = `
      SELECT u.id, u.name, u.email, u.role, u.branch_id AS "branchId",
             b.name AS "branchName", u.manager_id AS "managerId",
             u.profile_photo_key,
             u.is_active AS "isActive", u.created_at AS "createdAt"
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (queryParams.role) {
      conditions.push(`u.role = $${paramIndex++}`);
      params.push(queryParams.role);
    }

    if (queryParams.search?.trim()) {
      conditions.push(`(u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`);
      params.push(`%${queryParams.search.trim()}%`);
      paramIndex++;
    }

    if (requesterRole === 'md') {
      // MD sees everyone — no extra scope condition needed
    } else if (requesterRole === 'branch_admin') {
      const branchId = await resolveBranchAdminBranchId(db, requesterId, requesterBranchId);
      conditions.push(`u.branch_id = $${paramIndex++}`);
      params.push(branchId);
    } else if (requesterRole === 'director' || requesterRole === 'gm') {
      const scopeIds = await getHierarchyVisibleUserIds(db, {
        id: requesterId,
        role: requesterRole,
        branchId: requesterBranchId,
      }, {
        includeSelf: false,
        allowAbmBranchFallback: true,
      });
      if (scopeIds.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 };
      conditions.push(`u.id = ANY($${paramIndex++}::uuid[])`);
      params.push(scopeIds);
    } else {
      const scopeIds = await getHierarchyVisibleUserIds(db, {
        id: requesterId,
        role: requesterRole,
        branchId: requesterBranchId,
      }, {
        includeSelf: false,
        allowAbmBranchFallback: true,
      });
      if (scopeIds.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 };
      conditions.push(`u.id = ANY($${paramIndex++}::uuid[])`);
      params.push(scopeIds);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult, dataResult] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM users u ${where}`, params),
      db.query(
        `${base} ${where} ORDER BY u.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, (page - 1) * limit]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count, 10);
    const users = dataResult.rows;

    await populateAvatarUrls(redis, users, u => u.profile_photo_key, (u, url) => u.profilePhotoUrl = url);
    users.forEach(u => delete u.profile_photo_key);

    return {
      data: users,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
};
