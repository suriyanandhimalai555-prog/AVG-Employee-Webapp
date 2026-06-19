import { Pool, PoolClient } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { enqueueSchemeNotification } from '../notifications/notifications.outbox';
import { addNotificationJob } from '../notifications/notifications.queue';
import { IncentiveService } from '../incentives/incentives.service';
import { SchemeAudit } from '../../shared/scheme-audit';
import type {
  CreateBuildersPlanInput,
  RecordBuildersPayoutInput,
  ChooseRewardInput,
  ChangeRewardInput,
  GetBuildersPlansQuery,
  CorrectBuildersPlanInput,
  CorrectBuildersPayoutInput,
} from './builders.schema';
import { BUILDERS_PACKAGES } from './builders.schema';
import { BuildersIncentivesService } from './builders-incentives.service';

const SCHEME_CODE    = 'builders_scheme';
const COOLING_DAYS   = 60;
const DECISION_MONTH = 50;  // month at which customer chooses house or cash
const FINAL_MONTH    = 60;  // last payout month (cash path only)

export const BuildersService = {
  schemeCode: SCHEME_CODE,

  // ─── GET PACKAGES (DB) ───────────────────────────────────────────────────────
  // Reads from builders_packages table (migration 057). Falls back to the hardcoded
  // BUILDERS_PACKAGES object when the table returns no rows (e.g. pre-migration env).
  async getPackages(db: Pool): Promise<Record<number, typeof BUILDERS_PACKAGES[keyof typeof BUILDERS_PACKAGES]>> {
    const res = await db.query(
      `SELECT package_number, investment_amount, monthly_payout, cash_final_monthly, house_worth
       FROM builders_packages
       WHERE is_active = true
       ORDER BY package_number ASC`
    );
    if (res.rows.length === 0) return BUILDERS_PACKAGES;
    const map: Record<number, { investmentAmount: number; monthlyPayout: number; cashFinalMonthly: number; houseWorth: number }> = {};
    for (const r of res.rows) {
      map[r.package_number] = {
        investmentAmount:  parseFloat(r.investment_amount),
        monthlyPayout:     parseFloat(r.monthly_payout),
        cashFinalMonthly:  parseFloat(r.cash_final_monthly),
        houseWorth:        parseFloat(r.house_worth),
      };
    }
    return map;
  },

  // ─── UPDATE PACKAGE (DB, config roles only) ──────────────────────────────────
  async updatePackage(
    db: Pool,
    packageNumber: number,
    payload: { investmentAmount?: number; monthlyPayout?: number; cashFinalMonthly?: number; houseWorth?: number }
  ): Promise<any> {
    const fields: string[] = [];
    const values: any[]    = [];
    let idx = 1;
    if (payload.investmentAmount  != null) { fields.push(`investment_amount = $${idx++}`);  values.push(payload.investmentAmount); }
    if (payload.monthlyPayout     != null) { fields.push(`monthly_payout = $${idx++}`);     values.push(payload.monthlyPayout); }
    if (payload.cashFinalMonthly  != null) { fields.push(`cash_final_monthly = $${idx++}`); values.push(payload.cashFinalMonthly); }
    if (payload.houseWorth        != null) { fields.push(`house_worth = $${idx++}`);        values.push(payload.houseWorth); }
    if (fields.length === 0) throw new Error('No fields to update');
    fields.push(`updated_at = now()`);
    values.push(packageNumber);
    const res = await db.query(
      `UPDATE builders_packages SET ${fields.join(', ')} WHERE package_number = $${idx} RETURNING *`,
      values
    );
    if (res.rows.length === 0) throw new Error(`Package ${packageNumber} not found`);
    return res.rows[0];
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
    // TS: load live packages from DB; fall back to hardcoded if table not yet migrated
    const packages = await BuildersService.getPackages(db);
    const pkg = packages[payload.packageNumber];
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

    // TS: closure variable captures the outbox id from inside the transaction
    let notifOutboxId: string | null = null;
    const result = await runInTransaction(db, async (client: PoolClient) => {
      const insertResult = await client.query(
        `INSERT INTO builders_plans
           (branch_id, customer_id, package_number,
            investment_amount, monthly_payout, cash_final_monthly, house_worth,
            lump_sum_date, lump_sum_mode, lump_sum_proof_key,
            cooling_end_date, payout_start_date,
            referrer_id, referrer_name, notes, entered_by, lump_sum_transaction_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                 ($8::date + $11 * INTERVAL '1 day'),
                 ($8::date + $11 * INTERVAL '1 day'),
                 $12, $13, $14, $15, $16)
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
          payload.lumpSumProofKey || null,
          COOLING_DAYS,
          payload.referrerId || null,
          referrerName,
          payload.notes || null,
          enteredBy,
          payload.lumpSumTransactionId || null,
        ]
      );
      const plan = insertResult.rows[0];

      // Credit the one-time enrollment incentive to the selling chain (SO → GM).
      // No-op when referrerId is absent — idempotent, never throws.
      await BuildersIncentivesService.distributeOneTime(client, {
        plan:         { id: plan.id, referrer_id: plan.referrer_id, package_number: plan.package_number },
        creditedBy:   enteredBy,
        customerName: custResult.rows[0].name,
        // Backdated entry: the incentive sits in the lump-sum date's wallet period
        effectiveDate: payload.lumpSumDate,
      });

      // Queue WhatsApp enrollment notification inside txn (atomic with plan insert)
      notifOutboxId = await enqueueSchemeNotification(client, {
        schemeCode:     'builders_scheme',
        event:          'enrollment',
        sourceId:       plan.id,
        customerId:     payload.customerId,
        branchId,
        templateParams: {
          customerName: custResult.rows[0].name,
          schemeName:   `Builders Scheme — Package ${payload.packageNumber}`,
          amount:       parseFloat(pkg.investmentAmount.toString()),
          dateStr:      payload.lumpSumDate,
        },
      });

      return { plan, customer: custResult.rows[0] };
    });

    if (notifOutboxId) {
      addNotificationJob(notifOutboxId).catch((err) =>
        console.error(`⚠️  Builders notify enqueue failed (outbox ${notifOutboxId}):`, err)
      );
    }
    return result;
  },

  // ─── LIST PLANS ──────────────────────────────────────────────────────────────
  async listPlans(
    db: Pool,
    branchId: string,
    query: GetBuildersPlansQuery
  ): Promise<{ data: any[]; total: number }> {
    // Referrer-scoped roles see their own referred plans across ALL branches (match
    // on referrer_id, drop the branch filter); everyone else stays branch-scoped.
    const params: any[] = [];
    let where: string;
    if (query.referrerId) {
      params.push(query.referrerId);
      where = 'p.referrer_id = $1';
    } else {
      params.push(branchId);
      where = 'p.branch_id = $1';
    }
    let idx = 2;

    if (query.status === 'in_progress') {
      // Virtual filter: everything not terminal
      where += ` AND p.status NOT IN ('completed', 'cancelled')`;
    } else if (query.status) {
      where += ` AND p.status = $${idx++}`;
      params.push(query.status);
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
  // Referrer-scoped roles can open a plan from any branch, but only one they
  // referred — gate on referrer_id instead of the branch match (same as the list
  // endpoint). Everyone else stays branch-scoped.
  async getPlan(db: Pool, planId: string, branchId: string, referrerId?: string): Promise<any> {
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
       WHERE p.id = $1 AND ${referrerId ? 'p.referrer_id' : 'p.branch_id'} = $2`,
      [planId, referrerId ?? branchId]
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
  async getPayouts(db: Pool, planId: string, branchId: string, referrerId?: string): Promise<any[]> {
    // Referrer-scoped roles match on referrer_id (their own cross-branch
    // referrals); everyone else stays branch-scoped.
    const check = await db.query(
      `SELECT id FROM builders_plans WHERE id = $1 AND ${referrerId ? 'referrer_id' : 'branch_id'} = $2`,
      [planId, referrerId ?? branchId]
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
             (plan_id, month_number, amount, payout_date, payment_mode, proof_key, transaction_id, notes, entered_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING *`,
          [
            planId,
            payload.monthNumber,
            payload.amount,
            payload.payoutDate,
            payload.paymentMode,
            payload.proofKey || null,
            payload.transactionId || null,
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

      // Credit the SO's monthly incentive for this payout month.
      // No-op when the plan has no referrer or the referrer is not a sales_officer.
      await BuildersIncentivesService.creditMonthly(client, {
        plan:        { id: plan.id, referrer_id: plan.referrer_id, package_number: plan.package_number },
        monthNumber: payload.monthNumber,
        creditedBy:  enteredBy,
        // Backdated entry: the incentive sits in the payout date's wallet period
        effectiveDate: payload.payoutDate,
      });

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

  // ─── CHANGE REWARD (admin: MD / Management — corrects a wrong reward choice) ─
  // Only permitted when status = 'house' or 'cash' (i.e. a choice was already made).
  // Allows flipping house→cash or cash→house without touching payouts or incentives.
  // The calling admin should also correct any M51-60 payout amounts separately if needed.
  async changeReward(
    db: Pool,
    actorId: string,
    planId: string,
    branchId: string,
    payload: ChangeRewardInput
  ): Promise<any> {
    const planResult = await db.query(
      'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2',
      [planId, branchId]
    );
    if (planResult.rows.length === 0) throw new NotFoundError('Plan not found');
    const old = planResult.rows[0];

    if (!['house', 'cash'].includes(old.status)) {
      throw new ValidationError(
        `Reward can only be changed on plans in "house" or "cash" status. Current status: ${old.status}`
      );
    }
    if (old.status === payload.choice) {
      throw new ValidationError(`Plan is already on the "${payload.choice}" path`);
    }
    if (payload.choice === 'house' && !payload.landProvided) {
      throw new ValidationError(
        'The customer must provide land to choose the house option. Set landProvided to true.'
      );
    }

    const updated = await db.query(
      `UPDATE builders_plans
       SET reward_choice  = $1,
           status         = $2,
           land_provided  = $3,
           choice_made_at = NOW(),
           choice_made_by = $4
       WHERE id = $5
       RETURNING *`,
      [
        payload.choice,
        payload.choice,
        payload.choice === 'house' ? true : (payload.landProvided ?? false),
        actorId,
        planId,
      ]
    );

    await SchemeAudit.log(db as any, {
      schemeCode: SCHEME_CODE,
      entityType: 'plan',
      entityId:   planId,
      actorId,
      action:     'edit',
      oldValues:  old,
      newValues:  updated.rows[0],
    });

    return updated.rows[0];
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
    scopedToUserId?: string,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any> {
    // Referrer-scoped roles: count their referred plans across ALL branches (match
    // on referrer_id, drop the branch filter); otherwise scope to the branch.
    const params: any[] = [];
    let where: string;
    if (scopedToUserId) { params.push(scopedToUserId); where = 'p.referrer_id = $1'; }
    else                { params.push(branchId);       where = 'p.branch_id = $1'; }
    let idx = 2;
    // Filter by business date (lump_sum_date) so backdated plans count in their real period
    if (dateFilter?.startDate) { where += ` AND p.lump_sum_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND p.lump_sum_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

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

    // Commission — from the unified incentives ledger (0 until incentive wiring is done).
    // Referrer-scoped: sum incentives credited to that user across ALL branches.
    const commParams: any[] = [];
    let commWhere: string;
    if (scopedToUserId) { commParams.push(scopedToUserId, SCHEME_CODE); commWhere = 'ei.user_id = $1 AND ei.scheme_code = $2'; }
    else                { commParams.push(branchId, SCHEME_CODE);       commWhere = 'bp2.branch_id = $1 AND ei.scheme_code = $2'; }
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
    // Filter by business date (lump_sum_date) so backdated plans count in their real period
    if (dateFilter?.startDate) { memWhere += ` AND p.lump_sum_date >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memWhere += ` AND p.lump_sum_date < ($${memIdx++}::date + INTERVAL '1 day')`; memParams.push(dateFilter.endDate); }

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

  // ─── CORRECT PLAN (admin: MD / Management) ──────────────────────────────────
  // Patches editable plan fields. When referrerId or lumpSumDate changes the
  // one-time enrollment incentive is reversed and re-distributed with the
  // corrected referrer and the business date as effectiveDate.
  async correctPlan(
    db: Pool,
    correctedBy: string,
    planId: string,
    branchId: string,
    payload: CorrectBuildersPlanInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT p.*, c.name AS customer_name
         FROM builders_plans p
         JOIN customers c ON c.id = p.customer_id
         WHERE p.id = $1 AND p.branch_id = $2`,
        [planId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Plan not found');
      const old = before.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;

      if (payload.customerId      != null) { fields.push(`customer_id = $${idx++}`);        vals.push(payload.customerId); }
      if (payload.lumpSumDate     != null) { fields.push(`lump_sum_date = $${idx++}`);      vals.push(payload.lumpSumDate); }
      if (payload.lumpSumMode     != null) { fields.push(`lump_sum_mode = $${idx++}`);      vals.push(payload.lumpSumMode); }
      if (payload.lumpSumProofKey != null) { fields.push(`lump_sum_proof_key = $${idx++}`); vals.push(payload.lumpSumProofKey); }
      if (payload.lumpSumTransactionId !== undefined) { fields.push(`lump_sum_transaction_id = $${idx++}`); vals.push(payload.lumpSumTransactionId); }
      if (payload.notes !== undefined)     { fields.push(`notes = $${idx++}`);               vals.push(payload.notes); }

      // Handle referrerId + denormalised name together
      if (payload.referrerId !== undefined) {
        if (payload.referrerId) {
          const ref = await client.query('SELECT name, role FROM users WHERE id = $1', [payload.referrerId]);
          if (ref.rows.length === 0) throw new NotFoundError('Referrer not found');
          const { name, role } = ref.rows[0];
          fields.push(`referrer_id = $${idx++}`);   vals.push(payload.referrerId);
          fields.push(`referrer_name = $${idx++}`); vals.push(`${name} ${role.toUpperCase().replace(/_/g, ' ')}`);
        } else {
          fields.push(`referrer_id = $${idx++}`);   vals.push(null);
          fields.push(`referrer_name = $${idx++}`); vals.push(null);
        }
      }

      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(planId, branchId);
      const updated = await client.query(
        `UPDATE builders_plans SET ${fields.join(', ')} WHERE id = $${idx} AND branch_id = $${idx + 1} RETURNING *`,
        vals
      );

      const referrerChanged   = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;
      const effectiveDate     = payload.lumpSumDate ?? old.lump_sum_date;

      if (referrerChanged) {
        // Always claw back first — clearing the referrer (null) must also remove
        // the old chain's credit, so the reversal cannot depend on a new referrer.
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     planId,
          paymentEvent: 'enrollment',
        });
        // Monthly payout credits belong to the referrer too — move them as a unit.
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     planId,
          paymentEvent: 'monthly',
        });
        if (effectiveReferrer) {
          await BuildersIncentivesService.distributeOneTime(client, {
            plan:          { id: planId, referrer_id: effectiveReferrer, package_number: old.package_number },
            creditedBy:    correctedBy,
            customerName:  old.customer_name,
            effectiveDate,
          });
          // Re-credit each recorded payout to the new referrer on its original date
          const payouts = await client.query(
            `SELECT month_number, payout_date FROM builders_payouts WHERE plan_id = $1 ORDER BY month_number`,
            [planId]
          );
          for (const payout of payouts.rows) {
            await BuildersIncentivesService.creditMonthly(client, {
              plan:          { id: planId, referrer_id: effectiveReferrer, package_number: old.package_number },
              monthNumber:   payout.month_number,
              creditedBy:    correctedBy,
              effectiveDate: payout.payout_date,
            });
          }
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'plan',
        entityId:   planId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── CORRECT PAYOUT (admin: MD / Management) ────────────────────────────────
  // Patches an existing payout row. When amount or payoutDate changes the
  // monthly SO incentive is reversed and re-credited with the corrected values.
  async correctPayout(
    db: Pool,
    correctedBy: string,
    planId: string,
    payoutId: string,
    branchId: string,
    payload: CorrectBuildersPayoutInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const planRow = await client.query(
        'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2',
        [planId, branchId]
      );
      if (planRow.rows.length === 0) throw new NotFoundError('Plan not found');
      const plan = planRow.rows[0];

      const payRow = await client.query(
        'SELECT * FROM builders_payouts WHERE id = $1 AND plan_id = $2',
        [payoutId, planId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payout not found');
      const old = payRow.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.amount      != null) { fields.push(`amount = $${idx++}`);        vals.push(payload.amount); }
      if (payload.payoutDate  != null) { fields.push(`payout_date = $${idx++}`);   vals.push(payload.payoutDate); }
      if (payload.paymentMode != null) { fields.push(`payment_mode = $${idx++}`);  vals.push(payload.paymentMode); }
      if (payload.proofKey    != null) { fields.push(`proof_key = $${idx++}`);     vals.push(payload.proofKey); }
      if (payload.transactionId !== undefined) { fields.push(`transaction_id = $${idx++}`); vals.push(payload.transactionId); }
      if (payload.notes !== undefined) { fields.push(`notes = $${idx++}`);         vals.push(payload.notes); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(payoutId, planId);
      const updated = await client.query(
        `UPDATE builders_payouts SET ${fields.join(', ')} WHERE id = $${idx} AND plan_id = $${idx + 1} RETURNING *`,
        vals
      );

      const amountChanged = payload.amount != null && parseFloat(payload.amount.toString()) !== parseFloat(old.amount);
      const dateChanged   = payload.payoutDate != null && payload.payoutDate !== old.payout_date;
      const effectiveDate = payload.payoutDate ?? old.payout_date;

      if ((amountChanged || dateChanged) && plan.referrer_id) {
        // Reverse the monthly credit for this specific month, then re-issue
        await client.query(
          `DELETE FROM employee_incentives
           WHERE source_type = 'scheme' AND scheme_code = $1
             AND source_id = $2 AND payment_event = 'monthly'`,
          [SCHEME_CODE, planId]
        );
        await BuildersIncentivesService.creditMonthly(client, {
          plan:          { id: planId, referrer_id: plan.referrer_id, package_number: plan.package_number },
          monthNumber:   parseInt(old.month_number, 10),
          creditedBy:    correctedBy,
          effectiveDate,
        });
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payout',
        entityId:   payoutId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID PLAN (admin: MD / Management) ──────────────────────────────────────
  // Soft-voids a builders plan: marks status='voided', claws back ALL incentives
  // (enrollment + all monthly credits), and writes an audit row.
  async voidPlan(
    db: Pool,
    actorId: string,
    planId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2',
        [planId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Plan not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Plan is already voided');

      await client.query(
        `UPDATE builders_plans SET status = 'voided' WHERE id = $1`,
        [planId]
      );

      // Reverse all incentives (enrollment one-time + all monthly SO credits)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   planId,
      });

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'plan',
        entityId:   planId,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── DELETE PLAN (admin: MD / Management) ────────────────────────────────────
  // Permanently deletes a plan and all of its payouts (no FK cascade, so payouts
  // go first), claws back ALL incentives, and snapshots the before-state into
  // the audit log.
  async deletePlan(
    db: Pool,
    actorId: string,
    planId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2 FOR UPDATE',
        [planId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Plan not found');
      const old = before.rows[0];

      const payouts = await client.query(
        `SELECT * FROM builders_payouts WHERE plan_id = $1 ORDER BY month_number`,
        [planId]
      );

      // Reverse all incentives (enrollment one-time + all monthly SO credits)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   planId,
      });

      await client.query(`DELETE FROM builders_payouts WHERE plan_id = $1`, [planId]);
      await client.query(`DELETE FROM builders_plans WHERE id = $1`, [planId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'plan',
        entityId:   planId,
        actorId,
        action:     'delete',
        oldValues:  { plan: old, payouts: payouts.rows },
      });

      return { deleted: true, id: planId, payouts: payouts.rows.length };
    });
  },

  // ─── UNPAY PAYOUT (admin: MD / Management) ───────────────────────────────────
  // Deletes a single recorded payout and claws back its monthly incentive credit.
  async unpayPayout(
    db: Pool,
    actorId: string,
    planId: string,
    payoutId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const planRow = await client.query(
        'SELECT * FROM builders_plans WHERE id = $1 AND branch_id = $2',
        [planId, branchId]
      );
      if (planRow.rows.length === 0) throw new NotFoundError('Plan not found');
      const plan = planRow.rows[0];

      const payRow = await client.query(
        'SELECT * FROM builders_payouts WHERE id = $1 AND plan_id = $2',
        [payoutId, planId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payout not found');
      const old = payRow.rows[0];

      await client.query('DELETE FROM builders_payouts WHERE id = $1', [payoutId]);

      // Decrement the plan's current_month so next recording is possible again
      await client.query(
        'UPDATE builders_plans SET current_month = GREATEST(0, current_month - 1) WHERE id = $1',
        [planId]
      );

      // Reverse this payout's monthly incentive (all monthly credits for this plan),
      // then re-credit remaining payouts exactly like correctPayout does.
      if (plan.referrer_id) {
        await client.query(
          `DELETE FROM employee_incentives
           WHERE source_type = 'scheme' AND scheme_code = $1
             AND source_id = $2 AND payment_event = 'monthly'`,
          [SCHEME_CODE, planId]
        );
        const remaining = await client.query(
          'SELECT * FROM builders_payouts WHERE plan_id = $1 ORDER BY month_number',
          [planId]
        );
        for (const pay of remaining.rows) {
          await BuildersIncentivesService.creditMonthly(client, {
            plan:        { id: planId, referrer_id: plan.referrer_id, package_number: plan.package_number },
            monthNumber: parseInt(pay.month_number, 10),
            creditedBy:  actorId,
            effectiveDate: pay.payout_date,
          });
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payout',
        entityId:   payoutId,
        actorId,
        action:     'unpay',
        oldValues:  old,
      });

      return old;
    });
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
    // Filter by business date (lump_sum_date) so backdated plans count in their real period
    if (dateFilter?.startDate) { where += ` AND p.lump_sum_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND p.lump_sum_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         p.id, p.package_number, p.investment_amount, p.monthly_payout,
         p.status, p.current_month, p.reward_choice, p.lump_sum_date, p.created_at,
         p.referrer_id, p.referrer_name,
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
