import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { getSubtreeIds } from '../../shared/hierarchy';
import type { AddIncentiveInput, GetIncentivesQuery, GetWalletQuery, SetCommissionRuleInput } from './incentives.schema';

// Roles that can earn incentives. MD and Director never earn.
const EARNER_ROLES = new Set(['sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin']);

// Selling chain in order from lowest to highest role (branch_admin is lateral — excluded).
// Used by fixed_chain to accumulate incentives when a higher role directly enrolls:
// if a BM enrolls, they absorb SO + ABM + BM amounts (₹1,500 + ₹750 + ₹500 = ₹2,750).
const CHAIN_ORDER = ['sales_officer', 'abm', 'branch_manager', 'gm'] as const;
type ChainRole = typeof CHAIN_ORDER[number];

// One shape for every scheme's payout. Each scheme picks a mode:
//   fixed_chain      → walk dealMaker → GM, credit each level the role's fixed ₹
//                      plus branch admin (current Trading Academy behaviour)
//   percent_referrer → credit dealMaker only, amount = baseAmount * rate%
//                      (current Gold behaviour; rate row keyed by percentRole)
export type DistributeMode = 'fixed_chain' | 'percent_referrer';

export interface DistributeArgs {
  schemeCode:        string;                      // projects.code
  dealMakerUserId:   string;
  mode:              DistributeMode;
  sourceDescription: string;
  creditedBy:        string;
  sourceId?:         string;
  paymentEvent?:     'enrollment' | 'renewal';
  // percent_referrer only
  baseAmount?:       number;
  percentRole?:      string;                      // e.g. 'referrer_new' | 'referrer_renewal'
}

