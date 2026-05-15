import { Pool } from 'pg';
import { NotFoundError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import type { AddTradingMemberInput, GetTradingMembersQuery } from './trading-academy.schema';

// Stable project code for trading academy — set once at creation, never changes
// even if the admin renames the project display name. See migration 026.
const PROJECT_CODE = 'trading_academy';

export const TradingAcademyService = {

  // Resolve the project id once per call (cheap: indexed code lookup)
  async getProjectId(db: Pool): Promise<string> {
    const res = await db.query(
      `SELECT id FROM projects WHERE code = $1 LIMIT 1`,
      [PROJECT_CODE]
    );
    if (res.rows.length === 0) throw new NotFoundError('Trading Academy project not found');
    return res.rows[0].id;
  },

  // ─── ADD MEMBER ───
  // Fully atomic: member insert + incentive distribution happen in one transaction.
  // If incentive distribution fails, the member row is rolled back too.
  async addMember(
    db: Pool,
    enteredBy: string,
    branchId: string,
    payload: AddTradingMemberInput
  ): Promise<{ member: any; incentivesCreated: number }> {
    const projectId = await TradingAcademyService.getProjectId(db);

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Verify the customer exists and belongs to this branch
      const customerResult = await client.query(
        `SELECT id, name, customer_code FROM customers WHERE id = $1 AND branch_id = $2`,
        [payload.customerId, branchId]
      );
      if (customerResult.rows.length === 0) throw new NotFoundError('Customer not found in this branch');
      const customer = customerResult.rows[0];

      // Verify the enrolledBy employee exists
      const soCheck = await client.query(
        `SELECT id, name, role FROM users WHERE id = $1 AND is_active = true`,
        [payload.enrolledBy]
      );
      if (soCheck.rows.length === 0) throw new NotFoundError('Sales Officer not found');

      const insertResult = await client.query(
        `INSERT INTO trading_academy_members
           (branch_id, project_id, customer_id, amount, enrolled_by,
            enrollment_date, payment_mode, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [
          branchId,
          projectId,
          payload.customerId,
          payload.amount,
          payload.enrolledBy,
          payload.enrollmentDate,
          payload.paymentMode,
          payload.notes ?? null,
          enteredBy,
        ]
      );
      const member = insertResult.rows[0];

      // Auto-distribute incentives inside the same transaction
      const description = `Trading Academy — ${customer.name} (${customer.customer_code}) ₹${Number(payload.amount).toLocaleString('en-IN')}`;
      const incentives = await IncentiveService.distributeIncentives(
        client,
        payload.enrolledBy,
        projectId,
        description,
        enteredBy,
        member.id
      );

      await client.query('COMMIT');
      return { member: { ...member, customer }, incentivesCreated: incentives.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── LIST MEMBERS ───
  async getMembers(
    db: Pool,
    branchId: string,
    query: GetTradingMembersQuery
  ): Promise<{ data: any[]; total: number }> {
    const projectId = await TradingAcademyService.getProjectId(db);

    const params: any[] = [branchId, projectId];
    let where = 't.branch_id = $1 AND t.project_id = $2';
    let idx = 3;

    if (query.enrolledBy) {
      where += ` AND t.enrolled_by = $${idx++}`;
      params.push(query.enrolledBy);
    }

    if (query.search) {
      where += ` AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})`;
      params.push(`%${query.search}%`);
      idx++;
    }

    if (query.startDate) {
      where += ` AND t.enrollment_date >= $${idx++}::date`;
      params.push(query.startDate);
    }
    if (query.endDate) {
      where += ` AND t.enrollment_date <= $${idx++}::date`;
      params.push(query.endDate);
    }

    const countResult = await db.query(
      `SELECT COUNT(*)
       FROM trading_academy_members t
       JOIN customers c ON t.customer_id = c.id
       WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         t.*,
         c.name           AS customer_name,
         c.phone          AS customer_phone,
         c.customer_code,
         so.name          AS enrolled_by_name,
         so.role          AS enrolled_by_role,
         ent.name         AS entered_by_name
       FROM trading_academy_members t
       JOIN customers c  ON t.customer_id  = c.id
       JOIN users so     ON t.enrolled_by  = so.id
       JOIN users ent    ON t.entered_by   = ent.id
       WHERE ${where}
       ORDER BY t.enrollment_date DESC, t.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── SUMMARY ───
  // Pass enrolledBy to scope to one referrer's stats (for SO/ABM/BM/GM personal view)
  async getSummary(db: Pool, branchId: string, enrolledBy?: string, dateFilter?: { startDate?: string; endDate?: string }): Promise<any> {
    const projectId = await TradingAcademyService.getProjectId(db);

    const params: any[] = [branchId, projectId];
    let extra = '';
    if (enrolledBy) {
      extra += ` AND enrolled_by = $${params.length + 1}`;
      params.push(enrolledBy);
    }
    if (dateFilter?.startDate) {
      extra += ` AND enrollment_date >= $${params.length + 1}::date`;
      params.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      extra += ` AND enrollment_date <= $${params.length + 1}::date`;
      params.push(dateFilter.endDate);
    }

    const res = await db.query(
      `SELECT
         COUNT(*)                    AS total_members,
         COALESCE(SUM(amount), 0)   AS total_collected,
         COUNT(*) FILTER (WHERE enrollment_date = CURRENT_DATE) AS enrolled_today
       FROM trading_academy_members
       WHERE branch_id = $1 AND project_id = $2${extra}`,
      params
    );
    const r = res.rows[0];
    return {
      totalMembers:   parseInt(r.total_members),
      totalCollected: parseFloat(r.total_collected),
      enrolledToday:  parseInt(r.enrolled_today),
    };
  },

  // ─── GET BRANCH EMPLOYEES (for the "enrolled by" picker) ───
  async getBranchEmployees(db: Pool, branchId: string): Promise<any[]> {
    const res = await db.query(
      `SELECT id, name, role FROM users
       WHERE branch_id = $1 AND is_active = true
         AND role IN ('sales_officer', 'abm', 'branch_manager')
       ORDER BY name ASC`,
      [branchId]
    );
    return res.rows;
  },
};
