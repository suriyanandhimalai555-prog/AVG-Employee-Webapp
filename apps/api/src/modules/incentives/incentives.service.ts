import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError } from '../../shared/errors';
import { getSubtreeIds } from '../../shared/hierarchy';
import type { AddIncentiveInput, GetIncentivesQuery, SetCommissionRuleInput } from './incentives.schema';

// Roles that can earn incentives. MD and Director never earn.
const EARNER_ROLES = new Set(['sales_officer', 'abm', 'branch_manager', 'gm', 'branch_admin']);

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

  // Upsert a commission rule for a project+role
  async setCommissionRule(
    db: Pool,
    payload: SetCommissionRuleInput
  ): Promise<any> {
    const result = await db.query(
      `INSERT INTO scheme_commission_rules (project_id, role, amount)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, role)
       DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()
       RETURNING *`,
      [payload.projectId, payload.role, payload.amount]
    );
    return result.rows[0];
  },

  // ─── AUTO-DISTRIBUTE INCENTIVES ───
  //
  // Logic:
  //   - Start from the referrer (dealMakerUserId) at their role level.
  //   - Credit them their role's amount (e.g. ABM → Rs.750).
  //   - Walk UP the manager_id chain, crediting each manager their role's amount.
  //   - Stop at GM (ceiling). Director and MD never earn.
  //   - Roles BELOW the referrer in the hierarchy are SKIPPED automatically
  //     because we only walk upward.
  //   - Branch Admin of the referrer's branch is ALWAYS credited Rs.250
  //     regardless of position (separate from the chain).
  //
  // Example — ABM refers:
  //   ABM (Rs.750) → BM (Rs.500) → GM (Rs.250) + Branch Admin (Rs.250)
  //   SO is skipped because they are below ABM.
  //
  // Returns the inserted incentive rows.
  async distributeIncentives(
    db: Pool | PoolClient,
    dealMakerUserId: string,
    projectId: string,
    sourceDescription: string,
    creditedBy: string,      // who triggered the distribution (entered_by / branch_admin)
    sourceId?: string
  ): Promise<any[]> {
    // Load commission rules for this project
    const rulesResult = await db.query(
      `SELECT role, amount FROM scheme_commission_rules WHERE project_id = $1`,
      [projectId]
    );
    const rules: Record<string, number> = {};
    for (const row of rulesResult.rows) {
      rules[row.role] = parseFloat(row.amount);
    }

    if (Object.keys(rules).length === 0) {
      // No rates configured — nothing to distribute
      return [];
    }

    // Load the referrer's profile
    const dealMakerResult = await db.query(
      `SELECT id, role, branch_id, manager_id, name FROM users WHERE id = $1`,
      [dealMakerUserId]
    );
    if (dealMakerResult.rows.length === 0) return [];

    const dealMaker = dealMakerResult.rows[0];
    const branchId  = dealMaker.branch_id;

    // Walk up the hierarchy from the referrer to GM (inclusive).
    // Only EARNER_ROLES are credited; Director and MD are skipped and stop the walk.
    const chain: Array<{ id: string; role: string; name: string }> = [];
    let current = dealMaker;

    while (current && EARNER_ROLES.has(current.role)) {
      chain.push({ id: current.id, role: current.role, name: current.name });
      if (current.role === 'gm') break; // GM is the ceiling — stop here

      if (!current.manager_id) break;
      const managerResult = await db.query(
        `SELECT id, role, branch_id, manager_id, name FROM users WHERE id = $1`,
        [current.manager_id]
      );
      current = managerResult.rows[0] ?? null;
    }

    // Branch Admin of the referrer's branch — always credited, separate from the chain
    let branchAdmin: { id: string; role: string; name: string } | null = null;
    if (branchId) {
      const adminResult = await db.query(
        `SELECT id, role, name FROM users
         WHERE branch_id = $1 AND role = 'branch_admin' AND is_active = true LIMIT 1`,
        [branchId]
      );
      if (adminResult.rows.length > 0) {
        const admin = adminResult.rows[0];
        // Avoid double-crediting if branch_admin is already in the chain
        if (!chain.find(u => u.id === admin.id)) {
          branchAdmin = admin;
        }
      }
    }

    const allRecipients = branchAdmin ? [...chain, branchAdmin] : chain;
    const created: any[] = [];

    for (const person of allRecipients) {
      const amount = rules[person.role];
      if (!amount || amount <= 0) continue;

      const insertResult = await db.query(
        `INSERT INTO employee_incentives
           (user_id, amount, source_type, source_id, source_description, credited_by)
         VALUES ($1, $2, 'scheme', $3, $4, $5)
         RETURNING *`,
        [person.id, amount, sourceId ?? null, sourceDescription, creditedBy]
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
    targetUserId?: string
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

    const balanceResult = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_balance FROM employee_incentives WHERE user_id = $1`,
      [userId]
    );

    const breakdownResult = await db.query(
      `SELECT source_type, COALESCE(SUM(amount), 0) AS subtotal, COUNT(*) AS count
       FROM employee_incentives WHERE user_id = $1 GROUP BY source_type`,
      [userId]
    );

    const recentResult = await db.query(
      `SELECT i.*, u.name AS credited_by_name
       FROM employee_incentives i
       JOIN users u ON i.credited_by = u.id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC LIMIT 10`,
      [userId]
    );

    return {
      userId,
      totalBalance: parseFloat(balanceResult.rows[0].total_balance),
      breakdown: breakdownResult.rows.map(r => ({
        sourceType: r.source_type,
        subtotal:   parseFloat(r.subtotal),
        count:      parseInt(r.count, 10),
      })),
      recent: recentResult.rows,
    };
  },
};
