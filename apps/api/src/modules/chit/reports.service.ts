// Agila Chit — reporting for the scheme registry (SchemeService contract): branch summary,
// per-branch overview, paged per-branch entries and cash collected for reconciliation.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
// TS: named import — shared ILIKE-pattern builder that escapes % and _ in user-typed search text
import { toContainsPattern } from '../../shared/search';
// TS: named import — converts ?page/&limit into SQL LIMIT/OFFSET with safe clamping
import { toLimitOffset } from '../../shared/pagination';
// TS: type-only import — the shared entries filter (dates + search + page window)
import type { SchemeEntriesFilter } from '../schemes/scheme.contract';
import { SCHEME_CODE } from './chit.shared';

export const ChitReportsService = {
  // ─── BRANCH SUMMARY ────────────────────────────────────────────────────────
  async getBranchSummary(
    db: Pool,
    branchId: string,
    scopedToUserId?: string,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any> {
    // Referrer-scoped roles (chit lives on the member, not the group): count the
    // groups they participate in and ONLY their own referred members, across ALL
    // branches. Everyone else stays branch-scoped.
    // ── Groups: a group counts if the referrer has a card in it ──
    const gParams: any[] = [];
    let gWhere: string;
    if (scopedToUserId) {
      gParams.push(scopedToUserId);
      gWhere = 'EXISTS (SELECT 1 FROM agila_chit_members mm WHERE mm.group_id = g.id AND mm.referrer_id = $1)';
    } else {
      gParams.push(branchId);
      gWhere = 'g.branch_id = $1';
    }
    let gIdx = 2;
    // Filter by business date (start_date) so backdated groups count in their real period
    if (dateFilter?.startDate) { gWhere += ` AND g.start_date >= $${gIdx++}::date`; gParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { gWhere += ` AND g.start_date < ($${gIdx++}::date + INTERVAL '1 day')`; gParams.push(dateFilter.endDate); }

    const groupsResult = await db.query(
      `SELECT
         COUNT(*)::int                                                AS total_groups,
         COUNT(*) FILTER (WHERE g.status = 'forming')::int           AS forming_groups,
         COUNT(*) FILTER (WHERE g.status = 'active')::int            AS active_groups,
         COUNT(*) FILTER (WHERE g.status = 'completed')::int         AS completed_groups,
         COUNT(*) FILTER (WHERE g.status = 'pending_combine')::int   AS pending_groups
       FROM agila_chit_groups g WHERE ${gWhere}`,
      gParams
    );

    // ── Members: only the referrer's own cards when scoped ──
    const mParams: any[] = [];
    let mWhere: string;
    if (scopedToUserId) { mParams.push(scopedToUserId); mWhere = 'm.referrer_id = $1'; }
    else                { mParams.push(branchId);       mWhere = 'g.branch_id = $1'; }
    let mIdx = 2;
    if (dateFilter?.startDate) { mWhere += ` AND g.start_date >= $${mIdx++}::date`; mParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { mWhere += ` AND g.start_date < ($${mIdx++}::date + INTERVAL '1 day')`; mParams.push(dateFilter.endDate); }

    const membersResult = await db.query(
      `SELECT
         COUNT(m.id)::int                                           AS total_members,
         COUNT(m.id) FILTER (WHERE m.status = 'active')::int       AS active_members,
         COUNT(m.id) FILTER (WHERE m.status = 'cancelled')::int    AS cancelled_members,
         COUNT(m.id) FILTER (WHERE m.has_won = true)::int          AS total_winners,
         COALESCE(SUM(p.amount), 0)                                AS total_collected
       FROM agila_chit_groups g
       LEFT JOIN agila_chit_members  m ON m.group_id  = g.id
       LEFT JOIN agila_chit_payments p ON p.member_id = m.id
       WHERE ${mWhere}`,
      mParams
    );

    // Referrer-scoped: sum incentives credited to that user across ALL branches.
    const commParams: any[] = [];
    let commWhere: string;
    if (scopedToUserId) { commParams.push(scopedToUserId, SCHEME_CODE); commWhere = 'ei.user_id = $1 AND ei.scheme_code = $2'; }
    else                { commParams.push(branchId, SCHEME_CODE);       commWhere = 'acg.branch_id = $1 AND ei.scheme_code = $2'; }
    let commIdx = 3;
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commResult = await db.query(
      `SELECT COALESCE(SUM(ei.amount), 0) AS total_commission
       FROM employee_incentives ei
       JOIN agila_chit_members acm ON acm.id = ei.source_id
       JOIN agila_chit_groups  acg ON acg.id = acm.group_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}`,
      commParams
    );

    const g = groupsResult.rows[0];
    const m = membersResult.rows[0];
    return {
      totalGroups:      g.total_groups,
      formingGroups:    g.forming_groups,
      activeGroups:     g.active_groups,
      completedGroups:  g.completed_groups,
      pendingGroups:    g.pending_groups,
      totalMembers:     m.total_members,
      activeMembers:    m.active_members,
      cancelledMembers: m.cancelled_members,
      totalWinners:     m.total_winners,
      totalCollected:   parseFloat(m.total_collected),
      totalCommission:  parseFloat(commResult.rows[0].total_commission),
    };
  },

  // ─── OVERVIEW BY BRANCH (MD/Director aggregate) ────────────────────────────
  async getOverviewByBranch(
    db: Pool,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number; commission: number }>> {
    const memParams: any[] = [];
    let memWhere = 'b.is_active = true';
    let memIdx = 1;
    // Filter by business date (start_date) so backdated groups count in their real period
    if (dateFilter?.startDate) { memWhere += ` AND g.start_date >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memWhere += ` AND g.start_date < ($${memIdx++}::date + INTERVAL '1 day')`; memParams.push(dateFilter.endDate); }

    const memRes = await db.query<{ branch_id: string; branch_name: string; count: string; collected: string }>(
      `SELECT
         g.branch_id,
         b.name AS branch_name,
         COUNT(DISTINCT g.id)::int  AS count,
         COALESCE(SUM(p.amount), 0) AS collected
       FROM agila_chit_groups g
       JOIN branches b ON b.id = g.branch_id
       LEFT JOIN agila_chit_members  m ON m.group_id  = g.id
       LEFT JOIN agila_chit_payments p ON p.member_id = m.id
       WHERE ${memWhere}
       GROUP BY g.branch_id, b.name
       ORDER BY b.name ASC`,
      memParams
    );

    const commParams: any[] = [SCHEME_CODE];
    let commWhere = 'ei.scheme_code = $1';
    let commIdx = 2;
    if (dateFilter?.startDate) { commWhere += ` AND ei.created_at >= $${commIdx++}::date`; commParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { commWhere += ` AND ei.created_at < ($${commIdx++}::date + INTERVAL '1 day')`; commParams.push(dateFilter.endDate); }

    const commRes = await db.query<{ branch_id: string; commission: string }>(
      `SELECT acg.branch_id, COALESCE(SUM(ei.amount), 0) AS commission
       FROM employee_incentives ei
       JOIN agila_chit_members acm ON acm.id = ei.source_id
       JOIN agila_chit_groups  acg ON acg.id = acm.group_id
       WHERE ei.source_type = 'scheme' AND ${commWhere}
       GROUP BY acg.branch_id`,
      commParams
    );

    const commByBranch = new Map<string, number>();
    for (const row of commRes.rows) commByBranch.set(row.branch_id, parseFloat(row.commission));

    return memRes.rows.map(r => ({
      branchId:   r.branch_id,
      branchName: r.branch_name,
      count:      parseInt(r.count, 10),
      collected:  parseFloat(r.collected),
      commission: commByBranch.get(r.branch_id) ?? 0,
    }));
  },

  // ─── ENTRIES BY BRANCH (MD/Director drill-down) ────────────────────────────
  async getEntriesByBranch(
    db: Pool,
    branchId: string,
    // TS: date range + server-side search + page window (see SchemeEntriesFilter in the contract)
    dateFilter?: SchemeEntriesFilter,
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;
    // Filter by business date (start_date) so backdated groups count in their real period
    if (dateFilter?.startDate) { where += ` AND g.start_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND g.start_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }
    // A group also matches when any of its members' customers match — typing a customer
    // name must surface the group that holds them (members are corrected inside the group).
    // Server-side search — in the WHERE clause, so it covers every page, not just the loaded one
    if (dateFilter?.search?.trim()) {
      where += ` AND (g.group_name ILIKE $${idx} OR EXISTS (
        SELECT 1 FROM agila_chit_members sm
        JOIN customers sc ON sc.id = sm.customer_id
        WHERE sm.group_id = g.id
          AND (sc.name ILIKE $${idx} OR sc.phone ILIKE $${idx} OR sc.customer_code ILIKE $${idx})
      ))`;
      params.push(toContainsPattern(dateFilter.search));
      idx++;
    }

    // One page of rows; id is the ORDER BY tie-breaker so pages never overlap.
    const { limit, offset } = toLimitOffset(dateFilter);

    const res = await db.query(
      `SELECT
         -- Full match count before LIMIT, so the UI can tell when the list is truncated
         COUNT(*) OVER()::int AS total_count,
         g.id, g.group_name, g.package_number, g.full_amount, g.half_amount,
         g.status, g.current_month, g.start_date, g.created_at,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id) AS member_count,
         (SELECT COALESCE(SUM(p.amount),0)
          FROM agila_chit_payments p
          JOIN agila_chit_members m ON m.id = p.member_id
          WHERE m.group_id = g.id) AS total_collected
       FROM agila_chit_groups g
       WHERE ${where}
       ORDER BY g.created_at DESC, g.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );
    return res.rows;
  },

  // Monthly instalment cash received in [startDate,endDate] by payment_date.
  // Differs from getOverviewByBranch which incorrectly keys on group start_date.
  // Used by daily reconciliation only.
  async getCollectedByBranch(
    db: Pool | PoolClient,
    dateFilter: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; collected: number }>> {
    const params: any[] = [];
    let where = '1=1';
    let idx = 1;
    // TS: date filter uses payment_date — the actual date cash arrived, not group start
    if (dateFilter.startDate) { where += ` AND pay.payment_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter.endDate)   { where += ` AND pay.payment_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query<{ branch_id: string; collected: string }>(
      `SELECT g.branch_id, COALESCE(SUM(pay.amount), 0) AS collected
       FROM agila_chit_payments pay
       JOIN agila_chit_members  m ON m.id = pay.member_id
       JOIN agila_chit_groups   g ON g.id = m.group_id
       WHERE ${where}
       GROUP BY g.branch_id`,
      params
    );
    // TS: NUMERIC comes back as string from pg; parse to number for the contract type
    return res.rows.map(r => ({ branchId: r.branch_id, collected: parseFloat(r.collected) }));
  },
};
