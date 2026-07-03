import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { getSubtreeIds } from '../../shared/hierarchy';
import type { SetSalaryInput, SetSalaryByRoleInput, GetSalaryHistoryQuery } from './salaries.schema';

export const SalaryService = {

  // ─── INTERNAL: apply salary to one user (must be called inside a transaction) ───
  // Closes the current open-ended row one day before effectiveFrom, then inserts
  // a new active row.  Shared by both setSalary and setSalaryByRole.
  async _applyOneSalary(
    // TS: PoolClient is the in-transaction connection — caller owns BEGIN/COMMIT
    client: PoolClient,
    userId:        string,
    baseSalary:    number,
    effectiveFrom: string,
    setBy:         string,
    notes?:        string
  ): Promise<any> {
    // TS: Close any currently active salary one day before the new period starts
    await client.query(
      `UPDATE employee_salaries
       SET effective_to = ($1::date - INTERVAL '1 day')::date
       WHERE user_id = $2 AND effective_to IS NULL`,
      [effectiveFrom, userId]
    );
    // TS: Insert the new active salary row; effective_to NULL = currently active
    const result = await client.query(
      `INSERT INTO employee_salaries (user_id, base_salary, effective_from, set_by, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, baseSalary, effectiveFrom, setBy, notes || null]
    );
    return result.rows[0];
  },

  // ─── SET SALARY (single user) ─────────────────────────────────────────────
  // Verifies the employee exists, then delegates to _applyOneSalary inside a
  // single transaction so both the close and the insert are atomic.
  async setSalary(
    db:    Pool,
    setBy: string,
    payload: SetSalaryInput
  ): Promise<any> {
    // Verify employee exists and is active
    const userCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );
    if (userCheck.rows.length === 0) throw new NotFoundError('Employee not found');

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const row = await SalaryService._applyOneSalary(
        client, payload.userId, payload.baseSalary, payload.effectiveFrom, setBy, payload.notes
      );
      await client.query('COMMIT');
      return row;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── SET SALARY BY ROLE (org-wide bulk) ───────────────────────────────────
  // Finds every active employee with the given role across all branches and
  // applies the new salary to each in a single transaction.
  // Returns { role, updatedCount } — updatedCount = 0 is not an error.
  async setSalaryByRole(
    db:    Pool,
    setBy: string,
    payload: SetSalaryByRoleInput
  ): Promise<{ role: string; updatedCount: number }> {
    // TS: Fetch all active users of the given role — no branch filter (org-wide)
    const usersRes = await db.query<{ id: string }>(
      `SELECT id FROM users WHERE role = $1 AND is_active = true`,
      [payload.role]
    );
    const users = usersRes.rows;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      // TS: Apply the salary update to every matched user inside one transaction
      for (const user of users) {
        await SalaryService._applyOneSalary(
          client, user.id, payload.baseSalary, payload.effectiveFrom, setBy, payload.notes
        );
      }
      await client.query('COMMIT');
      return { role: payload.role, updatedCount: users.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── GET CURRENT SALARY ───────────────────────────────────────────────────
  async getCurrentSalary(
    db: Pool,
    requesterId:   string,
    requesterRole: string,
    targetUserId?: string
  ): Promise<any> {
    const userId = await SalaryService._resolveTarget(requesterId, requesterRole, targetUserId);

    const result = await db.query(
      `SELECT s.*, u.name AS set_by_name, e.name AS employee_name, e.role AS employee_role
       FROM employee_salaries s
       JOIN users u ON s.set_by = u.id
       JOIN users e ON s.user_id = e.id
       WHERE s.user_id = $1 AND s.effective_to IS NULL`,
      [userId]
    );
    return result.rows[0] || null;
  },

  // ─── GET SALARY HISTORY ───────────────────────────────────────────────────
  async getSalaryHistory(
    db: Pool,
    requesterId:   string,
    requesterRole: string,
    targetUserId:  string,
    query:         GetSalaryHistoryQuery
  ): Promise<{ data: any[]; total: number }> {
    await SalaryService._resolveTarget(requesterId, requesterRole, targetUserId);

    const countResult = await db.query(
      `SELECT COUNT(*) FROM employee_salaries WHERE user_id = $1`,
      [targetUserId]
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT s.*, u.name AS set_by_name
       FROM employee_salaries s
       JOIN users u ON s.set_by = u.id
       WHERE s.user_id = $1
       ORDER BY s.effective_from DESC
       LIMIT $2 OFFSET $3`,
      [targetUserId, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── INTERNAL: resolve target user with visibility check ─────────────────
  async _resolveTarget(
    requesterId:   string,
    requesterRole: string,
    targetUserId?: string
  ): Promise<string> {
    if (!targetUserId || targetUserId === requesterId) {
      return requesterId;
    }
    // sales_officer and client can only see their own salary
    if (requesterRole === 'sales_officer' || requesterRole === 'client') {
      throw new ForbiddenError('Access denied');
    }
    const subtree = await getSubtreeIds(requesterId);
    if (!subtree.includes(targetUserId)) {
      throw new ForbiddenError('That employee is not in your team');
    }
    return targetUserId;
  },
};
