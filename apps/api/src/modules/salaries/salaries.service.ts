import { Pool } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { getSubtreeIds } from '../../shared/hierarchy';
import type { SetSalaryInput, GetSalaryHistoryQuery } from './salaries.schema';

export const SalaryService = {

  // ─── SET SALARY ───
  // Closes current open-ended salary (if any) and inserts a new active one.
  // Runs in a single transaction to stay atomic.
  async setSalary(
    db: Pool,
    setBy: string,
    payload: SetSalaryInput
  ): Promise<any> {
    // Verify employee exists
    const userCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );
    if (userCheck.rows.length === 0) throw new NotFoundError('Employee not found');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Close the previous active salary one day before the new effective_from
      await client.query(
        `UPDATE employee_salaries
         SET effective_to = ($1::date - INTERVAL '1 day')::date
         WHERE user_id = $2 AND effective_to IS NULL`,
        [payload.effectiveFrom, payload.userId]
      );

      // Insert new active salary
      const result = await client.query(
        `INSERT INTO employee_salaries (user_id, base_salary, effective_from, set_by, notes)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [payload.userId, payload.baseSalary, payload.effectiveFrom, setBy, payload.notes || null]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── GET CURRENT SALARY ───
  async getCurrentSalary(
    db: Pool,
    requesterId: string,
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

  // ─── GET SALARY HISTORY ───
  async getSalaryHistory(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    targetUserId: string,
    query: GetSalaryHistoryQuery
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

  // ─── INTERNAL: resolve target user with visibility check ───
  async _resolveTarget(
    requesterId: string,
    requesterRole: string,
    targetUserId?: string
  ): Promise<string> {
    if (!targetUserId || targetUserId === requesterId) {
      return requesterId;
    }
    // sales_officer can only see own salary
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
