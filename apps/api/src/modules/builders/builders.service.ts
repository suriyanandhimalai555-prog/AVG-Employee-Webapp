import { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import type {
  CreateBuildersPlanInput,
  RecordBuildersPayoutInput,
  ChooseRewardInput,
  GetBuildersPlansQuery,
} from './builders.schema';
import { BUILDERS_PACKAGES } from './builders.schema';

const SCHEME_CODE    = 'builders_scheme';
const COOLING_DAYS   = 60;
const DECISION_MONTH = 50;  // month at which customer chooses house or cash
const FINAL_MONTH    = 60;  // last payout month (cash path only)

export const BuildersService = {
  schemeCode: SCHEME_CODE,

  // ─── GET PACKAGES ────────────────────────────────────────────────────────────
  // Returns the in-memory package table — used by GET /packages to inform the UI
  // without a DB round-trip.
  getPackages(): typeof BUILDERS_PACKAGES {
    return BUILDERS_PACKAGES;
  },

  // ─── CREATE PLAN ─────────────────────────────────────────────────────────────
  // Validates customer + referrer, derives all amounts from the chosen package,
  // computes cooling dates, inserts one row into builders_plans.
  // Incentive wiring is scaffolded but not active — see the TODO below.
  async createPlan(
    db: Pool,
    enteredBy: string,
    branchId: string,
    payload: CreateBuildersPlanInput
  ): Promise<any> {
    const pkg = BUILDERS_PACKAGES[payload.packageNumber];
    if (!pkg) throw new ValidationError('Invalid package number');

    // Validate customer belongs to this branch (same pattern as gold/chit)
    const custResult = await db.query(
      'SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2',
      [payload.customerId, branchId]
    );
    if (custResult.rows.length === 0) throw new NotFoundError('Customer not found in this branch');

    // Capture referrer name now — denormalised so the audit survives referrer deactivation
    let referrerName: string | null = null;
    if (payload.referrerId) {
      const refResult = await db.query(
        'SELECT name, role FROM users WHERE id = $1',
        [payload.referrerId]
      );
      if (refResult.rows.length === 0) throw new NotFoundError('Referrer not found');
      const { name, role } = refResult.rows[0];
      referrerName = `${name} ${role.toUpperCase().replace(/_/g, ' ')}`;
    }

    const result = await db.query(
      `INSERT INTO builders_plans
         (branch_id, customer_id, package_number,
          investment_amount, monthly_payout, cash_final_monthly, house_worth,
          lump_sum_date, lump_sum_mode,
          cooling_end_date, payout_start_date,
          referrer_id, referrer_name, notes, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               ($8::date + $10 * INTERVAL '1 day'),
               ($8::date + $10 * INTERVAL '1 day'),
               $11, $12, $13, $14)
       RETURNING *`,
      [
        branchId,
        payload.customerId,
        payload.packageNumber,
        pkg.investmentAmount,
        pkg.monthlyPayout,
        pkg.cashFinalMonthly,  // cash_final_monthly = ADDITIONAL bonus for M51-60 on top of monthly_payout
        pkg.houseWorth,
        payload.lumpSumDate,
        payload.lumpSumMode,
        COOLING_DAYS,
        payload.referrerId || null,
        referrerName,
        payload.notes || null,
        enteredBy,
      ]
    );

    // TODO: IncentiveService.distributeIncentives(client, {
    //   schemeCode:        SCHEME_CODE,
    //   dealMakerUserId:   payload.referrerId,
    //   mode:              'percent_referrer',
    //   percentRole:       'referrer_direct',
    //   baseAmount:        pkg.investmentAmount,
    //   paymentEvent:      'enrollment',
    //   sourceId:          plan.id,
    //   sourceDescription: `Builders enrollment: ${customerName}`,
    //   creditedBy:        enteredBy,
    // });
    // Wire this when incentive percentages are finalised — migration 047 seeds a 0% placeholder.

    return { plan: result.rows[0], customer: custResult.rows[0] };
  },

  // ─── LIST PLANS ──────────────────────────────────────────────────────────────
  async listPlans(
    db: Pool,
    branchId: string,
    query: GetBuildersPlansQuery
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [branchId];
    let where = 'p.branch_id = $1';
    let idx = 2;

    if (query.status === 'in_progress') {
      // Virtual filter: everything not terminal
      where += ` AND p.status NOT IN ('completed', 'cancelled')`;
    } else if (query.status) {
      where += ` AND p.status = $${idx++}`;
      params.push(query.status);
    }

    if (query.referrerId) {
      where += ` AND p.referrer_id = $${idx++}`;
      params.push(query.referrerId);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM builders_plans p WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         p.*,
         c.name         AS customer_name,
         c.phone        AS customer_phone,
         c.customer_code,
         u.name         AS entered_by_name,
         (SELECT COUNT(*)::int FROM builders_payouts bp WHERE bp.plan_id = p.id) AS payouts_recorded
       FROM builders_plans p
       JOIN customers c ON c.id = p.customer_id
       JOIN users     u ON u.id = p.entered_by
       WHERE ${where}
       ORDER BY
         CASE p.status
           WHEN 'decision_pending' THEN 0
           WHEN 'active'           THEN 1
           WHEN 'cooling'          THEN 2
           WHEN 'house'            THEN 3
           WHEN 'cash'             THEN 4
           WHEN 'completed'        THEN 5
           WHEN 'cancelled'        THEN 6
           ELSE 7
         END ASC,
         p.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET SINGLE PLAN ─────────────────────────────────────────────────────────
  async getPlan(db: Pool, planId: string, branchId: string): Promise<any> {
    const planResult = await db.query(
      `SELECT
         p.*,
         c.name         AS customer_name,
         c.phone        AS customer_phone,
         c.customer_code,
         u.name         AS entered_by_name
       FROM builders_plans p
       JOIN customers c ON c.id = p.customer_id
       JOIN users     u ON u.id = p.entered_by
       WHERE p.id = $1 AND p.branch_id = $2`,
      [planId, branchId]
    );
    if (planResult.rows.length === 0) throw new NotFoundError('Plan not found');
    const plan = planResult.rows[0];

    const payoutsResult = await db.query(
      `SELECT bp.*, u.name AS entered_by_name
       FROM builders_payouts bp
       JOIN users u ON u.id = bp.entered_by
       WHERE bp.plan_id = $1
       ORDER BY bp.month_number ASC`,
      [planId]
    );

    return { ...plan, payouts: payoutsResult.rows };
  },

  // ─── GET PLAN PAYOUTS ────────────────────────────────────────────────────────
  async getPayouts(db: Pool, planId: string, branchId: string): Promise<any[]> {
    const check = await db.query(
      'SELECT id FROM builders_plans WHERE id = $1 AND branch_id = $2',
      [planId, branchId]
    );
    if (check.rows.length === 0) throw new NotFoundError('Plan not found');

    const result = await db.query(
      `SELECT bp.*, u.name AS entered_by_name
       FROM builders_payouts bp
       JOIN users u ON u.id = bp.entered_by
       WHERE bp.plan_id = $1
       ORDER BY bp.month_number ASC`,
      [planId]
    );
    return result.rows;
  },

  // ─── RECORD PAYOUT ───────────────────────────────────────────────────────────
  // Enforces sequential payout recording (month N requires current_month = N-1).
  // Status transitions:
  //   cooling         → active           (month 1, after cooling_end_date)
  //   active          → decision_pending (month 50)
  //   cash            → completed        (month 60)
  // The cooling_end_date guard prevents recording month 1 before the 60-day window.
  async recordPayout(
    db: Pool,
    enteredBy: string,
    planId: string,
    branchId: string,
    payload: RecordBuildersPayoutInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const planResult = await client.query(
        `SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [planId, branchId]
      );
      if (planResult.rows.length === 0) throw new NotFoundError('Plan not found');
      const plan = planResult.rows[0];

      // Terminal status checks
      if (['completed', 'cancelled'].includes(plan.status)) {
        throw new ValidationError(`Cannot record a payout for a ${plan.status} plan`);
      }
      if (plan.status === 'decision_pending') {
        throw new ValidationError(
          'Customer must choose House or Cash before further payouts can be recorded'
        );
      }
      if (plan.status === 'house') {
        throw new ValidationError(
          'This plan opted for a house. Use "Complete Plan" when the house is delivered.'
        );
      }

      // Cooling-period guard: month 1 cannot be recorded before cooling_end_date
      if (plan.status === 'cooling') {
        const coolingEnd = plan.cooling_end_date as string; // stored as 'YYYY-MM-DD'
        if (payload.payoutDate < coolingEnd) {
          throw new ValidationError(
            `Cooling period ends on ${coolingEnd}. Payout date must be on or after this date.`
          );
        }
      }

      // Sequential guard: payout months must be contiguous
      const expectedMonth = parseInt(plan.current_month, 10) + 1;
      if (payload.monthNumber !== expectedMonth) {
        throw new ValidationError(
          `Payouts must be recorded sequentially. Expected month ${expectedMonth}, received month ${payload.monthNumber}.`
        );
      }
      if (payload.monthNumber > FINAL_MONTH) {
        throw new ValidationError('All 60 months have already been paid out');
      }

      // Insert payout row; unique constraint (plan_id, month_number) guards duplicates
      let payoutRow: any;
      try {
        const insertResult = await client.query(
          `INSERT INTO builders_payouts
             (plan_id, month_number, amount, payout_date, payment_mode, notes, entered_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            planId,
            payload.monthNumber,
            payload.amount,
            payload.payoutDate,
            payload.paymentMode,
            payload.notes || null,
            enteredBy,
          ]
        );
        payoutRow = insertResult.rows[0];
      } catch (err: any) {
        if (err.code === '23505') {
          throw new ConflictError(`Month ${payload.monthNumber} payout has already been recorded`);
        }
        throw err;
      }

      // Determine next status
      let newStatus: string = plan.status;
      if (plan.status === 'cooling')                                       newStatus = 'active';
      if (payload.monthNumber === DECISION_MONTH)                          newStatus = 'decision_pending';
      if (plan.status === 'cash' && payload.monthNumber === FINAL_MONTH)   newStatus = 'completed';

      await client.query(
        `UPDATE builders_plans SET current_month = $1, status = $2 WHERE id = $3`,
        [payload.monthNumber, newStatus, planId]
      );

      return {
        payout:       payoutRow,
        newStatus,
        currentMonth: payload.monthNumber,
      };
    });
  },

  // ─── CHOOSE REWARD ───────────────────────────────────────────────────────────
  // Only permitted when status = 'decision_pending' (i.e. month 50 was just paid).
  // Choosing 'house' requires land_provided = true.
  // Status transitions: decision_pending → 'house' OR 'cash'
  async chooseReward(
    db: Pool,
    chosenBy: string,
    planId: string,
    branchId: string,
    payload: ChooseRewardInput
  ): Promise<any> {
    const planResult = await db.query(
      'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2',
      [planId, branchId]
    );
    if (planResult.rows.length === 0) throw new NotFoundError('Plan not found');
    const plan = planResult.rows[0];

    if (plan.status !== 'decision_pending') {
      throw new ValidationError(
        `Reward choice is only available when status is "decision_pending". Current status: ${plan.status}`
      );
    }
    if (plan.reward_choice) {
      throw new ValidationError('A reward has already been chosen for this plan');
    }
    if (payload.choice === 'house' && !payload.landProvided) {
      throw new ValidationError(
        'The customer must provide land to choose the house option. Set landProvided to true.'
      );
    }

    const result = await db.query(
      `UPDATE builders_plans
       SET reward_choice    = $1,
           land_provided    = $2,
           choice_made_at   = NOW(),
           choice_made_by   = $3,
           status           = $4
       WHERE id = $5
       RETURNING *`,
      [
        payload.choice,
        payload.choice === 'house' ? true : (payload.landProvided ?? false),
        chosenBy,
        payload.choice,   // 'house' or 'cash' becomes the new status
        planId,
      ]
    );
    return result.rows[0];
  },

  // ─── COMPLETE PLAN (house path) ──────────────────────────────────────────────
  // The cash path auto-completes when month 60 payout is recorded.
  // The house path requires the branch admin to manually confirm delivery.
  async completePlan(
    db: Pool,
    _completedBy: string,
    planId: string,
    branchId: string
  ): Promise<any> {
    const planResult = await db.query(
      'SELECT status FROM builders_plans WHERE id = $1 AND branch_id = $2',
      [planId, branchId]
    );
    if (planResult.rows.length === 0) throw new NotFoundError('Plan not found');
    const plan = planResult.rows[0];

    if (plan.status !== 'house') {
      throw new ValidationError(
        `Only a plan in "house" status can be manually completed. Current status: ${plan.status}`
      );
    }

    const result = await db.query(
      `UPDATE builders_plans SET status = 'completed' WHERE id = $1 RETURNING *`,
      [planId]
    );
    return result.rows[0];
  },

  // ─── BRANCH SUMMARY (SchemeService contract — required) ─────────────────────
  async getBranchSummary(
    db: Pool,
    branchId: string,
    _scopedToUserId?: string,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any> {
    const params: any[] = [branchId];
    let where = 'p.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND p.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const plansResult = await db.query(
      `SELECT
         COUNT(*)::int                                                       AS total_plans,
         COUNT(*) FILTER (WHERE p.status = 'cooling')::int                 AS cooling_plans,
         COUNT(*) FILTER (WHERE p.status = 'active')::int                  AS active_plans,
         COUNT(*) FILTER (WHERE p.status = 'decision_pending')::int        AS decision_pending_plans,
         COUNT(*) FILTER (WHERE p.status = 'house')::int                   AS house_plans,
         COUNT(*) FILTER (WHERE p.status = 'cash')::int                    AS cash_plans,
         COUNT(*) FILTER (WHERE p.status = 'completed')::int               AS completed_plans,
         COUNT(*) FILTER (WHERE p.status = 'cancelled')::int               AS cancelled_plans,
         COALESCE(SUM(p.investment_amount), 0)                             AS total_invested
       FROM builders_plans p
       WHERE ${where}`,
      params
    );

    // Total paid out — sum all payout records for plans in this branch + date window
    const payoutResult = await db.query(
      `SELECT COALESCE(SUM(bp.amount), 0) AS total_paid_out
       FROM builders_payouts bp
       JOIN builders_plans p ON p.id = bp.plan_id
       WHERE ${where}`,
      params
    );

    // Commission — from the unified incentives ledger (0 until incentive wiring is done)
    const commParams: any[] = [branchId, SCHEME_CODE];
    let commWhere = 'bp2.branch_id = $1 AND ei.scheme_code = $2';
    let commIdx = 3;
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commResult = await db.query(
      `SELECT COALESCE(SUM(ei.amount), 0) AS total_commission
       FROM employee_incentives ei
       JOIN builders_plans bp2 ON bp2.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}`,
      commParams
    );

    const p = plansResult.rows[0];
    return {
      totalPlans:           p.total_plans,
      coolingPlans:         p.cooling_plans,
      activePlans:          p.active_plans,
      decisionPendingPlans: p.decision_pending_plans,
      housePlans:           p.house_plans,
      cashPlans:            p.cash_plans,
      completedPlans:       p.completed_plans,
      cancelledPlans:       p.cancelled_plans,
      totalInvested:        parseFloat(p.total_invested),
      totalPaidOut:         parseFloat(payoutResult.rows[0].total_paid_out),
      totalCommission:      parseFloat(commResult.rows[0].total_commission),
    };
  },

  // ─── OVERVIEW BY BRANCH (SchemeService contract — optional) ──────────────────
  // Implements the MD/Director aggregate dashboard. 'collected' = lump sums in
  // (investment_amount) to match the contract's semantics across all schemes.
  async getOverviewByBranch(
    db: Pool,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number; commission: number }>> {
    const memParams: any[] = [];
    let memWhere = '1=1';
    let memIdx = 1;
    if (dateFilter?.startDate) { memWhere += ` AND p.created_at >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memWhere += ` AND p.created_at < ($${memIdx++}::date + INTERVAL '1 day')`; memParams.push(dateFilter.endDate); }

    const plansRes = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         p.branch_id,
         b.name                              AS branch_name,
         COUNT(DISTINCT p.id)::int           AS count,
         COALESCE(SUM(p.investment_amount), 0) AS collected
       FROM builders_plans p
       JOIN branches b ON b.id = p.branch_id
       WHERE ${memWhere}
       GROUP BY p.branch_id, b.name
       ORDER BY b.name ASC`,
      memParams
    );

    const commParams: any[] = [SCHEME_CODE];
    let commWhere = 'ei.scheme_code = $1';
    let commIdx = 2;
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT bp2.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN builders_plans bp2 ON bp2.id = ei.source_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}
       GROUP BY bp2.branch_id`,
      commParams
    );

    const commByBranch = new Map<string, number>();
    for (const row of commRes.rows) commByBranch.set(row.branch_id, parseFloat(row.commission));

    return plansRes.rows.map(r => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      count:      parseInt(r.count, 10),
      collected:  parseFloat(r.collected),
      commission: commByBranch.get(r.branch_id) ?? 0,
    }));
  },

  // ─── ENTRIES BY BRANCH (SchemeService contract — optional) ───────────────────
  async getEntriesByBranch(
    db: Pool,
    branchId: string,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'p.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND p.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND p.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         p.id, p.package_number, p.investment_amount, p.monthly_payout,
         p.status, p.current_month, p.reward_choice, p.lump_sum_date, p.created_at,
         c.name AS customer_name, c.customer_code,
         (SELECT COALESCE(SUM(bp.amount), 0) FROM builders_payouts bp WHERE bp.plan_id = p.id) AS total_paid_out
       FROM builders_plans p
       JOIN customers c ON c.id = p.customer_id
       WHERE ${where}
       ORDER BY p.created_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  },
};
