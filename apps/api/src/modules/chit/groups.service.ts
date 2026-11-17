// Agila Chit — groups: create a group, list groups (paged, searchable), group detail with members.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import type { CreateChitGroupInput, GetChitGroupsQuery } from './chit.schema';
import { CHIT_PACKAGES } from './chit.schema';
import { FILL_WINDOW_DAYS, isStaleForming, promoteStaleFormingGroups } from './chit.shared';

export const ChitGroupsService = {
  // ─── CREATE GROUP ──────────────────────────────────────────────────────────
  async createGroup(
    db: Pool,
    createdBy: string,
    branchId: string,
    payload: CreateChitGroupInput
  ): Promise<any> {
    const pkg = CHIT_PACKAGES[payload.packageNumber];
    if (!pkg) throw new ValidationError('Invalid package number');

    // Prevent duplicate group names within the same branch (case-insensitive, forever)
    // Combined groups (is_combined = true) are system-generated and excluded from this check
    const dup = await db.query(
      `SELECT 1 FROM agila_chit_groups
       WHERE branch_id = $1 AND LOWER(group_name) = LOWER($2) AND is_combined = false
       LIMIT 1`,
      [branchId, payload.groupName.trim()]
    );
    if (dup.rows.length > 0) {
      throw new ConflictError(
        `A chit group named "${payload.groupName.trim()}" already exists in this branch`
      );
    }

    try {
      const result = await db.query(
        `INSERT INTO agila_chit_groups
           (branch_id, group_name, package_number, full_amount, half_amount,
            start_date, current_month, status, fill_deadline, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,2,'forming', NOW() + ($9 * INTERVAL '1 day'),$7,$8)
         RETURNING *`,
        [
          branchId,
          payload.groupName.trim(),
          payload.packageNumber,
          pkg.fullAmount,
          pkg.halfAmount,
          payload.startDate,
          payload.notes || null,
          createdBy,
          FILL_WINDOW_DAYS,
        ]
      );
      return result.rows[0];
    } catch (err: any) {
      // TS: re-throw Postgres unique-violation (23505) as a user-friendly 409;
      // this catches the race where two requests slip past the pre-check concurrently
      if (err.code === '23505') {
        throw new ConflictError(
          `A chit group named "${payload.groupName.trim()}" already exists in this branch`
        );
      }
      throw err;
    }
  },

  // ─── LIST GROUPS ───────────────────────────────────────────────────────────
  async getGroups(
    db: Pool,
    branchId: string,
    query: GetChitGroupsQuery,
    referrerId?: string,   // set for referrer-only roles → only groups they have a card in
  ): Promise<{ data: any[]; total: number }> {
    // Lazy promotion: any forming group whose deadline passed becomes pending_combine
    await promoteStaleFormingGroups(db);

    // Referrer-scoped roles see only groups where they referred ≥1 member, across
    // ALL branches; everyone else stays branch-scoped.
    // The OR EXISTS path surfaces combined groups whose branch_id is the head branch
    // but which contain members enrolled by the caller's branch (original branch).
    const params: any[] = [];
    let where: string;
    if (referrerId) {
      params.push(referrerId);
      where = 'EXISTS (SELECT 1 FROM agila_chit_members mm WHERE mm.group_id = g.id AND mm.referrer_id = $1)';
    } else {
      params.push(branchId);
      // TS: OR EXISTS makes combined groups visible to the original branch admin
      where = '(g.branch_id = $1 OR EXISTS (SELECT 1 FROM agila_chit_members mm WHERE mm.group_id = g.id AND mm.branch_id = $1))';
    }
    let idx = 2;

    if (query.status === 'in_progress') {
      // Virtual filter: everything that is not done / terminal
      where += ` AND g.status NOT IN ('completed','combined_into','expired')`;
    } else if (query.status) {
      where += ` AND g.status = $${idx++}`;
      params.push(query.status);
    }

    // Track the search param index so the matched_members aggregate can reuse the same
    // $n placeholder without pushing a duplicate param.
    let searchParamIdx: number | null = null;
    if (query.search) {
      searchParamIdx = idx;
      // Match the group by name OR by any of its members' customer name/phone/code so that
      // typing a customer name surfaces the group card (consistent with Gold Coin / LSS).
      where += ` AND (
        g.group_name ILIKE $${idx}
        OR EXISTS (
          SELECT 1 FROM agila_chit_members m
          JOIN customers c ON c.id = m.customer_id
          WHERE m.group_id = g.id
            AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})
        )
      )`;
      params.push(`%${query.search}%`);
      idx++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM agila_chit_groups g WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    // When a search is active, include matched_members so the card can show which customers
    // hit. agila_chit_members has no slot/position column, so we emit name + phone only
    // (consistent with the SchemeMatchLine contract used on Gold Coin / LSS cards).
    const matchedMembersSelect = searchParamIdx !== null ? `,
         (SELECT json_agg(json_build_object('customer_name', c.name, 'customer_phone', c.phone))
            FROM agila_chit_members m
            JOIN customers c ON c.id = m.customer_id
           WHERE m.group_id = g.id
             AND (c.name ILIKE $${searchParamIdx} OR c.phone ILIKE $${searchParamIdx} OR c.customer_code ILIKE $${searchParamIdx}))
           AS matched_members` : '';

    const dataResult = await db.query(
      `SELECT
         g.*,
         u.name AS created_by_name,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id)                       AS member_count,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id AND m.status='active') AS active_member_count,
         (SELECT COUNT(*)::int FROM agila_chit_winners  w WHERE w.group_id = g.id)                      AS winners_selected${matchedMembersSelect}
       FROM agila_chit_groups g
       JOIN users u ON g.created_by = u.id
       WHERE ${where}
       ORDER BY
         CASE g.status
           WHEN 'active'          THEN 0
           WHEN 'forming'         THEN 1
           WHEN 'pending_combine' THEN 2
           WHEN 'completed'       THEN 3
           WHEN 'combined_into'   THEN 4
           WHEN 'expired'         THEN 5
           ELSE 6
         END ASC,
         g.created_at DESC, g.id DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET SINGLE GROUP WITH MEMBERS ────────────────────────────────────────
  async getGroup(db: Pool, groupId: string, branchId: string, referrerId?: string): Promise<any> {
    // Referrer-scoped roles can open a group from any branch, but only if they have
    // a card in it — gate access via EXISTS instead of the branch match.
    // Branch admins can open the group if it belongs to their branch (direct owner)
    // OR if they have enrolled members in it (original branch after combine).
    const groupResult = await db.query(
      referrerId
        ? `SELECT g.*, u.name AS created_by_name, b.is_head_branch AS branch_is_head
           FROM agila_chit_groups g
           JOIN users    u ON g.created_by = u.id
           JOIN branches b ON b.id = g.branch_id
           WHERE g.id = $1
             AND EXISTS (SELECT 1 FROM agila_chit_members mm WHERE mm.group_id = g.id AND mm.referrer_id = $2)`
        : `SELECT g.*, u.name AS created_by_name, b.is_head_branch AS branch_is_head
           FROM agila_chit_groups g
           JOIN users    u ON g.created_by = u.id
           JOIN branches b ON b.id = g.branch_id
           WHERE g.id = $1
             AND (g.branch_id = $2 OR EXISTS (
               SELECT 1 FROM agila_chit_members mm
               WHERE mm.group_id = g.id AND mm.branch_id = $2
             ))`,
      [groupId, referrerId ?? branchId]
    );
    if (groupResult.rows.length === 0) throw new NotFoundError('Group not found');
    const group = groupResult.rows[0];

    // On-read stale check for single group
    if (isStaleForming(group.status, group.fill_deadline)) {
      await db.query(
        `UPDATE agila_chit_groups SET status = 'pending_combine' WHERE id = $1`,
        [groupId]
      );
      group.status = 'pending_combine';
    }

    // Referrer-scoped roles only see the cards (and their winners) they referred.
    // Non-owner branch admins (access via member.branch_id match) see only their own members —
    // preserves the "Branch Admin — their branch only" visibility rule.
    const isGroupOwner = !referrerId && group.branch_id === branchId;
    let memberScope = '';
    let memberParams: any[];
    if (referrerId) {
      memberScope = ' AND m.referrer_id = $2';
      memberParams = [groupId, referrerId];
    } else if (!isGroupOwner) {
      // TS: non-owner branch admin — scope to their own members so cross-branch data stays hidden
      memberScope = ' AND m.branch_id = $2';
      memberParams = [groupId, branchId];
    } else {
      memberParams = [groupId];
    }

    const membersResult = await db.query(
      `SELECT
         m.*,
         m.branch_id AS source_branch_id,
         c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
         u.name AS entered_by_name,
         COALESCE(SUM(p.amount), 0)::numeric  AS total_paid,
         COUNT(p.id)::int                      AS months_paid
       FROM agila_chit_members m
       JOIN customers c ON m.customer_id = c.id
       JOIN users u     ON m.entered_by  = u.id
       LEFT JOIN agila_chit_payments p ON p.member_id = m.id
       WHERE m.group_id = $1${memberScope}
       GROUP BY m.id, c.name, c.phone, c.customer_code, u.name
       ORDER BY m.created_at ASC`,
      memberParams
    );

    const winnersResult = await db.query(
      `SELECT w.*, c.name AS customer_name, u.name AS selected_by_name
       FROM agila_chit_winners w
       JOIN agila_chit_members m ON m.id = w.member_id
       JOIN customers c          ON c.id = m.customer_id
       JOIN users u              ON u.id = w.selected_by
       WHERE w.group_id = $1${memberScope}
       ORDER BY w.month_number ASC`,
      memberParams
    );

    return {
      ...group,
      members:        membersResult.rows,
      winners:        winnersResult.rows,
      eligibleForWin: membersResult.rows.filter(
        (m: any) => m.status === 'active' && !m.has_won
      ).length,
    };
  },
};
