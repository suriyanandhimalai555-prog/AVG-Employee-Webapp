// apps/api/src/modules/users/user.service.ts
import { Pool, PoolClient } from 'pg';
import bcrypt from 'bcrypt';
import Redis from 'ioredis';
import { CreateUserInput, UserResponse, UpdateOversightBranchesInput, ExecuteTransferInput, RenameUserInput } from './user.schema';
import { populateAvatarUrls } from '../../shared/avatar.util';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';
import { bustHierarchyCache } from '../../shared/hierarchy';
import { getHierarchyVisibleUserIds } from '../../shared/hierarchy-visibility';
import { resolveAndValidateManagerId, assertReplacementManagerRole } from '../../shared/hierarchy-policy';
import { generateUploadUrl, generateDownloadUrl } from '../../config/s3';
import { Role, TRANSFER_MANAGE_ROLES, TRANSFER_TARGET_ROLES, USER_RENAME_ROLES, BRANCHLESS_ROLES } from '../../shared/role-constants';
import { runInTransaction } from '../../shared/transaction-helper';

export interface UserDocument {
  id: string;
  userId: string;
  s3Key: string;
  fileName: string;
  fileType?: string;
  createdAt: string;
  downloadUrl?: string;
}

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
      md:           ['director', 'gm', 'branch_manager', 'abm', 'sales_officer', 'branch_admin', 'oa'],
      gm:           ['branch_manager', 'abm', 'sales_officer', 'branch_admin', 'oa'],
      branch_admin: ['branch_manager', 'abm', 'sales_officer', 'oa'],
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

    // Normalise email to lowercase before any check or insert.
    payload.email = payload.email.toLowerCase();

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
    // user_oversight_branches. Use the shared BRANCHLESS_ROLES set and nullify regardless
    // of what the caller sent.
    if ((BRANCHLESS_ROLES as readonly string[]).includes(payload.role)) {
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

  // ─── GET SUPERIORS ───
  // Walks the manager_id chain upward to return all managers in the user's hierarchy.
  async getSuperiors(db: Pool, redis: Redis, userId: string): Promise<UserResponse[]> {
    const result = await db.query(
      `WITH RECURSIVE ancestors AS (
        SELECT u.id, u.name, u.email, u.role, u.branch_id, u.manager_id, u.profile_photo_key,
               1 AS level
        FROM users u WHERE id = (SELECT manager_id FROM users WHERE id = $1)
        UNION ALL
        SELECT u.id, u.name, u.email, u.role, u.branch_id, u.manager_id, u.profile_photo_key,
               a.level + 1
        FROM users u
        JOIN ancestors a ON u.id = a.manager_id
      )
      SELECT a.id, a.name, a.email, a.role, a.branch_id AS "branchId",
             b.name AS "branchName", a.manager_id AS "managerId",
             a.profile_photo_key
      FROM ancestors a
      LEFT JOIN branches b ON a.branch_id = b.id
      ORDER BY a.level ASC`,
      [userId]
    );

    // Also include MD if not in the direct chain (MD might not be a direct manager if there's no GM linked)
    // Actually, MD is always the top level so they should be manually appended if not present
    const users = result.rows;

    const mdResult = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id AS "branchId",
              b.name AS "branchName", u.manager_id AS "managerId",
              u.profile_photo_key
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.role = 'md' AND u.is_active = true LIMIT 1`
    );

    if (mdResult.rows.length > 0) {
      const md = mdResult.rows[0];
      if (!users.some(u => u.id === md.id)) {
        users.push(md);
      }
    }

    await populateAvatarUrls(redis, users, u => u.profile_photo_key, (u, url) => u.profilePhotoUrl = url);
    users.forEach(u => delete u.profile_photo_key);

    return users;
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
      `SELECT id AS gm_id
       FROM users
       WHERE role = 'gm'
         AND manager_id = $1
         AND is_active = true
       ORDER BY id`,
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

      await db.query(`DELETE FROM user_oversight_branches WHERE user_id = $1`, [targetUserId]);

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

    if (requesterRole === Role.MD || requesterRole === Role.MANAGEMENT) {
      // MD and management see everyone — management sits outside the manager_id
      // tree, so hierarchy scoping would return nothing for it.
    } else if (requesterRole === Role.BRANCH_ADMIN) {
      const branchId = await resolveBranchAdminBranchId(db, requesterId, requesterBranchId);
      conditions.push(`u.branch_id = $${paramIndex++}`);
      params.push(branchId);
    } else {
      // Everyone else (director / gm / bm / abm / …) sees their hierarchy subtree.
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
  },

  // ─── MANAGER OPTIONS (for dropdowns) ───
  // Returns all active users of the requested roles, no pagination.
  // Used exclusively to populate the "Reports To" manager dropdown when creating a user.
  // MD only — they are the only role that creates directors/GMs from a full org list.
  async getManagerOptions(
    db: Pool,
    _requesterId: string,
    _requesterRole: string,
    roles: string[],
    // TS: optional branch filter — when set, only managers valid for that branch are returned
    branchId: string | null = null
  ): Promise<{ id: string; name: string; role: string; branchId: string | null; branchName: string | null }[]> {
    // When branchId is provided, mirror the branch-scope rules in resolveAndValidateManagerId:
    //   • same-branch users always qualify
    //   • MD has no branch_id but is always valid (e.g. as manager for Director)
    //   • GM / Director qualify when they have an oversight row for the target branch
    // When branchId is null, return all active users of the requested roles (original behaviour).
    const result = await db.query(
      `SELECT u.id, u.name, u.role, u.branch_id AS "branchId", b.name AS "branchName"
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.role = ANY($1::text[])
         AND u.is_active = true
         AND (
           $2::uuid IS NULL
           OR u.branch_id = $2::uuid
           OR u.role = 'md'
           OR (
             u.role IN ('gm', 'director')
             AND EXISTS (
               SELECT 1 FROM user_oversight_branches uob
               WHERE uob.user_id = u.id AND uob.branch_id = $2::uuid
             )
           )
         )
       ORDER BY u.name ASC`,
      [roles, branchId]
    );
    return result.rows;
  },

  // ─── USER DOCUMENTS (PROOFS) ───

  async getPresignedProfileUploadUrl(userId: string, kind: 'photo' | 'proof', contentType: string) {
    const timestamp = Date.now();
    const extension = contentType.split('/')[1] || 'bin';
    const folder = kind === 'photo' ? 'profile/photos' : 'profile/proofs';
    const fileKey = `${folder}/${userId}-${timestamp}.${extension}`;
    
    const uploadUrl = await generateUploadUrl(fileKey, contentType);
    return { uploadUrl, fileKey };
  },

  async addDocument(db: Pool, userId: string, s3Key: string, fileName: string, fileType?: string) {
    const result = await db.query(
      `INSERT INTO user_documents (user_id, s3_key, file_name, file_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, s3Key, fileName, fileType || null]
    );
    return result.rows[0];
  },

  async removeDocument(db: Pool, userId: string, documentId: string, userRole: string) {
    // Only MD or the owner can delete
    const checkResult = await db.query(`SELECT user_id FROM user_documents WHERE id = $1`, [documentId]);
    if (checkResult.rows.length === 0) throw new NotFoundError('Document not found');
    
    if (userRole !== 'md' && checkResult.rows[0].user_id !== userId) {
      throw new ForbiddenError('You do not have permission to delete this document');
    }

    await db.query(`DELETE FROM user_documents WHERE id = $1`, [documentId]);
  },

  async getDocuments(db: Pool, redis: Redis, userId: string): Promise<UserDocument[]> {
    const result = await db.query(
      `SELECT id, user_id AS "userId", s3_key AS "s3Key", file_name AS "fileName", 
              file_type AS "fileType", created_at AS "createdAt"
       FROM user_documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    const docs = result.rows;
    await populateAvatarUrls(redis, docs, d => d.s3Key, (d, url) => d.downloadUrl = url);
    return docs;
  },

  // ─── DEACTIVATED USERS (MD + Management) ───

  async getDeactivatedUsers(db: Pool, redis: Redis): Promise<any[]> {
    const result = await db.query(
      `SELECT
         u.id,
         u.name,
         u.email,
         u.role,
         u.branch_id,
         u.deactivated_at,
         u.deactivation_reason,
         u.profile_photo_key,
         b.name AS branch_name,
         EXTRACT(DAY FROM NOW() - u.deactivated_at)::int AS days_inactive,
         (
           SELECT a.date
           FROM attendance a
           WHERE a.user_id = u.id
             AND a.status IN ('present', 'half_day', 'field')
           ORDER BY a.date DESC
           LIMIT 1
         ) AS last_present_date
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.is_active = false
         AND u.deactivation_reason = 'auto_absent'
       ORDER BY u.deactivated_at DESC`
    );

    const users = result.rows;
    await populateAvatarUrls(redis, users, u => u.profile_photo_key, (u, url) => u.profilePhotoUrl = url);
    users.forEach(u => delete u.profile_photo_key);
    return users;
  },

  async reactivateUser(db: Pool, _redis: Redis, targetUserId: string, _actingMdId: string): Promise<any> {
    const result = await db.query(
      `UPDATE users
       SET is_active           = true,
           deactivated_at      = NULL,
           deactivation_reason = NULL
       WHERE id = $1
         AND is_active = false
         AND deactivation_reason = 'auto_absent'
       RETURNING id, name, role`,
      [targetUserId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found or is not auto-deactivated');
    }

    await bustHierarchyCache(targetUserId);
    return result.rows[0];
  },

  // ─── TRANSFER / PROMOTION — MANAGEMENT DIRECT EXECUTE ────────────────────────
  // Single-step: Management fills the form → transfer executes immediately.
  // The user_transfer_requests table is used as an audit trail (status='approved',
  // requested_by = decided_by = actor).  No pending/approval/rejection flow.

  // ── executeTransfer ───────────────────────────────────────────────────────────
  // Validates the move then executes it atomically in one transaction:
  // re-parent orphaned reports, update the target user, clear oversight if GM/Director,
  // write one audit row, bust all affected hierarchy + profile caches.
  async executeTransfer(
    db: Pool,
    redis: Redis,
    actorId: string,
    actorRole: string,
    payload: ExecuteTransferInput
  ): Promise<any> {
    // TS: only Management may execute transfers (MD is view-only)
    if (!(TRANSFER_MANAGE_ROLES as readonly string[]).includes(actorRole)) {
      throw new ForbiddenError('Only Management may execute transfers');
    }

    // TS: md and management cannot be transfer destinations:
    //     md is a singleton (CLAUDE.md "MD = 1 person only");
    //     management is a back-office role outside the reporting chain with no branch_id.
    if (!(TRANSFER_TARGET_ROLES as readonly string[]).includes(payload.newRole)) {
      throw new ValidationError(
        `Role "${payload.newRole}" is not a valid transfer destination. ` +
        `Allowed roles: ${[...TRANSFER_TARGET_ROLES].join(', ')}`
      );
    }

    return runInTransaction(db, async (client: PoolClient) => {
      // Lock + re-read target user (is_active guard ensures we don't move a deactivated account)
      const targetRes = await client.query(
        `SELECT id, role, branch_id, manager_id FROM users WHERE id = $1 AND is_active = true FOR UPDATE`,
        [payload.userId]
      );
      if (targetRes.rows.length === 0) throw new NotFoundError('Target user not found or inactive');
      const target = targetRes.rows[0];

      // Director and GM are branchless — force branch to null so resolveAndValidateManagerId
      // does not apply branch-scoping when looking up their manager (mirrors createUser:84-88).
      const isBranchless = (BRANCHLESS_ROLES as readonly string[]).includes(payload.newRole);
      // TS: computed once and reused for validation, the UPDATE, and the audit row
      const effectiveNewBranchId = isBranchless ? null : (payload.newBranchId ?? target.branch_id);

      // Validate the proposed destination (role + branch + manager hierarchy rules)
      await resolveAndValidateManagerId(db, { id: actorId, role: actorRole }, {
        role:      payload.newRole,
        branchId:  effectiveNewBranchId,
        managerId: payload.newManagerId ?? null,
      });

      // TS: cycle guard — reject if newManagerId is the target itself, or is a descendant
      // of the target. Without this, manager_id loops would corrupt UNION ALL recursive CTEs.
      if (payload.newManagerId) {
        if (payload.newManagerId === target.id) {
          throw new ValidationError('A user cannot be their own manager');
        }
        // Walk the proposed manager's ancestor chain upward (UNION deduplicates to handle any
        // pre-existing data anomalies). If the target appears anywhere in that chain it means
        // newManagerId currently reports (directly or indirectly) to the target — setting
        // target.manager_id = newManagerId would create a cycle.
        const cycleRes = await client.query(
          `WITH RECURSIVE ancestors AS (
             SELECT id, manager_id FROM users WHERE id = $1
             UNION
             SELECT u.id, u.manager_id FROM users u
             JOIN ancestors a ON u.id = a.manager_id
             WHERE a.manager_id IS NOT NULL
           )
           SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1`,
          [payload.newManagerId, target.id]
        );
        if (cycleRes.rows.length > 0) {
          throw new ValidationError(
            'Cannot set a manager that reports to this user — this would create a cycle in the hierarchy'
          );
        }
      }

      // If the target has active direct reports, a replacement manager is required
      const reportsRes = await client.query(
        `SELECT id, role FROM users WHERE manager_id = $1 AND is_active = true`,
        [target.id]
      );
      if (reportsRes.rows.length > 0) {
        if (!payload.replacementManagerId) {
          throw new ValidationError('This user has active reports — a replacement manager must be specified');
        }
        // TS: validate the replacement is active and in the target's current branch
        const replRes = await client.query(
          `SELECT id, role, branch_id, is_active FROM users WHERE id = $1`,
          [payload.replacementManagerId]
        );
        if (replRes.rows.length === 0 || !replRes.rows[0].is_active) {
          throw new ValidationError('Replacement manager not found or inactive');
        }
        if (replRes.rows[0].branch_id !== target.branch_id) {
          throw new ValidationError('Replacement manager must belong to the same branch as the person being moved');
        }
        // TS: validate the replacement's role is compatible with every report role it inherits
        const reportRoles = [...new Set(reportsRes.rows.map((r: { role: string }) => r.role as string))];
        assertReplacementManagerRole(replRes.rows[0].role, reportRoles);
      }

      // TS: collect IDs of re-parented reports for cache busting below
      const reparentedIds: string[] = [];

      // Re-parent orphaned direct reports to the replacement manager if provided
      if (payload.replacementManagerId) {
        const reparentRes = await client.query(
          `UPDATE users SET manager_id = $1
           WHERE manager_id = $2 AND is_active = true
           RETURNING id`,
          [payload.replacementManagerId, target.id]
        );
        reparentedIds.push(...reparentRes.rows.map((r: { id: string }) => r.id));
      }

      // Apply the position change to the target user; branchless roles always get NULL branch_id
      await client.query(
        `UPDATE users SET role = $1, branch_id = $2, manager_id = $3 WHERE id = $4`,
        [payload.newRole, effectiveNewBranchId, payload.newManagerId ?? null, target.id]
      );

      // If the target was a GM/Director, clear their oversight branch assignments
      // (scoped to the old position; the new admin will re-assign as needed)
      if ([Role.GM, Role.DIRECTOR].includes(target.role as typeof Role.GM)) {
        await client.query(
          `DELETE FROM user_oversight_branches WHERE user_id = $1`,
          [target.id]
        );
      }

      // Write one audit row: actor is both requester and decider (direct execute)
      await client.query(
        `INSERT INTO user_transfer_requests
           (user_id, kind, new_role, new_branch_id, new_manager_id,
            replacement_manager_id, reason,
            status, requested_by, decided_by, decided_at,
            previous_role, previous_branch_id, previous_manager_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,
                 'approved',$8,$8,now(),
                 $9,$10,$11)`,
        [
          target.id,
          payload.kind,
          payload.newRole,
          effectiveNewBranchId,
          payload.newManagerId ?? null,
          payload.replacementManagerId ?? null,
          payload.reason ?? null,
          actorId,
          target.role,
          target.branch_id,
          target.manager_id,
        ]
      );

      // ── Cache invalidation ────────────────────────────────────────────────────
      // Bust the old ancestor chain then the new chain so subtree/oversight caches
      // for everyone above in both paths are cleared (GAPS.md #15).
      const allAffected = [target.id, ...reparentedIds];
      if (payload.replacementManagerId) allAffected.push(payload.replacementManagerId);
      if (target.manager_id) await bustHierarchyCache(target.manager_id);  // old chain
      if (payload.newManagerId) await bustHierarchyCache(payload.newManagerId); // new chain
      await Promise.allSettled(allAffected.map(id => bustHierarchyCache(id)));
      // Clear 30-min profile cache so the next /me call sees the new role/branch
      await Promise.allSettled(allAffected.map(id => redis.del(`user:${id}`)));

      return {
        userId: target.id,
        previousRole: target.role,
        previousBranchId: target.branch_id,
        newRole: payload.newRole,
        newBranchId: effectiveNewBranchId,
        reparentedReports: reparentedIds.length,
        oversightCleared: [Role.GM, Role.DIRECTOR].includes(target.role as typeof Role.GM),
      };
    });
  },

  // ── listTransferRequests ──────────────────────────────────────────────────────
  // Returns executed-transfer history for Management. Defaults to approved rows.
  async listTransferRequests(
    db: Pool,
    requesterRole: string,
    status?: string
  ): Promise<any[]> {
    // TS: Management-only — this is the audit trail for management actions
    if (!(TRANSFER_MANAGE_ROLES as readonly string[]).includes(requesterRole)) {
      throw new ForbiddenError('Only Management may view the transfer history');
    }
    // Default to 'approved' — there are no pending rows in the new model
    const statusFilter = status ?? 'approved';
    const res = await db.query(
      `SELECT r.*,
              u.name  AS user_name,  u.role  AS current_role,
              b.name  AS new_branch_name,
              rb.name AS executed_by_name
       FROM user_transfer_requests r
       JOIN users u   ON u.id = r.user_id
       LEFT JOIN branches b  ON b.id = r.new_branch_id
       JOIN users rb  ON rb.id = r.requested_by
       WHERE r.status = $1
       ORDER BY r.created_at DESC`,
      [statusFilter]
    );
    return res.rows;
  },

  // ── renameUser ────────────────────────────────────────────────────────────────
  // Changes an employee's display name. Management-only, single-step, immediate.
  // Writes a permanent audit row and busts the user profile + hierarchy caches.
  async renameUser(
    // TS: pg connection pool — all queries run through this
    db: Pool,
    // TS: ioredis client for cache invalidation
    redis: Redis,
    // TS: UUID of the acting management account
    actorId: string,
    // TS: role string of the actor — re-checked here for defence-in-depth
    actorRole: string,
    // TS: validated rename payload from the Zod schema
    payload: RenameUserInput
  ): Promise<{ userId: string; previousName: string; newName: string }> {
    // TS: re-check the role inside the service as defence-in-depth (route guards first)
    if (!(USER_RENAME_ROLES as readonly string[]).includes(actorRole)) {
      throw new ForbiddenError('Only Management may rename employees');
    }

    return runInTransaction(db, async (client: PoolClient) => {
      // Lock the target row so concurrent renames on the same user are serialised
      const res = await client.query(
        `SELECT id, name FROM users WHERE id = $1 AND is_active = true FOR UPDATE`,
        [payload.userId]
      );
      if (res.rows.length === 0) {
        throw new NotFoundError('Employee not found or inactive');
      }
      // TS: row is typed as any — extract fields explicitly
      const previous_name: string = res.rows[0].name;

      // Reject no-op renames so the audit log stays meaningful
      if (payload.name.trim() === previous_name.trim()) {
        throw new ValidationError('Name unchanged — enter a different name');
      }

      // Apply the name change
      await client.query(
        `UPDATE users SET name = $1 WHERE id = $2`,
        [payload.name.trim(), payload.userId]
      );

      // Write a permanent, append-only audit row
      await client.query(
        `INSERT INTO user_rename_audit
           (user_id, previous_name, new_name, reason, renamed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [payload.userId, previous_name, payload.name.trim(), payload.reason ?? null, actorId]
      );

      // ── Cache invalidation (GAPS.md #15) ────────────────────────────────────
      // The 30-min profile blob (user:{id}) includes name — must bust it so the
      // next /me call returns the updated name. Also bust hierarchy caches because
      // org-tree endpoints that join name through users may embed the stale name.
      await redis.del(`user:${payload.userId}`);
      await bustHierarchyCache(payload.userId);

      return {
        userId:       payload.userId,
        previousName: previous_name,
        newName:      payload.name.trim(),
      };
    });
  },

  // ── getDirectorLeadershipTree ─────────────────────────────────────────────────
  // Returns all directors (or just the requesting director) with their subordinate
  // GMs and each GM's explicitly-assigned oversight branches.  Used by the frontend
  // /leadership/directors page to render the expandable org breakdown.
  //
  // Access:
  //   md / management → all directors
  //   director        → own record only
  //   everyone else   → ForbiddenError
  //
  // Data shape avoids N+1 with three set-based queries then in-memory assembly.
  async getDirectorLeadershipTree(
    // TS: pg connection pool — all queries use this shared pool
    db: Pool,
    // TS: ioredis client — needed by populateAvatarUrls for presigned photo URLs
    redis: Redis,
    // TS: UUID of the requesting user
    requesterId: string,
    // TS: role string from the JWT — gates access to this endpoint
    requesterRole: string
  ): Promise<any[]> {
    // TS: only these roles may call this endpoint
    const ALLOWED: readonly string[] = [Role.MD, Role.MANAGEMENT, Role.DIRECTOR];
    if (!ALLOWED.includes(requesterRole)) {
      throw new ForbiddenError('Only MD, Management, or Directors may view this page');
    }

    // ── Query 1: directors ───────────────────────────────────────────────────
    // A director sees only their own record; MD/management see all active directors.
    // TS: paramIndex controls $N numbering for conditional WHERE clauses
    let directorsQuery = `
      SELECT u.id, u.name, u.role, u.branch_id AS "branchId",
             b.name AS "branchName", u.profile_photo_key
      FROM users u
      LEFT JOIN branches b ON b.id = u.branch_id
      WHERE u.role = 'director'
        AND u.is_active = true`;
    // TS: director self-scope — append an extra condition so they can't see peers
    const directorsParams: any[] = [];
    if (requesterRole === Role.DIRECTOR) {
      directorsQuery += ` AND u.id = $1`;
      directorsParams.push(requesterId);
    }
    directorsQuery += ` ORDER BY u.name`;

    const directorsResult = await db.query(directorsQuery, directorsParams);
    // TS: typed as any[] because the query returns dynamic columns
    const directors: any[] = directorsResult.rows;

    if (directors.length === 0) {
      return [];
    }

    // ── Query 2: GMs under those directors (one query for all directors) ────
    // TS: director ids extracted as a string array for the ANY($1::uuid[]) param
    const directorIds: string[] = directors.map((d: any) => d.id);
    const gmsResult = await db.query(
      `SELECT u.id, u.name, u.branch_id AS "branchId",
              b.name AS "branchName", u.manager_id AS "directorId",
              u.profile_photo_key
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.role = 'gm'
         AND u.is_active = true
         AND u.manager_id = ANY($1::uuid[])
       ORDER BY u.name`,
      [directorIds]
    );
    // TS: typed as any[] — rows carry directorId so we can bucket them below
    const gms: any[] = gmsResult.rows;

    // ── Query 3: oversight branches for each GM (one query for all GMs) ────
    // Uses each GM's own user_oversight_branches rows (what MD assigned) — NOT
    // the director's flattened union rows, so the per-GM breakdown is preserved.
    const gmIds: string[] = gms.map((g: any) => g.id);
    // TS: gmIds may be empty if no GMs exist; guard to avoid sending ANY('{}'::uuid[])
    const branchRows: any[] = gmIds.length > 0
      ? (await db.query(
          `SELECT uob.user_id AS "gmId", b.id AS "branchId", b.name AS "branchName"
           FROM user_oversight_branches uob
           JOIN branches b ON b.id = uob.branch_id
           WHERE uob.user_id = ANY($1::uuid[])
           ORDER BY b.name`,
          [gmIds]
        )).rows
      : [];

    // ── Populate avatar URLs for directors + GMs in one batch ───────────────
    // Follows the same pattern as listUsers (user.service.ts:443-444).
    const allPeople = [...directors, ...gms];
    // TS: populateAvatarUrls callback receives string | null — assign as-is, downstream renders null as no avatar
    await populateAvatarUrls(redis, allPeople, (u: any) => u.profile_photo_key, (u: any, url: string | null) => { u.profilePhotoUrl = url; });
    allPeople.forEach((u: any) => delete u.profile_photo_key);

    // ── In-memory assembly ───────────────────────────────────────────────────
    // Build lookup: gmId → branches[]
    const branchesByGm = new Map<string, { id: string; name: string }[]>();
    for (const row of branchRows) {
      const existing = branchesByGm.get(row.gmId) ?? [];
      existing.push({ id: row.branchId, name: row.branchName });
      branchesByGm.set(row.gmId, existing);
    }

    // Build lookup: directorId → gms[]
    const gmsByDirector = new Map<string, any[]>();
    for (const gm of gms) {
      const gmWithBranches = {
        id:             gm.id,
        name:           gm.name,
        branchId:       gm.branchId,
        branchName:     gm.branchName,
        profilePhotoUrl: gm.profilePhotoUrl ?? null,
        // TS: fall back to empty array when the GM has no oversight branches assigned
        branches: branchesByGm.get(gm.id) ?? [],
      };
      const existing = gmsByDirector.get(gm.directorId) ?? [];
      existing.push(gmWithBranches);
      gmsByDirector.set(gm.directorId, existing);
    }

    // Assemble the final tree: one entry per director
    return directors.map((d: any) => {
      // TS: gmList defaults to [] if director has no active GMs
      const gmList = gmsByDirector.get(d.id) ?? [];
      // TS: Set to deduplicate branch ids across all GMs under this director
      const uniqueBranchIds = new Set<string>(
        gmList.flatMap((g: any) => g.branches.map((b: any) => b.id))
      );
      return {
        id:              d.id,
        name:            d.name,
        role:            d.role,
        branchId:        d.branchId,
        branchName:      d.branchName,
        profilePhotoUrl: d.profilePhotoUrl ?? null,
        gmCount:         gmList.length,
        // TS: count of distinct branches across all GMs — shown as a summary chip
        branchCount:     uniqueBranchIds.size,
        gms:             gmList,
      };
    });
  },

  // ── listRenameHistory ──────────────────────────────────────────────────────────
  // Returns the full rename audit log for Management (newest first, max 100 rows).
  async listRenameHistory(
    // TS: pg connection pool
    db: Pool,
    // TS: role of the requesting user — guards are also at the route level
    requesterRole: string
  ): Promise<any[]> {
    // TS: re-check role for defence-in-depth
    if (!(USER_RENAME_ROLES as readonly string[]).includes(requesterRole)) {
      throw new ForbiddenError('Only Management may view the rename history');
    }
    const res = await db.query(
      `SELECT
         a.id,
         a.user_id,
         a.previous_name,
         a.new_name,
         a.reason,
         a.created_at,
         u.role              AS current_role,
         b.name              AS branch_name,
         rb.name             AS renamed_by_name
       FROM user_rename_audit a
       JOIN  users    u  ON u.id  = a.user_id
       LEFT  JOIN branches b  ON b.id  = u.branch_id
       JOIN  users    rb ON rb.id = a.renamed_by
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    return res.rows;
  },
};