export const IncentiveService = {

  // ─── COMMISSION RULES ───

  // Get all commission rules for a project
  async getCommissionRules(db: Pool, projectId: string): Promise<any[]> {
    const result = await db.query(
      `SELECT scr.*, p.name AS project_name
       FROM scheme_commission_rules scr
       JOIN projects p ON scr.project_id = p.id
       WHERE scr.project_id = $1
       ORDER BY CASE scr.role
         WHEN 'sales_officer' THEN 1
         WHEN 'abm'           THEN 2
         WHEN 'branch_manager'THEN 3
         WHEN 'gm'            THEN 4
         WHEN 'branch_admin'  THEN 5
       END`,
      [projectId]
    );
    return result.rows;
  },

  // Get all commission rules for all projects (for the schemes page overview)
  async getAllCommissionRules(db: Pool): Promise<any[]> {
    const result = await db.query(
      `SELECT scr.*, p.name AS project_name
       FROM scheme_commission_rules scr
       JOIN projects p ON scr.project_id = p.id
       ORDER BY p.name, CASE scr.role
         WHEN 'sales_officer' THEN 1
         WHEN 'abm'           THEN 2
         WHEN 'branch_manager'THEN 3
         WHEN 'gm'            THEN 4
         WHEN 'branch_admin'  THEN 5
       END`
    );
    return result.rows;
  },

  // Load commission rules for a project as a role → rate map.
  // Used by distributeIncentives (Trading Academy) and GoldService so both schemes
  // read from the same DB rows — single source of truth for all commission rates.
  async loadProjectRates(
    db: Pool | PoolClient,
    projectId: string
  ): Promise<Record<string, { amount: number; rateType: 'fixed' | 'percent' }>> {
    const res = await db.query(
      `SELECT role, amount, rate_type FROM scheme_commission_rules WHERE project_id = $1`,
      [projectId]
    );
    const map: Record<string, { amount: number; rateType: 'fixed' | 'percent' }> = {};
    for (const row of res.rows) {
      map[row.role] = { amount: parseFloat(row.amount), rateType: row.rate_type };
    }
    return map;
  },

  // Upsert a commission rule for a project+role
  async setCommissionRule(
    db: Pool,
    payload: SetCommissionRuleInput
  ): Promise<any> {
    // rate_type defaults to 'fixed' when not supplied (Trading Academy rules).
    // Gold rules supply 'percent' explicitly and must have it preserved on update.
    const rateType: string = (payload as any).rateType ?? 'fixed';
    const result = await db.query(
      `INSERT INTO scheme_commission_rules (project_id, role, amount, rate_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, role)
       DO UPDATE SET amount = EXCLUDED.amount, rate_type = EXCLUDED.rate_type, updated_at = now()
       RETURNING *`,
      [payload.projectId, payload.role, payload.amount, rateType]
    );
    return result.rows[0];
  },

  // Resolve a scheme code (e.g. 'gold_scheme') to its projects.id.
  async resolveProjectIdByCode(
    db: Pool | PoolClient,
    schemeCode: string
  ): Promise<string | null> {
    const res = await db.query(
      `SELECT id FROM projects WHERE code = $1 LIMIT 1`,
      [schemeCode]
    );
    return res.rows[0]?.id ?? null;
  },

  // ─── AUTO-DISTRIBUTE INCENTIVES ───
  //
  // One entry point for every scheme. The scheme picks a mode:
  //
  //   mode='fixed_chain'      — walks dealMaker → GM crediting each role's fixed ₹,
  //                             plus the referrer's branch admin (Trading Academy).
  //                             Stops at GM; Director and MD never earn.
  //   mode='percent_referrer' — credits dealMaker only, amount = baseAmount *
  //                             ratesMap[percentRole].amount / 100  (Gold).
  //
  // Every row written carries scheme_code + payment_event so scheme-scoped
  // summary queries can filter cleanly instead of LIKE-matching descriptions.
  async distributeIncentives(
    db: Pool | PoolClient,
    args: DistributeArgs
  ): Promise<any[]> {
    const projectId = await IncentiveService.resolveProjectIdByCode(db, args.schemeCode);
    if (!projectId) return [];

    const ratesMap = await IncentiveService.loadProjectRates(db, projectId);
    if (Object.keys(ratesMap).length === 0) return [];

    const recipients: Array<{ userId: string; amount: number }> = [];

    if (args.mode === 'percent_referrer') {
      if (!args.percentRole || args.baseAmount == null || args.baseAmount <= 0) {
        return [];
      }
      const rate = ratesMap[args.percentRole];
      if (!rate || rate.rateType !== 'percent' || rate.amount <= 0) return [];
      const amount = args.baseAmount * (rate.amount / 100);
      if (amount > 0) {
        recipients.push({ userId: args.dealMakerUserId, amount });
      }
    } else {
      // fixed_chain
      const dealMakerResult = await db.query(
        `SELECT id, role, branch_id, manager_id FROM users WHERE id = $1`,
        [args.dealMakerUserId]
      );
      if (dealMakerResult.rows.length === 0) return [];

      const dealMaker = dealMakerResult.rows[0];
      const branchId  = dealMaker.branch_id;

      const chain: Array<{ id: string; role: string }> = [];
      let current = dealMaker;

      while (current && EARNER_ROLES.has(current.role)) {
        chain.push({ id: current.id, role: current.role });
        if (current.role === 'gm') break;
        if (!current.manager_id) break;
        const managerResult = await db.query(
          `SELECT id, role, branch_id, manager_id FROM users WHERE id = $1`,
          [current.manager_id]
        );
        current = managerResult.rows[0] ?? null;
      }

      if (branchId) {
        const adminResult = await db.query(
          `SELECT id FROM users
           WHERE branch_id = $1 AND role = 'branch_admin' AND is_active = true LIMIT 1`,
          [branchId]
        );
        const admin = adminResult.rows[0];
        if (admin && !chain.find(u => u.id === admin.id)) {
          chain.push({ id: admin.id, role: 'branch_admin' });
        }
      }

      // Accumulation: if the dealMaker is a higher-level role (ABM, BM, GM), they absorb
      // the incentives of all roles below them in the selling chain that nobody else filled.
      // e.g. BM enrolling directly → BM earns ₹1,500 (SO) + ₹750 (ABM) + ₹500 (BM) = ₹2,750.
      // Managers above the dealMaker and branch_admin still earn their normal fixed amounts.
      const dealMakerChainPos = (CHAIN_ORDER as readonly string[]).indexOf(dealMaker.role);
      let dealMakerAccumulated = 0;
      if (dealMakerChainPos >= 0) {
        for (let i = 0; i <= dealMakerChainPos; i++) {
          const r = ratesMap[CHAIN_ORDER[i] as ChainRole];
          if (r && r.rateType === 'fixed' && r.amount > 0) {
            dealMakerAccumulated += r.amount;
          }
        }
      }

      for (const person of chain) {
        // Branch admin is lateral — always gets their own fixed rate
        if (person.role === 'branch_admin') {
          const rate = ratesMap['branch_admin'];
          if (rate && rate.amount > 0 && (!rate.rateType || rate.rateType === 'fixed')) {
            recipients.push({ userId: person.id, amount: rate.amount });
          }
          continue;
        }

        if (person.id === dealMaker.id) {
          // dealMaker absorbs all incentives from the bottom of the chain up to their role
          if (dealMakerAccumulated > 0) {
            recipients.push({ userId: person.id, amount: dealMakerAccumulated });
          }
        } else {
          // Managers above the dealMaker keep their individual fixed rate unchanged
          const rate = ratesMap[person.role];
          if (!rate || rate.amount <= 0) continue;
          if (rate.rateType && rate.rateType !== 'fixed') continue;
          recipients.push({ userId: person.id, amount: rate.amount });
        }
      }
    }

    const created: any[] = [];
    for (const r of recipients) {
      const insertResult = await db.query(
        `INSERT INTO employee_incentives
           (user_id, amount, source_type, scheme_code, payment_event,
            source_id, source_description, credited_by)
         VALUES ($1, $2, 'scheme', $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          r.userId,
          r.amount,
          args.schemeCode,
          args.paymentEvent ?? null,
          args.sourceId ?? null,
          args.sourceDescription,
          args.creditedBy,
        ]
      );
      created.push(insertResult.rows[0]);
    }

    return created;
  },

  // ─── CREDIT INCENTIVE (manual) ───
  async addIncentive(
    db: Pool,
    creditedBy: string,
    payload: AddIncentiveInput
  ): Promise<any> {
    const userCheck = await db.query(
      'SELECT id FROM users WHERE id = $1 AND is_active = true',
      [payload.userId]
    );
    if (userCheck.rows.length === 0) throw new NotFoundError('Employee not found');

    const result = await db.query(
      `INSERT INTO employee_incentives
         (user_id, amount, source_type, source_id, source_description, credited_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        payload.userId,
        payload.amount,
        payload.sourceType,
        payload.sourceId          || null,
        payload.sourceDescription || null,
        creditedBy,
        payload.notes             || null,
      ]
    );
    return result.rows[0];
  },

  // ─── LIST INCENTIVES (own or subtree) ───
  async getIncentives(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    query: GetIncentivesQuery
  ): Promise<{ data: any[]; total: number }> {
    let targetUserId: string;

    if (query.userId && query.userId !== requesterId) {
      if (requesterRole === 'sales_officer' || requesterRole === 'client') {
        throw new ForbiddenError('Access denied');
      }
      const subtree = await getSubtreeIds(requesterId);
      if (!subtree.includes(query.userId)) {
        throw new ForbiddenError('That employee is not in your team');
      }
      targetUserId = query.userId;
    } else {
      targetUserId = requesterId;
    }

    const params: any[] = [targetUserId];
    let where = 'i.user_id = $1';
    let idx = 2;

    if (query.sourceType) {
      where += ` AND i.source_type = $${idx++}`;
      params.push(query.sourceType);
    }

    if (query.startDate) {
      where += ` AND i.created_at >= $${idx++}::date`;
      params.push(query.startDate);
    }
    if (query.endDate) {
      where += ` AND i.created_at < ($${idx++}::date + INTERVAL '1 day')`;
      params.push(query.endDate);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM employee_incentives i WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT i.*, u.name AS credited_by_name, u.role AS credited_by_role
       FROM employee_incentives i
       JOIN users u ON i.credited_by = u.id
       WHERE ${where}
       ORDER BY i.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── WALLET SUMMARY ───
  async getWallet(
    db: Pool,
    requesterId: string,
    requesterRole: string,
    targetUserId?: string,
    dateFilter?: GetWalletQuery
  ): Promise<any> {
    let userId: string;

    if (targetUserId && targetUserId !== requesterId) {
      if (requesterRole === 'sales_officer' || requesterRole === 'client') {
        throw new ForbiddenError('Access denied');
      }
      const subtree = await getSubtreeIds(requesterId);
      if (!subtree.includes(targetUserId)) {
        throw new ForbiddenError('That employee is not in your team');
      }
      userId = targetUserId;
    } else {
      userId = requesterId;
    }

    // Build date filter clause
    const params: any[] = [userId];
    let dateWhere = '';
    let idx = 2;
    if (dateFilter?.startDate) {
      dateWhere += ` AND created_at >= $${idx++}::date`;
      params.push(dateFilter.startDate);
    }
    if (dateFilter?.endDate) {
      dateWhere += ` AND created_at < ($${idx++}::date + INTERVAL '1 day')`;
      params.push(dateFilter.endDate);
    }

    const balanceResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_balance FROM employee_incentives WHERE user_id = $1${dateWhere}`,
      params
    );

    // Break down by source_type AND scheme_code so the UI can show each scheme
    // as its own card (Gold separate from Trading Academy) instead of collapsing
    // every scheme into one "Schemes" bucket.
    const breakdownResult = await db.query(
      `SELECT source_type, scheme_code, COALESCE(SUM(amount), 0) AS subtotal, COUNT(*) AS count
       FROM employee_incentives
       WHERE user_id = $1${dateWhere}
       GROUP BY source_type, scheme_code`,
      params
    );

    const recentResult = await db.query(
      `SELECT i.*, u.name AS credited_by_name
       FROM employee_incentives i
       JOIN users u ON i.credited_by = u.id
       WHERE i.user_id = $1${dateWhere.replace(/created_at/g, 'i.created_at')}
       ORDER BY i.created_at DESC LIMIT 10`,
      params
    );

    return {
      userId,
      totalBalance: parseFloat(balanceResult.rows[0].total_balance),
      breakdown: breakdownResult.rows.map(r => ({
        sourceType: r.source_type,
        schemeCode: r.scheme_code,
        subtotal:   parseFloat(r.subtotal),
        count:      parseInt(r.count, 10),
      })),
      recent: recentResult.rows,
    };
  },
};
