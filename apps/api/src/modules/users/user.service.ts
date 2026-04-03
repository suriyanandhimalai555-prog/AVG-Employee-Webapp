// apps/api/src/modules/users/user.service.ts
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { CreateUserInput, UserResponse } from './user.schema';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';
import { resolveBranchAdminBranchId } from '../../shared/attendance-scope';
import { getOversightScopeIds } from '../../shared/hierarchy';

export const UserService = {

  // Create a new user (with password hashing)
  async createUser(
    db: Pool,
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

    // Insert the user. For Director/GM the primary branchId is the first oversight branch
    // (or null if none provided — MD assigns them via oversight table).
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

    // For Director/GM, insert their oversight branch assignments
    if (['director', 'gm'].includes(payload.role) && payload.oversightBranchIds?.length) {
      for (const branchId of payload.oversightBranchIds) {
        await db.query(
          `INSERT INTO user_oversight_branches (user_id, branch_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [newUserId, branchId]
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

    return this.getUserById(db, newUserId);
  },

  // Helper to fetch full user info by ID
  async getUserById(db: Pool, userId: string): Promise<UserResponse> {
    const result = await db.query(
      `SELECT u.id, u.name, u.email, u.role, u.branch_id AS "branchId",
              b.name AS "branchName", u.manager_id AS "managerId",
              u.is_active AS "isActive", u.created_at AS "createdAt"
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User not found');
    }

    return result.rows[0];
  },

  // List users for management table, scoped per role, with pagination and search
  async listUsers(
    db: Pool,
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
      const scopeIds = await getOversightScopeIds(db, requesterId);
      if (scopeIds.length === 0) return { data: [], total: 0, page, limit, totalPages: 0 };
      conditions.push(`u.id = ANY($${paramIndex++}::uuid[])`);
      params.push(scopeIds);
    } else if (queryParams.branchId) {
      conditions.push(`u.branch_id = $${paramIndex++}`);
      params.push(queryParams.branchId);
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
    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
};
