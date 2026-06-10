import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import { SchemeAudit } from '../../shared/scheme-audit';
import type { AddTradingMemberInput, GetTradingMembersQuery, CorrectTradingMemberInput } from './trading-academy.schema';

// Stable project code for trading academy — set once at creation, never changes
// even if the admin renames the project display name. See migration 026.
// Also published as TradingAcademyService.schemeCode for the SchemeService contract.
const PROJECT_CODE = 'trading_academy';

export const TradingAcademyService = {
  schemeCode: PROJECT_CODE,

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
      const incentives = await IncentiveService.distributeIncentives(client, {
        schemeCode:        PROJECT_CODE,
        dealMakerUserId:   payload.enrolledBy,
        mode:              'fixed_chain',
        paymentEvent:      'enrollment',
        sourceId:          member.id,
        sourceDescription: description,
        creditedBy:        enteredBy,
      });

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
  // Pass scopedToUserId to scope to one referrer's stats (for SO/ABM/BM/GM personal view).
  // Name matches the SchemeService contract so cross-scheme code can iterate by scheme code.
  async getBranchSummary(db: Pool, branchId: string, scopedToUserId?: string, dateFilter?: { startDate?: string; endDate?: string }): Promise<any> {
    const enrolledBy = scopedToUserId;
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

  // ─── CORRECT MEMBER (admin: MD / Management) ────────────────────────────────
  // Patches editable fields on an existing member. When enrolledBy or amount
  // changes the incentive chain is reversed and re-distributed so the wallet
  // always reflects the correct value and historical date.
  async correctMember(
    db: Pool,
    correctedBy: string,
    id: string,
    branchId: string,
    payload: CorrectTradingMemberInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT t.*, c.name AS customer_name, c.customer_code
         FROM trading_academy_members t
         JOIN customers c ON c.id = t.customer_id
         WHERE t.id = $1 AND t.branch_id = $2`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Trading Academy member not found');
      const old = before.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.customerId     != null) { fields.push(`customer_id = $${idx++}`);      vals.push(payload.customerId); }
      if (payload.enrolledBy     != null) { fields.push(`enrolled_by = $${idx++}`);      vals.push(payload.enrolledBy); }
      if (payload.amount         != null) { fields.push(`amount = $${idx++}`);           vals.push(payload.amount); }
      if (payload.enrollmentDate != null) { fields.push(`enrollment_date = $${idx++}`);  vals.push(payload.enrollmentDate); }
      if (payload.paymentMode    != null) { fields.push(`payment_mode = $${idx++}`);     vals.push(payload.paymentMode); }
      if (payload.notes !== undefined)    { fields.push(`notes = $${idx++}`);            vals.push(payload.notes); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(id, branchId);
      const updated = await client.query(
        `UPDATE trading_academy_members SET ${fields.join(', ')} WHERE id = $${idx} AND branch_id = $${idx + 1} RETURNING *`,
        vals
      );

      const enrolledByChanged = payload.enrolledBy != null && payload.enrolledBy !== old.enrolled_by;
      const amountChanged     = payload.amount     != null && parseFloat(payload.amount.toString()) !== parseFloat(old.amount);
      const effectiveDate     = payload.enrollmentDate ?? old.enrollment_date;
      const effectiveDealMaker = payload.enrolledBy ?? old.enrolled_by;

      if (enrolledByChanged || amountChanged) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   PROJECT_CODE,
          sourceId:     id,
          paymentEvent: 'enrollment',
        });
        const customerName = old.customer_name;
        const effectiveAmount = payload.amount != null ? parseFloat(payload.amount.toString()) : parseFloat(old.amount);
        const description = `Trading Academy (corrected) — ${customerName} (${old.customer_code}) ₹${effectiveAmount.toLocaleString('en-IN')}`;
        await IncentiveService.distributeIncentives(client, {
          schemeCode:        PROJECT_CODE,
          dealMakerUserId:   effectiveDealMaker,
          mode:              'fixed_chain',
          paymentEvent:      'enrollment',
          sourceId:          id,
          sourceDescription: description,
          creditedBy:        correctedBy,
          effectiveDate,
        });
      }

      await SchemeAudit.log(client, {
        schemeCode: PROJECT_CODE,
        entityType: 'member',
        entityId:   id,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID MEMBER (admin: MD / Management) ────────────────────────────────
  async voidMember(
    db: Pool,
    actorId: string,
    id: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM trading_academy_members WHERE id = $1 AND branch_id = $2`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Trading Academy member not found');
      const old = before.rows[0];

      await client.query(
        `UPDATE trading_academy_members SET status = 'voided' WHERE id = $1`,
        [id]
      );

      await IncentiveService.reverseIncentives(client, {
        schemeCode:   PROJECT_CODE,
        sourceId:     id,
        paymentEvent: 'enrollment',
      });

      await SchemeAudit.log(client, {
        schemeCode: PROJECT_CODE,
        entityType: 'member',
        entityId:   id,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── DELETE MEMBER (admin: MD / Management) ──────────────────────────────
  // Permanently deletes the enrollment row, claws back its incentives, and
  // snapshots the before-state into the audit log. No payments table here —
  // trading academy is a one-time enrollment scheme.
  async deleteMember(
    db: Pool,
    actorId: string,
    id: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM trading_academy_members WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Trading Academy member not found');
      const old = before.rows[0];

      await IncentiveService.reverseIncentives(client, {
        schemeCode: PROJECT_CODE,
        sourceId:   id,
      });

      await client.query(`DELETE FROM trading_academy_members WHERE id = $1`, [id]);

      await SchemeAudit.log(client, {
        schemeCode: PROJECT_CODE,
        entityType: 'member',
        entityId:   id,
        actorId,
        action:     'delete',
        oldValues:  { member: old },
      });

      return { deleted: true, id };
    });
  },

  // ─── ADMIN AGGREGATE: per-branch breakdown for the MD/Director dashboard ───
  // One pass for member counts + collected (member.amount is the one-time fee),
  // a second pass for commission via the unified ledger. Merged by branch_id.
  async getOverviewByBranch(
    db: Pool,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number; commission: number }>> {
    const projectId = await TradingAcademyService.getProjectId(db);

    const memParams: any[] = [projectId];
    let memWhere = 't.project_id = $1';
    let memIdx = 2;
    if (dateFilter?.startDate) { memWhere += ` AND t.enrollment_date >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memWhere += ` AND t.enrollment_date <= $${memIdx++}::date`; memParams.push(dateFilter.endDate); }

    const memRes = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         t.branch_id,
         b.name AS branch_name,
         COUNT(t.id)::int                  AS count,
         COALESCE(SUM(t.amount), 0)        AS collected
       FROM trading_academy_members t
       JOIN branches b ON t.branch_id = b.id
       WHERE ${memWhere}
       GROUP BY t.branch_id, b.name
       ORDER BY b.name ASC`,
      memParams
    );

    const commParams: any[] = [PROJECT_CODE];
    let commDate = '';
    let commIdx = 2;
    if (dateFilter?.startDate) { commDate += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commDate += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT t.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN trading_academy_members t ON t.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ei.scheme_code = $1${commDate}
       GROUP BY t.branch_id`,
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

  // ─── ADMIN DRILL-DOWN: members in a single branch ────────────────────────
  async getEntriesByBranch(
    db: Pool,
    branchId: string,
    dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<any[]> {
    const projectId = await TradingAcademyService.getProjectId(db);
    const params: any[] = [branchId, projectId];
    let where = 't.branch_id = $1 AND t.project_id = $2';
    let idx = 3;
    if (dateFilter?.startDate) { where += ` AND t.enrollment_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND t.enrollment_date <= $${idx++}::date`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         t.id, t.amount, t.enrollment_date, t.payment_mode, t.notes, t.created_at,
         c.name AS customer_name, c.customer_code, c.phone AS customer_phone,
         u.name AS enrolled_by_name, u.role AS enrolled_by_role
       FROM trading_academy_members t
       LEFT JOIN customers c ON c.id = t.customer_id
       LEFT JOIN users u     ON u.id = t.enrolled_by
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  },
};
