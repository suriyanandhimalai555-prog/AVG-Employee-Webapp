// apps/api/src/modules/users/user.service.ts
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import { CreateUserInput, UserResponse } from './user.schema';
import { ConflictError, ForbiddenError, NotFoundError } from '../../shared/errors';

export const UserService = {

  // Create a new user (with password hashing)
  async createUser(
    db: Pool,
    requesterRole: string,
    requesterBranchId: string | null,
    payload: CreateUserInput
  ): Promise<UserResponse> {
    // Permission check: MD, GM, and Branch Admins can create users
    if (requesterRole !== 'md' && requesterRole !== 'gm' && requesterRole !== 'branch_admin') {
      throw new ForbiddenError('You do not have permission to create users');
    }

    // Branch Admin Specific Constraints
    if (requesterRole === 'branch_admin') {
      const allowedRoles = ['branch_manager', 'abm', 'sales_officer', 'client'];
      if (!allowedRoles.includes(payload.role)) {
        throw new ForbiddenError('Branch Admins can only create branch staff or clients');
      }
      if (!requesterBranchId) {
        throw new ForbiddenError('Branch Admin is missing a branch assignment');
      }
      // Security: Force the new user to belong to the branch admin's branch
      payload.branchId = requesterBranchId;
    }

    // Step 1: Duplicate check — see if email is already taken
    const emailResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [payload.email]
    );

    if (emailResult.rows.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    // Step 2: Hashing — use bcrypt to secure the raw password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(payload.password, saltRounds);

    // Step 3: Persistence — insert into users table and handle branch join
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

    // Error in query: used $3 but also password payload. Fixed below.
    return this.getUserById(db, result.rows[0].id);
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

  // List users for management table
  async listUsers(
    db: Pool, 
    requesterRole: string, 
    requesterBranchId: string | null, 
    queryParams: { role?: string; branchId?: string }
  ): Promise<UserResponse[]> {
    let sql = `
      SELECT u.id, u.name, u.email, u.role, u.branch_id AS "branchId",
             b.name AS "branchName", u.manager_id AS "managerId",
             u.is_active AS "isActive", u.created_at AS "createdAt"
      FROM users u
      LEFT JOIN branches b ON u.branch_id = b.id
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (queryParams.role) {
      sql += ` WHERE u.role = $${paramIndex++}`;
      params.push(queryParams.role);
    }

    // If requester is a branch admin, forcefully scope them to their own branch
    if (requesterRole === 'branch_admin' && requesterBranchId) {
      sql += params.length > 0 ? ' AND' : ' WHERE';
      sql += ` u.branch_id = $${paramIndex++}`;
      params.push(requesterBranchId);
    } 
    // Otherwise, let MDs filter by specific branches if they provided the parameter
    else if (queryParams.branchId) {
      sql += params.length > 0 ? ' AND' : ' WHERE';
      sql += ` u.branch_id = $${paramIndex++}`;
      params.push(queryParams.branchId);
    }

    sql += ' ORDER BY u.created_at DESC LIMIT 100';

    const result = await db.query(sql, params);
    return result.rows;
  }
};
