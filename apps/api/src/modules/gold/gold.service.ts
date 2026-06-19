import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import { SchemeAudit } from '../../shared/scheme-audit';
import type {
  AddGoldMemberInput,
  GetGoldMembersQuery,
  UpdateGoldMemberStatus,
  AddGoldPaymentInput,
  CorrectGoldMemberInput,
  CorrectGoldPaymentInput,
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
           (member_id, month_number, paid_date, amount, payment_mode, proof_key, transaction_id, entered_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7)`,
        [member.id, payload.startDate, payload.monthlyAmount, payload.firstPaymentMode ?? 'cash', payload.firstPaymentProofKey || null, payload.firstPaymentTransactionId || null, enteredBy]
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
          // Backdated entry: the incentive sits in the start date's wallet period
          effectiveDate:     payload.startDate,
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
    // Referrer-scoped roles see their own referrals across ALL branches; everyone
    // else stays branch-scoped. The two are mutually exclusive — referrer_id alone
    // already pins the row to that person regardless of which branch entered it.
    const params: any[] = [];
    let where: string;
    if (query.referrerId) {
      params.push(query.referrerId);
      where = 'g.referrer_id = $1';
    } else {
      params.push(branchId);
      where = 'g.branch_id = $1';
    }
    let idx = 2;

    if (query.status) {
      where += ` AND g.status = $${idx++}`;
      params.push(query.status);
    }

    if (query.search) {
      where += ` AND (c.name ILIKE $${idx} OR g.chit_number ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})`;
      params.push(`%${query.search}%`);
      idx++;
    }

    if (query.startDate) {
      // Filter by business date (start_date), not insertion time, so backdated entries land in their real period
      where += ` AND g.start_date >= $${idx++}::date`;
      params.push(query.startDate);
    }
    if (query.endDate) {
      where += ` AND g.start_date < ($${idx++}::date + INTERVAL '1 day')`;
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
  // Referrer-scoped roles can open a member from any branch, but only one they
  // referred — gate on referrer_id instead of the branch match (same as the list
  // endpoint). Everyone else stays branch-scoped.
  async getMember(db: Pool, id: string, branchId: string, referrerId?: string): Promise<any> {
    const result = await db.query(
      `SELECT g.*,
              c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
              u.name AS entered_by_name, r.name AS referrer_user_name, r.role AS referrer_role
       FROM gold_scheme_members g
       JOIN customers c  ON g.customer_id  = c.id
       JOIN users u      ON g.entered_by   = u.id
       LEFT JOIN users r ON g.referrer_id  = r.id
       WHERE g.id = $1 AND ${referrerId ? 'g.referrer_id' : 'g.branch_id'} = $2`,
      [id, referrerId ?? branchId]
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
  // Returns branch-resident staff PLUS the GMs/Directors overseeing this branch
  // (linked via user_oversight_branches, not branch_id) PLUS the MD (no branch link).
  async getBranchEmployees(db: Pool, branchId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT DISTINCT u.id, u.name, u.role
       FROM users u
       WHERE u.is_active = true
         AND (
           (u.branch_id = $1 AND u.role NOT IN ('md', 'client'))
           OR (u.role IN ('gm', 'director')
               AND EXISTS (SELECT 1 FROM user_oversight_branches uob
                           WHERE uob.user_id = u.id AND uob.branch_id = $1))
           OR u.role = 'md'
         )
       ORDER BY u.name ASC`,
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
      `SELECT g.id, g.customer_id, g.total_months, g.referrer_id, g.chit_number, c.name AS customer_name
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
           (member_id, month_number, paid_date, amount, payment_mode, proof_key, transaction_id, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [memberId, payload.monthNumber, payload.paidDate, payload.amount, payload.paymentMode, payload.proofKey || null, payload.transactionId || null, payload.notes || null, enteredBy]
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
          // Backdated entry: the incentive sits in the paid date's wallet period
          effectiveDate:     payload.paidDate,
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
  async getPayments(db: Pool, memberId: string, branchId: string, referrerId?: string): Promise<any[]> {
    // Verify ownership: referrer-scoped roles match on referrer_id (their own
    // referrals across branches); everyone else stays branch-scoped.
    const check = await db.query(
      `SELECT id FROM gold_scheme_members WHERE id = $1 AND ${referrerId ? 'referrer_id' : 'branch_id'} = $2`,
      [memberId, referrerId ?? branchId]
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
    // Referrer-scoped roles: count their referrals across ALL branches (match on
    // referrer_id, drop the branch filter). Otherwise scope to the branch.
    const params: any[] = [];
    let baseWhere: string;
    if (referrerId) { params.push(referrerId); baseWhere = 'referrer_id = $1'; }
    else            { params.push(branchId);   baseWhere = 'branch_id = $1'; }
    let extra = '';
    let idx = params.length + 1;

    if (dateFilter?.startDate) {
      // Filter by business date (start_date) so backdated members count in their real period
      extra += ` AND start_date >= $${idx++}::date`;
      params.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      extra += ` AND start_date < ($${idx++}::date + INTERVAL '1 day')`;
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
       WHERE ${baseWhere}${extra}`,
      params
    );

    // ─── Commission query — sums incentives earned from gold_scheme ───
    // payment_event distinguishes enrollment (month 1) vs renewal (month 2+);
    // both columns are written by IncentiveService.distributeIncentives.
    // Referrer-scoped: sum incentives credited to that user across ALL branches.
    // Otherwise sum the whole branch's incentives.
    const commParams: any[] = [];
    let commWhere: string;
    if (referrerId) {
      commParams.push(referrerId, GOLD_PROJECT_CODE);
      commWhere = 'ei.user_id = $1 AND ei.scheme_code = $2';
    } else {
      commParams.push(branchId, GOLD_PROJECT_CODE);
      commWhere = 'g.branch_id = $1 AND ei.scheme_code = $2';
    }
    let commIdx = 3;
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

  // ─── CORRECT MEMBER (admin: MD / Management) ────────────────────────────────
  // Patches one or more editable fields on an existing member. When referrerId
  // or monthlyAmount changes, the enrollment incentive is reversed and re-issued
  // so the wallet always reflects the correct value and date.
  async correctMember(
    db: Pool,
    correctedBy: string,
    id: string,
    branchId: string,
    payload: CorrectGoldMemberInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Load the record; 404 if it doesn't exist in this branch
      const before = await client.query(
        `SELECT g.*, c.name AS customer_name
         FROM gold_scheme_members g
         JOIN customers c ON g.customer_id = c.id
         WHERE g.id = $1 AND g.branch_id = $2`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Gold member not found');
      const old = before.rows[0];

      // Build dynamic SET clause from whatever fields are supplied
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (payload.chitNumber   != null) { fields.push(`chit_number = $${idx++}`);     vals.push(payload.chitNumber); }
      if (payload.customerId   != null) { fields.push(`customer_id = $${idx++}`);     vals.push(payload.customerId); }
      if (payload.monthlyAmount != null) { fields.push(`monthly_amount = $${idx++}`); vals.push(payload.monthlyAmount); }
      if (payload.startDate    != null) { fields.push(`start_date = $${idx++}`);      vals.push(payload.startDate); }
      if (payload.totalMonths  != null) { fields.push(`total_months = $${idx++}`);    vals.push(payload.totalMonths); }
      if (payload.notes !== undefined)  { fields.push(`notes = $${idx++}`);           vals.push(payload.notes); }

      // Handle referrerId + denormalized referrer_name together
      if (payload.referrerId !== undefined) {
        if (payload.referrerId) {
          const ref = await client.query('SELECT name, role FROM users WHERE id = $1', [payload.referrerId]);
          if (ref.rows.length === 0) throw new NotFoundError('Referrer not found');
          const { name, role } = ref.rows[0];
          fields.push(`referrer_id = $${idx++}`);   vals.push(payload.referrerId);
          fields.push(`referrer_name = $${idx++}`); vals.push(`${name} ${role.toUpperCase().replace(/_/g, ' ')}`);
        } else {
          // null clears the referrer
          fields.push(`referrer_id = $${idx++}`);   vals.push(null);
          fields.push(`referrer_name = $${idx++}`); vals.push(null);
        }
      }

      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(id, branchId);
      const updated = await client.query(
        `UPDATE gold_scheme_members SET ${fields.join(', ')} WHERE id = $${idx} AND branch_id = $${idx + 1} RETURNING *`,
        vals
      );

      // Determine whether the enrollment incentive needs to be recalculated.
      // This fires when amount or referrer changed.
      const amountChanged   = payload.monthlyAmount != null && parseFloat(payload.monthlyAmount.toString()) !== parseFloat(old.monthly_amount);
      const referrerChanged = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrerId = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;
      const effectiveDate = payload.startDate ?? old.start_date;
      const effectiveAmount = payload.monthlyAmount ?? parseFloat(old.monthly_amount);

      if (amountChanged || referrerChanged) {
        // Always claw back first — clearing the referrer (null) must also remove
        // the old referrer's credit, so the reversal cannot depend on a new referrer.
        await IncentiveService.reverseIncentives(client, {
          schemeCode: GOLD_PROJECT_CODE,
          sourceId:   id,
          paymentEvent: 'enrollment',
        });
        if (effectiveReferrerId) {
          // Re-issue with corrected amount and business date
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        GOLD_PROJECT_CODE,
            dealMakerUserId:   effectiveReferrerId,
            mode:              'percent_referrer',
            percentRole:       'referrer_new',
            baseAmount:        parseFloat(effectiveAmount.toString()),
            paymentEvent:      'enrollment',
            sourceId:          id,
            sourceDescription: `Gold enrollment (corrected): Chit ${old.chit_number}`,
            creditedBy:        correctedBy,
            effectiveDate,
          });
        }
      }

      // A referrer change moves the renewal credits too: claw back every renewal
      // row and re-credit each recorded month>1 payment to the new referrer
      // (no re-credit when the referrer was cleared). Same pattern as unpayPayment.
      if (referrerChanged) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   GOLD_PROJECT_CODE,
          sourceId:     id,
          paymentEvent: 'renewal',
        });
        if (effectiveReferrerId) {
          const renewals = await client.query(
            `SELECT * FROM gold_scheme_payments WHERE member_id = $1 AND month_number > 1 ORDER BY month_number`,
            [id]
          );
          for (const pay of renewals.rows) {
            await IncentiveService.distributeIncentives(client, {
              schemeCode:        GOLD_PROJECT_CODE,
              dealMakerUserId:   effectiveReferrerId,
              mode:              'percent_referrer',
              percentRole:       'referrer_renewal',
              baseAmount:        parseFloat(pay.amount),
              paymentEvent:      'renewal',
              sourceId:          id,
              sourceDescription: `Gold M${pay.month_number} (referrer corrected): ${old.customer_name} – Chit ${old.chit_number}`,
              creditedBy:        correctedBy,
              effectiveDate:     pay.paid_date,
            });
          }
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: GOLD_PROJECT_CODE,
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

  // ─── CORRECT PAYMENT (admin: MD / Management) ────────────────────────────────
  // Patches an existing payment row. When amount, referrerId, or paidDate changes
  // the renewal incentive is reversed and re-issued with the corrected values.
  async correctPayment(
    db: Pool,
    correctedBy: string,
    memberId: string,
    paymentId: string,
    branchId: string,
    payload: CorrectGoldPaymentInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      // Verify branch ownership + load context
      const memberRow = await client.query(
        `SELECT g.referrer_id, g.chit_number, g.total_months, c.name AS customer_name
         FROM gold_scheme_members g
         JOIN customers c ON g.customer_id = c.id
         WHERE g.id = $1 AND g.branch_id = $2`,
        [memberId, branchId]
      );
      if (memberRow.rows.length === 0) throw new NotFoundError('Member not found');
      const member = memberRow.rows[0];

      const payRow = await client.query(
        `SELECT * FROM gold_scheme_payments WHERE id = $1 AND member_id = $2`,
        [paymentId, memberId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      // Dynamic UPDATE
      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.monthNumber != null)  { fields.push(`month_number = $${idx++}`);  vals.push(payload.monthNumber); }
      if (payload.paidDate    != null)  { fields.push(`paid_date = $${idx++}`);     vals.push(payload.paidDate); }
      if (payload.amount      != null)  { fields.push(`amount = $${idx++}`);        vals.push(payload.amount); }
      if (payload.paymentMode != null)  { fields.push(`payment_mode = $${idx++}`);  vals.push(payload.paymentMode); }
      if (payload.proofKey    != null)  { fields.push(`proof_key = $${idx++}`);     vals.push(payload.proofKey); }
      if (payload.transactionId !== undefined) { fields.push(`transaction_id = $${idx++}`); vals.push(payload.transactionId); }
      if (payload.notes !== undefined)  { fields.push(`notes = $${idx++}`);         vals.push(payload.notes); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(paymentId, memberId);
      const updated = await client.query(
        `UPDATE gold_scheme_payments SET ${fields.join(', ')} WHERE id = $${idx} AND member_id = $${idx + 1} RETURNING *`,
        vals
      );

      // Recalculate renewal incentive when amount or paidDate changed and month > 1
      const effectiveMonth = payload.monthNumber ?? parseInt(old.month_number, 10);
      const amountChanged  = payload.amount != null && parseFloat(payload.amount.toString()) !== parseFloat(old.amount);
      const dateChanged    = payload.paidDate != null && payload.paidDate !== old.paid_date;
      const effectiveDate  = payload.paidDate ?? old.paid_date;
      const effectiveAmount = payload.amount != null ? payload.amount : parseFloat(old.amount);

      if (effectiveMonth > 1 && member.referrer_id && (amountChanged || dateChanged)) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   GOLD_PROJECT_CODE,
          sourceId:     memberId,
          paymentEvent: 'renewal',
        });
        await IncentiveService.distributeIncentives(client, {
          schemeCode:        GOLD_PROJECT_CODE,
          dealMakerUserId:   member.referrer_id,
          mode:              'percent_referrer',
          percentRole:       'referrer_renewal',
          baseAmount:        parseFloat(effectiveAmount.toString()),
          paymentEvent:      'renewal',
          sourceId:          memberId,
          sourceDescription: `Gold M${effectiveMonth} payment (corrected): ${member.customer_name} – Chit ${member.chit_number}`,
          creditedBy:        correctedBy,
          effectiveDate,
        });
      }

      await SchemeAudit.log(client, {
        schemeCode: GOLD_PROJECT_CODE,
        entityType: 'payment',
        entityId:   paymentId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID MEMBER (admin: MD / Management) ────────────────────────────────
  // Soft-voids a gold member: marks status='voided', claws back ALL incentives
  // for this member (enrollment + renewals), and writes an audit row.
  async voidMember(
    db: Pool,
    actorId: string,
    id: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM gold_scheme_members WHERE id = $1 AND branch_id = $2`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Gold member not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Member is already voided');

      await client.query(
        `UPDATE gold_scheme_members SET status = 'voided' WHERE id = $1`,
        [id]
      );

      // Claw back all incentives for this member (all payment events)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: GOLD_PROJECT_CODE,
        sourceId:   id,
      });

      await SchemeAudit.log(client, {
        schemeCode: GOLD_PROJECT_CODE,
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
  // Permanently deletes a gold member and all of its payments, claws back ALL
  // incentives, and snapshots the full before-state into the audit log so the
  // data is recoverable from scheme_corrections_audit.old_values.
  async deleteMember(
    db: Pool,
    actorId: string,
    id: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT * FROM gold_scheme_members WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [id, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Gold member not found');
      const old = before.rows[0];

      const payments = await client.query(
        `SELECT * FROM gold_scheme_payments WHERE member_id = $1 ORDER BY month_number`,
        [id]
      );

      // Claw back all incentives for this member (enrollment + renewals)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: GOLD_PROJECT_CODE,
        sourceId:   id,
      });

      // Payments cascade on member delete, but delete explicitly to keep intent visible
      await client.query(`DELETE FROM gold_scheme_payments WHERE member_id = $1`, [id]);
      await client.query(`DELETE FROM gold_scheme_members WHERE id = $1`, [id]);

      await SchemeAudit.log(client, {
        schemeCode: GOLD_PROJECT_CODE,
        entityType: 'member',
        entityId:   id,
        actorId,
        action:     'delete',
        oldValues:  { member: old, payments: payments.rows },
      });

      return { deleted: true, id, payments: payments.rows.length };
    });
  },

  // ─── UNPAY PAYMENT (admin: MD / Management) ─────────────────────────────
  // Deletes a single recorded payment and claws back only that payment's
  // incentive (renewal event). Does not touch other payments.
  async unpayPayment(
    db: Pool,
    actorId: string,
    memberId: string,
    paymentId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const memberRow = await client.query(
        `SELECT g.referrer_id, g.chit_number, c.name AS customer_name
         FROM gold_scheme_members g
         JOIN customers c ON g.customer_id = c.id
         WHERE g.id = $1 AND g.branch_id = $2`,
        [memberId, branchId]
      );
      if (memberRow.rows.length === 0) throw new NotFoundError('Member not found');

      const payRow = await client.query(
        `SELECT * FROM gold_scheme_payments WHERE id = $1 AND member_id = $2`,
        [paymentId, memberId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      await client.query(
        `DELETE FROM gold_scheme_payments WHERE id = $1`,
        [paymentId]
      );

      // Reverse only this payment's renewal incentive so other months are untouched.
      // We delete by source_id=memberId AND payment_event='renewal' only, then re-credit
      // the remaining renewal payments to avoid leaving a gap.
      // Simpler approach: reverse all renewals then re-distribute from remaining payments.
      if (memberRow.rows[0].referrer_id) {
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   GOLD_PROJECT_CODE,
          sourceId:     memberId,
          paymentEvent: 'renewal',
        });
        // Re-credit all remaining renewal payments
        const remaining = await client.query(
          `SELECT * FROM gold_scheme_payments WHERE member_id = $1 AND month_number > 1 ORDER BY month_number`,
          [memberId]
        );
        for (const pay of remaining.rows) {
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        GOLD_PROJECT_CODE,
            dealMakerUserId:   memberRow.rows[0].referrer_id,
            mode:              'percent_referrer',
            percentRole:       'referrer_renewal',
            baseAmount:        parseFloat(pay.amount),
            paymentEvent:      'renewal',
            sourceId:          memberId,
            sourceDescription: `Gold M${pay.month_number} (re-issued after unpay): ${memberRow.rows[0].customer_name}`,
            creditedBy:        actorId,
            effectiveDate:     pay.paid_date,
          });
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: GOLD_PROJECT_CODE,
        entityType: 'payment',
        entityId:   paymentId,
        actorId,
        action:     'unpay',
        oldValues:  old,
      });

      return old;
    });
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
    // Filter by business date (start_date) so backdated members count in their real period
    if (dateFilter?.startDate) { where += ` AND m.start_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND m.start_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         m.id, m.chit_number, m.monthly_amount,
         m.total_months, m.status, m.start_date, m.created_at,
         m.referrer_id, m.referrer_name,
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
