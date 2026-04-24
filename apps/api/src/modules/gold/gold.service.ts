import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import type {
  AddGoldMemberInput,
  GetGoldMembersQuery,
  UpdateGoldMemberStatus,
  AddGoldPaymentInput,
} from './gold.schema';

export const GoldService = {

  // ─── ADD MEMBER ───
  // Only branch_admin can call this; branchId is derived from their profile.
  async addMember(
    db: Pool,
    enteredBy: string,
    branchId: string,
    payload: AddGoldMemberInput
  ): Promise<any> {
    // Verify chit_number is unique within this branch
    const dupCheck = await db.query(
      'SELECT id FROM gold_scheme_members WHERE branch_id = $1 AND chit_number = $2',
      [branchId, payload.chitNumber]
    );
    if (dupCheck.rows.length > 0) {
      throw new ConflictError(`Chit number ${payload.chitNumber} already exists in this branch`);
    }

    // Resolve referrer name (denormalised) if referrerId is provided
    let referrerName: string | null = null;
    if (payload.referrerId) {
      const refResult = await db.query(
        'SELECT name, role FROM users WHERE id = $1',
        [payload.referrerId]
      );
      if (refResult.rows.length === 0) {
        throw new NotFoundError('Referrer not found');
      }
      const { name, role } = refResult.rows[0];
      // Store "Name ROLE" like the physical ledger: "Sasirekha ABM"
      referrerName = `${name} ${role.toUpperCase().replace(/_/g, ' ')}`;
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const memberResult = await client.query(
        `INSERT INTO gold_scheme_members (
          branch_id, chit_number, member_name, member_phone, member_address,
          referrer_id, referrer_name, monthly_amount, start_date, total_months,
          notes, entered_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          branchId,
          payload.chitNumber,
          payload.memberName,
          payload.memberPhone   || null,
          payload.memberAddress || null,
          payload.referrerId    || null,
          referrerName,
          payload.monthlyAmount,
          payload.startDate,
          payload.totalMonths ?? 12,
          payload.notes         || null,
          enteredBy,
        ]
      );

      const member = memberResult.rows[0];

      // Auto-record month 1 — member pays on enrollment day
      await client.query(
        `INSERT INTO gold_scheme_payments
           (member_id, month_number, paid_date, amount, payment_mode, entered_by)
         VALUES ($1, 1, $2, $3, $4, $5)`,
        [member.id, payload.startDate, payload.monthlyAmount, payload.firstPaymentMode ?? 'cash', enteredBy]
      );

      await client.query('COMMIT');
      return member;
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
    query: GetGoldMembersQuery
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;

    if (query.status) {
      where += ` AND g.status = $${idx++}`;
      params.push(query.status);
    }

    if (query.referrerId) {
      where += ` AND g.referrer_id = $${idx++}`;
      params.push(query.referrerId);
    }

    if (query.search) {
      where += ` AND (g.member_name ILIKE $${idx} OR g.chit_number ILIKE $${idx} OR g.member_phone ILIKE $${idx})`;
      params.push(`%${query.search}%`);
      idx++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM gold_scheme_members g WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         g.*,
         u.name  AS entered_by_name,
         r.name  AS referrer_user_name,
         r.role  AS referrer_role,
         -- Months elapsed since start_date
         GREATEST(0,
           EXTRACT(YEAR FROM AGE(CURRENT_DATE, g.start_date)) * 12 +
           EXTRACT(MONTH FROM AGE(CURRENT_DATE, g.start_date))
         )::int AS months_elapsed
       FROM gold_scheme_members g
       JOIN users u ON g.entered_by = u.id
       LEFT JOIN users r ON g.referrer_id = r.id
       WHERE ${where}
       ORDER BY g.chit_number ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET SINGLE MEMBER ───
  async getMember(db: Pool, id: string, branchId: string): Promise<any> {
    const result = await db.query(
      `SELECT g.*, u.name AS entered_by_name, r.name AS referrer_user_name, r.role AS referrer_role
       FROM gold_scheme_members g
       JOIN users u ON g.entered_by = u.id
       LEFT JOIN users r ON g.referrer_id = r.id
       WHERE g.id = $1 AND g.branch_id = $2`,
      [id, branchId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Member not found');
    return result.rows[0];
  },

  // ─── UPDATE STATUS ───
  async updateStatus(
    db: Pool,
    id: string,
    branchId: string,
    payload: UpdateGoldMemberStatus
  ): Promise<any> {
    const result = await db.query(
      `UPDATE gold_scheme_members SET status = $1
       WHERE id = $2 AND branch_id = $3
       RETURNING *`,
      [payload.status, id, branchId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Member not found');
    return result.rows[0];
  },

  // ─── GET BRANCH EMPLOYEES (referrer picker) ───
  async getBranchEmployees(db: Pool, branchId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT id, name, role
       FROM users
       WHERE branch_id = $1
         AND is_active = true
         AND role NOT IN ('client', 'md')
       ORDER BY name ASC`,
      [branchId]
    );
    return result.rows;
  },

  // ─── ADD MONTHLY PAYMENT ───
  async addPayment(
    db: Pool,
    memberId: string,
    branchId: string,
    enteredBy: string,
    payload: AddGoldPaymentInput
  ): Promise<any> {
    // Verify the member belongs to this branch
    const memberCheck = await db.query(
      'SELECT id, total_months FROM gold_scheme_members WHERE id = $1 AND branch_id = $2',
      [memberId, branchId]
    );
    if (memberCheck.rows.length === 0) throw new NotFoundError('Member not found');

    if (payload.monthNumber > memberCheck.rows[0].total_months) {
      throw new ValidationError(`Month ${payload.monthNumber} exceeds total months (${memberCheck.rows[0].total_months})`);
    }

    try {
      const result = await db.query(
        `INSERT INTO gold_scheme_payments
           (member_id, month_number, paid_date, amount, payment_mode, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [memberId, payload.monthNumber, payload.paidDate, payload.amount, payload.paymentMode, payload.notes || null, enteredBy]
      );
      return result.rows[0];
    } catch (err: any) {
      if (err.code === '23505') throw new ConflictError(`Month ${payload.monthNumber} has already been recorded for this member`);
      throw err;
    }
  },

  // ─── GET PAYMENTS FOR MEMBER ───
  async getPayments(db: Pool, memberId: string, branchId: string): Promise<any[]> {
    // Verify branch ownership
    const check = await db.query(
      'SELECT id FROM gold_scheme_members WHERE id = $1 AND branch_id = $2',
      [memberId, branchId]
    );
    if (check.rows.length === 0) throw new NotFoundError('Member not found');

    const result = await db.query(
      `SELECT p.*, u.name AS entered_by_name
       FROM gold_scheme_payments p
       JOIN users u ON p.entered_by = u.id
       WHERE p.member_id = $1
       ORDER BY p.month_number ASC`,
      [memberId]
    );
    return result.rows;
  },

  // ─── SUMMARY (total chits, active, amounts) ───
  async getBranchSummary(db: Pool, branchId: string): Promise<any> {
    const result = await db.query(
      `SELECT
         COUNT(*)                                                       AS total_chits,
         COUNT(*) FILTER (WHERE status = 'active')                     AS active_chits,
         COUNT(*) FILTER (WHERE status = 'completed')                  AS completed_chits,
         COUNT(*) FILTER (WHERE status = 'withdrawn')                  AS withdrawn_chits,
         COALESCE(SUM(monthly_amount) FILTER (WHERE status='active'),0) AS monthly_commitment,
         COALESCE(SUM(monthly_amount * total_months) FILTER (WHERE status='active'),0) AS total_scheme_value
       FROM gold_scheme_members
       WHERE branch_id = $1`,
      [branchId]
    );
    const r = result.rows[0];
    return {
      totalChits:       parseInt(r.total_chits),
      activeChits:      parseInt(r.active_chits),
      completedChits:   parseInt(r.completed_chits),
      withdrawnChits:   parseInt(r.withdrawn_chits),
      monthlyCommitment: parseFloat(r.monthly_commitment),
      totalSchemeValue:  parseFloat(r.total_scheme_value),
    };
  },
};
