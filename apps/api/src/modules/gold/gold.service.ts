import { Pool } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import type {
  AddGoldMemberInput,
  GetGoldMembersQuery,
  UpdateGoldMemberStatus,
  AddGoldPaymentInput,
} from './gold.schema';

// Stable project code for gold — set once at creation, never changes even if the
// admin renames the project display name through the UI. See migration 026.
// Also published as GoldService.schemeCode for the SchemeService contract.
const GOLD_PROJECT_CODE = 'gold_scheme';

export const GoldService = {
  schemeCode: GOLD_PROJECT_CODE,

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

    // Verify the customer exists and belongs to this branch
    const customerResult = await db.query(
      `SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2`,
      [payload.customerId, branchId]
    );
    if (customerResult.rows.length === 0) throw new NotFoundError('Customer not found in this branch');

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
          branch_id, chit_number, customer_id,
          referrer_id, referrer_name, monthly_amount, start_date, total_months,
          notes, entered_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING *`,
        [
          branchId,
          payload.chitNumber,
          payload.customerId,
          payload.referrerId,
          referrerName,
          payload.monthlyAmount,
          payload.startDate,
          payload.totalMonths ?? 12,
          payload.notes || null,
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

      // Credit referrer the configured % of monthly_amount as enrollment incentive.
      // Reads scheme_commission_rules through the shared distributor.
      const customerName = customerResult.rows[0].name;
      const monthlyAmount = parseFloat(payload.monthlyAmount.toString());
      let commissionAmount = 0;
      if (payload.referrerId) {
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        GOLD_PROJECT_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_new',
          baseAmount:        monthlyAmount,
          paymentEvent:      'enrollment',
          sourceId:          member.id,
          sourceDescription: `Gold enrollment: ${customerName} – Chit ${payload.chitNumber}`,
          creditedBy:        enteredBy,
        });
        commissionAmount = credited.reduce((sum, row) => sum + parseFloat(row.amount), 0);
      }

      await client.query('COMMIT');
      return { member, commissionAmount };
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
      where += ` AND (c.name ILIKE $${idx} OR g.chit_number ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})`;
      params.push(`%${query.search}%`);
      idx++;
    }

    if (query.startDate) {
      where += ` AND g.created_at >= $${idx++}::date`;
      params.push(query.startDate);
    }
    if (query.endDate) {
      where += ` AND g.created_at < ($${idx++}::date + INTERVAL '1 day')`;
      params.push(query.endDate);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM gold_scheme_members g JOIN customers c ON g.customer_id = c.id WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         g.*,
         c.name          AS customer_name,
         c.phone         AS customer_phone,
         c.customer_code,
         u.name          AS entered_by_name,
         r.name          AS referrer_user_name,
         r.role          AS referrer_role,
         GREATEST(0,
           EXTRACT(YEAR FROM AGE(CURRENT_DATE, g.start_date)) * 12 +
           EXTRACT(MONTH FROM AGE(CURRENT_DATE, g.start_date))
         )::int AS months_elapsed
       FROM gold_scheme_members g
       JOIN customers c  ON g.customer_id  = c.id
       JOIN users u      ON g.entered_by   = u.id
       LEFT JOIN users r ON g.referrer_id  = r.id
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
      `SELECT g.*,
              c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
              u.name AS entered_by_name, r.name AS referrer_user_name, r.role AS referrer_role
       FROM gold_scheme_members g
       JOIN customers c  ON g.customer_id  = c.id
       JOIN users u      ON g.entered_by   = u.id
       LEFT JOIN users r ON g.referrer_id  = r.id
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
         AND role NOT IN ('md')
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
    // Verify the member belongs to this branch and fetch referrer info for incentive
    const memberCheck = await db.query(
      `SELECT g.id, g.total_months, g.referrer_id, g.chit_number, c.name AS customer_name
       FROM gold_scheme_members g
       JOIN customers c ON g.customer_id = c.id
       WHERE g.id = $1 AND g.branch_id = $2`,
      [memberId, branchId]
    );
    if (memberCheck.rows.length === 0) throw new NotFoundError('Member not found');

    const memberRow = memberCheck.rows[0];
    if (payload.monthNumber > memberRow.total_months) {
      throw new ValidationError(`Month ${payload.monthNumber} exceeds total months (${memberRow.total_months})`);
    }

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO gold_scheme_payments
           (member_id, month_number, paid_date, amount, payment_mode, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         RETURNING *`,
        [memberId, payload.monthNumber, payload.paidDate, payload.amount, payload.paymentMode, payload.notes || null, enteredBy]
      );

      // Credit referrer the configured renewal % for month 2 onwards.
      // Month 1 is already covered by the enrollment incentive in addMember.
      if (payload.monthNumber > 1 && memberRow.referrer_id) {
        await IncentiveService.distributeIncentives(client, {
          schemeCode:        GOLD_PROJECT_CODE,
          dealMakerUserId:   memberRow.referrer_id,
          mode:              'percent_referrer',
          percentRole:       'referrer_renewal',
          baseAmount:        parseFloat(payload.amount.toString()),
          paymentEvent:      'renewal',
          sourceId:          memberId,
          sourceDescription: `Gold M${payload.monthNumber} payment: ${memberRow.customer_name} – Chit ${memberRow.chit_number}`,
          creditedBy:        enteredBy,
        });
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw new ConflictError(`Month ${payload.monthNumber} has already been recorded for this member`);
      throw err;
    } finally {
      client.release();
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

  // ─── SUMMARY (total chits, active, amounts, commission) ───
  // Pass referrerId to scope to one referrer's stats (for SO/ABM/BM/GM personal view)
  async getBranchSummary(db: Pool, branchId: string, referrerId?: string, dateFilter?: { startDate?: string; endDate?: string }): Promise<any> {
    const params: any[] = [branchId];
    let extra = referrerId ? ` AND referrer_id = $2` : '';
    if (referrerId) params.push(referrerId);
    let idx = params.length + 1;

    if (dateFilter?.startDate) {
      extra += ` AND created_at >= $${idx++}::date`;
      params.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      extra += ` AND created_at < ($${idx++}::date + INTERVAL '1 day')`;
      params.push(dateFilter.endDate);
    }

    const result = await db.query(
      `SELECT
         COUNT(*)                                                       AS total_chits,
         COUNT(*) FILTER (WHERE status = 'active')                     AS active_chits,
         COUNT(*) FILTER (WHERE status = 'completed')                  AS completed_chits,
         COUNT(*) FILTER (WHERE status = 'withdrawn')                  AS withdrawn_chits,
         COALESCE(SUM(monthly_amount) FILTER (WHERE status='active'),0) AS monthly_commitment,
         COALESCE(SUM(monthly_amount * total_months) FILTER (WHERE status='active'),0) AS total_scheme_value
       FROM gold_scheme_members
       WHERE branch_id = $1${extra}`,
      params
    );

    // ─── Commission query — sums incentives earned from gold_scheme ───
    // payment_event distinguishes enrollment (month 1) vs renewal (month 2+);
    // both columns are written by IncentiveService.distributeIncentives.
    const commParams: any[] = [branchId, GOLD_PROJECT_CODE];
    let commWhere = 'g.branch_id = $1 AND ei.scheme_code = $2';
    let commIdx = 3;

    if (referrerId) {
      commWhere += ` AND ei.user_id = $${commIdx++}`;
      commParams.push(referrerId);
    }
    if (dateFilter?.startDate) {
      commWhere += ` AND ei.created_at >= $${commIdx++}::date`;
      commParams.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`;
      commParams.push(dateFilter.endDate);
    }

    const commResult = await db.query(
      `SELECT
         COALESCE(SUM(ei.amount) FILTER (WHERE ei.payment_event = 'enrollment'), 0) AS new_commission,
         COALESCE(SUM(ei.amount) FILTER (WHERE ei.payment_event = 'renewal'),    0) AS renewal_commission
       FROM employee_incentives ei
       JOIN gold_scheme_members g ON g.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}`,
      commParams
    );

    const r = result.rows[0];
    const c = commResult.rows[0];
    const newCommission     = parseFloat(c.new_commission);
    const renewalCommission = parseFloat(c.renewal_commission);
    return {
      totalChits:        parseInt(r.total_chits),
      activeChits:       parseInt(r.active_chits),
      completedChits:    parseInt(r.completed_chits),
      withdrawnChits:    parseInt(r.withdrawn_chits),
      monthlyCommitment: parseFloat(r.monthly_commitment),
      totalSchemeValue:  parseFloat(r.total_scheme_value),
      newCommission,
      renewalCommission,
      totalCommission:   newCommission + renewalCommission,
    };
  },

  // ─── ADMIN AGGREGATE: per-branch breakdown for the MD/Director dashboard ───
  // Two SQL passes (one for member+payment totals, one for incentive totals)
  // merged in memory by branch_id so we don't pay for a nested aggregate.
  async getOverviewByBranch(
    db: Pool,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number; commission: number }>> {
    const memParams: any[] = [];
    let memDate = '';
    let memIdx = 1;
    if (dateFilter?.startDate) { memDate += ` AND p.paid_date >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memDate += ` AND p.paid_date < ($${memIdx++}::date + INTERVAL '1 day')`; memParams.push(dateFilter.endDate); }

    // Member counts come from members table unconditionally (a member exists
    // even if they haven't paid yet). Payments are LEFT JOINed and date-filtered.
    const memRes = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         m.branch_id  AS branch_id,
         b.name       AS branch_name,
         COUNT(DISTINCT m.id)::int                          AS count,
         COALESCE(SUM(p.amount) FILTER (WHERE p.id IS NOT NULL${memDate}), 0) AS collected
       FROM gold_scheme_members m
       JOIN branches b ON m.branch_id = b.id
       LEFT JOIN gold_scheme_payments p ON p.member_id = m.id
       GROUP BY m.branch_id, b.name
       ORDER BY b.name ASC`,
      memParams
    );

    const commParams: any[] = [GOLD_PROJECT_CODE];
    let commDate = '';
    let commIdx = 2;
    if (dateFilter?.startDate) { commDate += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commDate += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT gm.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN gold_scheme_members gm ON gm.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ei.scheme_code = $1${commDate}
       GROUP BY gm.branch_id`,
      commParams
    );

    const commByBranch = new Map<string, number>();
    for (const row of commRes.rows) {
      commByBranch.set(row.branch_id, parseFloat(row.commission));
    }

    return memRes.rows.map(r => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      count:      parseInt(r.count, 10),
      collected:  parseFloat(r.collected),
      commission: commByBranch.get(r.branch_id) ?? 0,
    }));
  },

  // ─── ADMIN DRILL-DOWN: members in a single branch for the dashboard ──────
  // Returns lightweight rows the dashboard renders — never used for writes,
  // so we skip the customer JOIN noise and pull only display fields.
  async getEntriesByBranch(
    db: Pool,
    branchId: string,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'm.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND m.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND m.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         m.id, m.chit_number, m.monthly_amount,
         m.total_months, m.status, m.start_date, m.created_at,
         m.referrer_name,
         c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
         (SELECT COUNT(*)::int FROM gold_scheme_payments p WHERE p.member_id = m.id) AS months_paid,
         (SELECT COALESCE(SUM(p.amount),0) FROM gold_scheme_payments p WHERE p.member_id = m.id) AS paid_so_far
       FROM gold_scheme_members m
       LEFT JOIN customers c ON c.id = m.customer_id
       WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  },
};
