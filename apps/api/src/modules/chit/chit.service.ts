import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import type {
  CreateChitGroupInput,
  AddChitMemberInput,
  RecordChitPaymentInput,
  SelectWinnerInput,
  CancelMemberInput,
  GetChitGroupsQuery,
  CombineChitGroupsInput,
} from './chit.schema';
import { CHIT_PACKAGES } from './chit.schema';

const SCHEME_CODE     = 'agila_chit_scheme';
const MAX_MEMBERS     = 20;
const FILL_WINDOW_DAYS = 30;

// ─── Prize formula ─────────────────────────────────────────────────────────────
// winnerAmount = fullAmount × (9 + monthWon / 2)
// Verified against the full prize table in the scheme spec.
function computeWinnerAmount(fullAmount: number, monthWon: number): number {
  return fullAmount * (9 + monthWon / 2);
}

// ─── Stale-forming check ───────────────────────────────────────────────────────
// A forming group whose fill deadline has passed is lazily promoted on the next
// read, exactly as GoldCoin/LSS do with pending_combine promotion.
function isStaleForming(status: string, deadline: string | null): boolean {
  if (status !== 'forming' || !deadline) return false;
  return new Date(deadline) <= new Date();
}

// ─── Head-branch permission guard ─────────────────────────────────────────────
// Mirrors gold-coin/combine.service.ts:assertHeadBranchAdmin. The head branch
// is set via migration (035/036) and is read-only at runtime.
async function assertHeadBranchAdmin(
  db: Pool | PoolClient,
  userId: string
): Promise<{ headBranchId: string }> {
  const result = await db.query(
    `SELECT u.role, u.branch_id, b.is_head_branch
     FROM users u LEFT JOIN branches b ON b.id = u.branch_id
     WHERE u.id = $1`,
    [userId]
  );
  if (result.rows.length === 0) throw new NotFoundError('User not found');
  const { role, branch_id, is_head_branch } = result.rows[0];
  if (role !== 'branch_admin' || !is_head_branch || !branch_id) {
    throw new ForbiddenError(
      'Only branch admins at the head branch can perform this action',
      'CHIT_HEAD_PERM'
    );
  }
  return { headBranchId: branch_id };
}

// ─── Bulk stale-forming promotion (run at the top of list operations) ──────────
async function promoteStaleFormingGroups(db: Pool | PoolClient): Promise<void> {
  await db.query(
    `UPDATE agila_chit_groups
     SET status = 'pending_combine'
     WHERE status = 'forming' AND fill_deadline IS NOT NULL AND fill_deadline <= NOW()`
  );
}

export const ChitService = {
  schemeCode: SCHEME_CODE,

  // ─── CREATE GROUP ──────────────────────────────────────────────────────────
  async createGroup(
    db: Pool,
    createdBy: string,
    branchId: string,
    payload: CreateChitGroupInput
  ): Promise<any> {
    const pkg = CHIT_PACKAGES[payload.packageNumber];
    if (!pkg) throw new ValidationError('Invalid package number');

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
  },

  // ─── LIST GROUPS ───────────────────────────────────────────────────────────
  async getGroups(
    db: Pool,
    branchId: string,
    query: GetChitGroupsQuery
  ): Promise<{ data: any[]; total: number }> {
    // Lazy promotion: any forming group whose deadline passed becomes pending_combine
    await promoteStaleFormingGroups(db);

    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;

    if (query.status === 'in_progress') {
      // Virtual filter: everything that is not done / terminal
      where += ` AND g.status NOT IN ('completed','combined_into','expired')`;
    } else if (query.status) {
      where += ` AND g.status = $${idx++}`;
      params.push(query.status);
    }

    if (query.search) {
      where += ` AND g.group_name ILIKE $${idx}`;
      params.push(`%${query.search}%`);
      idx++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM agila_chit_groups g WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT
         g.*,
         u.name AS created_by_name,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id)                       AS member_count,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id AND m.status='active') AS active_member_count,
         (SELECT COUNT(*)::int FROM agila_chit_winners  w WHERE w.group_id = g.id)                      AS winners_selected
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
         g.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET SINGLE GROUP WITH MEMBERS ────────────────────────────────────────
  async getGroup(db: Pool, groupId: string, branchId: string): Promise<any> {
    const groupResult = await db.query(
      `SELECT g.*, u.name AS created_by_name, b.is_head_branch AS branch_is_head
       FROM agila_chit_groups g
       JOIN users    u ON g.created_by = u.id
       JOIN branches b ON b.id = g.branch_id
       WHERE g.id = $1 AND g.branch_id = $2`,
      [groupId, branchId]
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

    const membersResult = await db.query(
      `SELECT
         m.*,
         c.name AS customer_name, c.phone AS customer_phone, c.customer_code,
         u.name AS entered_by_name,
         COALESCE(SUM(p.amount), 0)::numeric  AS total_paid,
         COUNT(p.id)::int                      AS months_paid
       FROM agila_chit_members m
       JOIN customers c ON m.customer_id = c.id
       JOIN users u     ON m.entered_by  = u.id
       LEFT JOIN agila_chit_payments p ON p.member_id = m.id
       WHERE m.group_id = $1
       GROUP BY m.id, c.name, c.phone, c.customer_code, u.name
       ORDER BY m.created_at ASC`,
      [groupId]
    );

    const winnersResult = await db.query(
      `SELECT w.*, c.name AS customer_name, u.name AS selected_by_name
       FROM agila_chit_winners w
       JOIN agila_chit_members m ON m.id = w.member_id
       JOIN customers c          ON c.id = m.customer_id
       JOIN users u              ON u.id = w.selected_by
       WHERE w.group_id = $1
       ORDER BY w.month_number ASC`,
      [groupId]
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

  // ─── ADD MEMBER ────────────────────────────────────────────────────────────
  // One-step enrollment: inserts the member, auto-records the Month-1 full
  // payment, and (if referrerId given) credits 20% to the referrer.
  // When the 20th member is added, the group auto-transitions forming → active.
  async addMember(
    db: Pool,
    enteredBy: string,
    groupId: string,
    branchId: string,
    payload: AddChitMemberInput
  ): Promise<any> {
    // Pre-flight: verify customer and referrer before opening the transaction
    // (network round-trips outside the transaction to keep lock duration minimal)
    const custResult = await db.query(
      'SELECT id, name FROM customers WHERE id = $1 AND branch_id = $2',
      [payload.customerId, branchId]
    );
    if (custResult.rows.length === 0) throw new NotFoundError('Customer not found in this branch');

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

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Lock the group row first — serialises concurrent addMember calls so the
      // 20-member cap and the forming→active transition are race-free.
      const groupResult = await client.query(
        `SELECT id, full_amount, start_date, group_name, status
         FROM agila_chit_groups
         WHERE id = $1 AND branch_id = $2 AND status IN ('forming','active')
         FOR UPDATE`,
        [groupId, branchId]
      );
      if (groupResult.rows.length === 0) {
        throw new NotFoundError('Group not found, already completed, or sent to head branch');
      }
      const group = groupResult.rows[0];

      // Count and cap — safe under the FOR UPDATE lock
      const countResult = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM agila_chit_members WHERE group_id = $1',
        [groupId]
      );
      if (countResult.rows[0].cnt >= MAX_MEMBERS) {
        throw new ValidationError(`Group already has ${MAX_MEMBERS} members`);
      }

      // Check customer not already in this group
      const dupCheck = await client.query(
        'SELECT id FROM agila_chit_members WHERE group_id = $1 AND customer_id = $2',
        [groupId, payload.customerId]
      );
      if (dupCheck.rows.length > 0) throw new ConflictError('Customer is already a member of this group');

      const fullAmount   = parseFloat(group.full_amount);
      const paymentDate  = payload.firstPaymentDate || group.start_date;
      const customerName = custResult.rows[0].name;

      // Insert member
      const memberResult = await client.query(
        `INSERT INTO agila_chit_members
           (group_id, customer_id, referrer_id, referrer_name, entered_by)
         VALUES ($1,$2,$3,$4,$5)
         RETURNING *`,
        [groupId, payload.customerId, payload.referrerId || null, referrerName, enteredBy]
      );
      const member = memberResult.rows[0];

      // Auto-record Month-1 full payment
      await client.query(
        `INSERT INTO agila_chit_payments
           (group_id, member_id, month_number, amount, payment_date, payment_mode, entered_by)
         VALUES ($1,$2,1,$3,$4,$5,$6)`,
        [groupId, member.id, fullAmount, paymentDate, payload.firstPaymentMode, enteredBy]
      );

      // Credit referrer 20% of Month-1 full amount
      let commissionAmount = 0;
      if (payload.referrerId) {
        const credited = await IncentiveService.distributeIncentives(client, {
          schemeCode:        SCHEME_CODE,
          dealMakerUserId:   payload.referrerId,
          mode:              'percent_referrer',
          percentRole:       'referrer_direct',
          baseAmount:        fullAmount,
          paymentEvent:      'enrollment',
          sourceId:          member.id,
          sourceDescription: `Agila Chit enrollment: ${customerName} – ${group.group_name}`,
          creditedBy:        enteredBy,
        });
        commissionAmount = credited.reduce((sum: number, row: any) => sum + parseFloat(row.amount), 0);
      }

      // Auto-transition forming → active when 20th member is added
      const afterCount = await client.query(
        'SELECT COUNT(*)::int AS cnt FROM agila_chit_members WHERE group_id = $1',
        [groupId]
      );
      const newCount = afterCount.rows[0].cnt;
      let groupStatus = 'forming';
      if (newCount === MAX_MEMBERS) {
        await client.query(
          `UPDATE agila_chit_groups
           SET status = 'active', activated_at = NOW(), activated_by = $2
           WHERE id = $1 AND status = 'forming'`,
          [groupId, enteredBy]
        );
        groupStatus = 'active';
      }

      await client.query('COMMIT');
      return { member, customer: custResult.rows[0], commissionAmount, memberCount: newCount, groupStatus };
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── RECORD MONTHLY PAYMENT ────────────────────────────────────────────────
  async recordPayment(
    db: Pool,
    enteredBy: string,
    groupId: string,
    memberId: string,
    branchId: string,
    payload: RecordChitPaymentInput
  ): Promise<any> {
    // Allow payment recording for all non-terminal statuses
    const memberResult = await db.query(
      `SELECT m.*, g.full_amount, g.half_amount
       FROM agila_chit_members m
       JOIN agila_chit_groups g ON g.id = m.group_id
       WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3
         AND g.status NOT IN ('combined_into','expired')`,
      [memberId, groupId, branchId]
    );
    if (memberResult.rows.length === 0) throw new NotFoundError('Member not found');

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO agila_chit_payments
           (group_id, member_id, month_number, amount, payment_date, payment_mode, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [groupId, memberId, payload.monthNumber, payload.amount,
         payload.paymentDate, payload.paymentMode, payload.notes || null, enteredBy]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new ConflictError(`Month ${payload.monthNumber} payment already recorded for this member`);
      }
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── SELECT WINNER ─────────────────────────────────────────────────────────
  async selectWinner(
    db: Pool,
    selectedBy: string,
    groupId: string,
    branchId: string,
    payload: SelectWinnerInput
  ): Promise<any> {
    // Winner selection requires exactly 20 active members (status='active')
    const groupResult = await db.query(
      `SELECT * FROM agila_chit_groups WHERE id = $1 AND branch_id = $2 AND status = 'active'`,
      [groupId, branchId]
    );
    if (groupResult.rows.length === 0) {
      throw new NotFoundError('Group not found, not active, or already completed. The group must have 20 members to start winner selection.');
    }
    const group = groupResult.rows[0];

    const monthNumber = group.current_month;
    if (monthNumber > 20) throw new ValidationError('All months completed');

    const memberResult = await db.query(
      `SELECT m.*, c.name AS customer_name
       FROM agila_chit_members m
       JOIN customers c ON c.id = m.customer_id
       WHERE m.id = $1 AND m.group_id = $2`,
      [payload.memberId, groupId]
    );
    if (memberResult.rows.length === 0) throw new NotFoundError('Member not found in this group');
    const member = memberResult.rows[0];

    if (member.status !== 'active') throw new ValidationError('Cannot select a cancelled member as winner');
    if (member.has_won)             throw new ValidationError('Member has already won in this group');

    if (monthNumber === 20) {
      const eligibleCount = await db.query(
        `SELECT COUNT(*)::int AS cnt FROM agila_chit_members
         WHERE group_id = $1 AND status = 'active' AND has_won = false AND id != $2`,
        [groupId, payload.memberId]
      );
      if (eligibleCount.rows[0].cnt > 0) {
        throw new ValidationError('Month 20 winner must be the last remaining eligible member');
      }
    }

    const winnerAmount  = computeWinnerAmount(parseFloat(group.full_amount), monthNumber);
    const newPayingHalf = monthNumber < 11;
    const nextMonth     = monthNumber >= 20 ? 21 : monthNumber + 1;
    const newGroupStatus = monthNumber >= 20 ? 'completed' : 'active';

    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO agila_chit_winners (group_id, member_id, month_number, winner_amount, notes, selected_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [groupId, payload.memberId, monthNumber, winnerAmount, payload.notes || null, selectedBy]
      );

      await client.query(
        `UPDATE agila_chit_members
         SET has_won = true, won_month = $1, winner_amount = $2,
             paying_half = CASE WHEN paying_half THEN true ELSE $3 END
         WHERE id = $4`,
        [monthNumber, winnerAmount, newPayingHalf, payload.memberId]
      );

      await client.query(
        `UPDATE agila_chit_groups
         SET current_month = $1, status = $2,
             completed_at = CASE WHEN $2 = 'completed' THEN NOW() ELSE completed_at END
         WHERE id = $3`,
        [nextMonth, newGroupStatus, groupId]
      );

      await client.query('COMMIT');
      return { winnerAmount, monthNumber, customerName: member.customer_name, groupCompleted: newGroupStatus === 'completed' };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') throw new ConflictError(`A winner has already been selected for month ${monthNumber}`);
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── CANCEL MEMBER CARD ────────────────────────────────────────────────────
  async cancelMember(db: Pool, groupId: string, memberId: string, branchId: string, payload: CancelMemberInput): Promise<any> {
    const groupCheck = await db.query(
      'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
      [groupId, branchId]
    );
    if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

    const result = await db.query(
      `UPDATE agila_chit_members
       SET status = 'cancelled', cancellation_due_month_1 = $1, cancellation_due_month_2 = $2
       WHERE id = $3 AND group_id = $4 AND status = 'active'
       RETURNING *`,
      [payload.cancelDueMonth1, payload.cancelDueMonth2 || null, memberId, groupId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Member not found or already cancelled');
    return result.rows[0];
  },

  // ─── REINSTATE MEMBER CARD ─────────────────────────────────────────────────
  async reinstateMember(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any> {
    const groupCheck = await db.query(
      'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
      [groupId, branchId]
    );
    if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

    const memberResult = await db.query(
      `SELECT * FROM agila_chit_members WHERE id = $1 AND group_id = $2`,
      [memberId, groupId]
    );
    if (memberResult.rows.length === 0) throw new NotFoundError('Member not found');
    const member = memberResult.rows[0];

    if (member.status !== 'cancelled') throw new ValidationError('Member card is not cancelled');
    if (!member.cancellation_due_month_1) throw new ValidationError('No cancellation months recorded');

    const pay1 = await db.query(
      'SELECT id FROM agila_chit_payments WHERE member_id = $1 AND month_number = $2',
      [memberId, member.cancellation_due_month_1]
    );
    if (pay1.rows.length === 0) {
      throw new ValidationError(`Month ${member.cancellation_due_month_1} payment must be recorded before reinstatement`);
    }

    if (member.cancellation_due_month_2) {
      const pay2 = await db.query(
        'SELECT id FROM agila_chit_payments WHERE member_id = $1 AND month_number = $2',
        [memberId, member.cancellation_due_month_2]
      );
      if (pay2.rows.length === 0) {
        throw new ValidationError(`Month ${member.cancellation_due_month_2} payment must also be recorded before reinstatement`);
      }
    }

    const result = await db.query(
      `UPDATE agila_chit_members
       SET status = 'active', cancellation_due_month_1 = NULL, cancellation_due_month_2 = NULL
       WHERE id = $1 RETURNING *`,
      [memberId]
    );
    return result.rows[0];
  },

  // ─── MARK REFUND PAID ──────────────────────────────────────────────────────
  async markRefundPaid(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any> {
    const groupResult = await db.query(
      `SELECT g.status FROM agila_chit_groups g WHERE g.id = $1 AND g.branch_id = $2`,
      [groupId, branchId]
    );
    if (groupResult.rows.length === 0) throw new NotFoundError('Group not found');
    if (!['completed','expired'].includes(groupResult.rows[0].status)) {
      throw new ValidationError('Refunds can only be credited after the group completes or expires');
    }

    const result = await db.query(
      `UPDATE agila_chit_members
       SET refund_credited_at = NOW()
       WHERE id = $1 AND group_id = $2 AND status = 'cancelled' AND refund_credited_at IS NULL
       RETURNING *`,
      [memberId, groupId]
    );
    if (result.rows.length === 0) throw new NotFoundError('Member not found, not cancelled, or refund already credited');
    return result.rows[0];
  },

  // ─── SEND TO HEAD BRANCH ───────────────────────────────────────────────────
  // Branch admin manually forwards a forming group when they can't fill 20 members.
  async sendToHeadBranch(db: Pool, groupId: string, branchId: string): Promise<any> {
    const groupResult = await db.query(
      `SELECT * FROM agila_chit_groups WHERE id = $1 AND branch_id = $2`,
      [groupId, branchId]
    );
    if (groupResult.rows.length === 0) throw new NotFoundError('Group not found');
    const group = groupResult.rows[0];

    if (group.status !== 'forming') {
      throw new ValidationError(
        `Only a forming group can be sent to head branch. Current status: ${group.status}`
      );
    }

    const result = await db.query(
      `UPDATE agila_chit_groups SET status = 'pending_combine' WHERE id = $1 RETURNING *`,
      [groupId]
    );
    return result.rows[0];
  },

  // ─── LIST AWAITING COMBINE (head-branch inbox) ─────────────────────────────
  async listAwaitingCombine(db: Pool): Promise<any[]> {
    await promoteStaleFormingGroups(db);

    const result = await db.query(
      `SELECT
         g.*,
         b.name AS branch_name,
         u.name AS created_by_name,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id)  AS member_count
       FROM agila_chit_groups g
       JOIN branches b ON b.id = g.branch_id
       JOIN users    u ON u.id = g.created_by
       WHERE g.status = 'pending_combine'
       ORDER BY g.created_at ASC`
    );
    return result.rows;
  },

  // ─── COMBINE GROUPS (head-branch only) ─────────────────────────────────────
  // Merges members from 2+ pending_combine groups (same package) into a new
  // head-branch group. Total members must be ≤ 20. Members and their payment
  // history are moved to the new group; source groups become 'combined_into'.
  async combineGroups(
    db: Pool,
    payload: CombineChitGroupsInput,
    actorUserId: string
  ): Promise<any> {
    const { headBranchId } = await assertHeadBranchAdmin(db, actorUserId);

    return runInTransaction(db, async (client: PoolClient) => {
      // Lock source groups in deterministic order (deadlock-safe)
      const sortedIds = [...payload.sourceGroupIds].sort();
      const placeholders = sortedIds.map((_, i) => `$${i + 1}`).join(',');
      const groupsRes = await client.query(
        `SELECT * FROM agila_chit_groups WHERE id IN (${placeholders}) ORDER BY id FOR UPDATE`,
        sortedIds
      );

      if (groupsRes.rows.length !== sortedIds.length) {
        throw new NotFoundError('One or more groups not found');
      }

      const groups = groupsRes.rows;

      // All must be pending_combine and same package
      const packageNumber = groups[0].package_number;
      for (const g of groups) {
        if (g.status !== 'pending_combine') {
          throw new ValidationError(`Group "${g.group_name}" is not pending combine (status: ${g.status})`);
        }
        if (g.package_number !== packageNumber) {
          throw new ValidationError('All groups to combine must have the same package number');
        }
      }

      // Collect all active members from source groups
      const memberRes = await client.query(
        `SELECT * FROM agila_chit_members
         WHERE group_id IN (${placeholders}) AND status = 'active'
         ORDER BY created_at ASC
         FOR UPDATE`,
        sortedIds
      );
      const members = memberRes.rows;

      if (members.length === 0) throw new ValidationError('No active members to combine');
      if (members.length > MAX_MEMBERS) {
        throw new ValidationError(
          `Combined member count (${members.length}) exceeds the maximum of ${MAX_MEMBERS}`
        );
      }

      // Create the new combined group at the head branch
      const pkg       = CHIT_PACKAGES[packageNumber];
      const groupName = `Combined: ${groups.map((g: any) => g.group_name).join(' + ')}`.slice(0, 100);
      const newStatus = members.length === MAX_MEMBERS ? 'active' : 'forming';

      const newGroupRes = await client.query(
        `INSERT INTO agila_chit_groups
           (branch_id, group_name, package_number, full_amount, half_amount,
            start_date, current_month, status, fill_deadline, is_combined,
            activated_at, activated_by, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,2,$6,NOW() + ($9 * INTERVAL '1 day'),true,
                 CASE WHEN $6 = 'active' THEN NOW() ELSE NULL END,
                 CASE WHEN $6 = 'active' THEN $8  ELSE NULL END,
                 $7,$8)
         RETURNING *`,
        [
          headBranchId,
          groupName,
          packageNumber,
          pkg.fullAmount,
          pkg.halfAmount,
          newStatus,
          payload.notes || null,
          actorUserId,
          FILL_WINDOW_DAYS,
        ]
      );
      const newGroup = newGroupRes.rows[0];

      // Move members to the new group
      const memberIds = members.map((m: any) => m.id);
      const memberPlaceholders = memberIds.map((_: any, i: number) => `$${i + 2}`).join(',');
      await client.query(
        `UPDATE agila_chit_members SET group_id = $1 WHERE id IN (${memberPlaceholders})`,
        [newGroup.id, ...memberIds]
      );

      // Move their payment records to the new group
      await client.query(
        `UPDATE agila_chit_payments SET group_id = $1 WHERE member_id IN (${memberPlaceholders})`,
        [newGroup.id, ...memberIds]
      );

      // Mark source groups as combined_into
      await client.query(
        `UPDATE agila_chit_groups
         SET status = 'combined_into', combined_into_group_id = $1
         WHERE id IN (${placeholders})`,
        [newGroup.id, ...sortedIds]
      );

      return {
        newGroup,
        membersMoved:  members.length,
        sourceCount:   groups.length,
        groupActivated: newStatus === 'active',
      };
    });
  },

  // ─── EXPIRE GROUP (head-branch only) ───────────────────────────────────────
  // Dissolves a pending_combine group — auto-marks all active members as refunded.
  async expireGroup(db: Pool, groupId: string, actorUserId: string): Promise<any> {
    await assertHeadBranchAdmin(db, actorUserId);

    return runInTransaction(db, async (client: PoolClient) => {
      const groupResult = await client.query(
        `SELECT * FROM agila_chit_groups WHERE id = $1 FOR UPDATE`,
        [groupId]
      );
      if (groupResult.rows.length === 0) throw new NotFoundError('Group not found');
      const group = groupResult.rows[0];

      if (group.status !== 'pending_combine') {
        throw new ValidationError(`Only a pending_combine group can be expired. Current status: ${group.status}`);
      }

      // Mark group expired
      await client.query(
        `UPDATE agila_chit_groups SET status = 'expired' WHERE id = $1`,
        [groupId]
      );

      // Auto-mark all active members' refunds as credited (company refunds all)
      const refundResult = await client.query(
        `UPDATE agila_chit_members
         SET refund_credited_at = NOW()
         WHERE group_id = $1 AND status = 'active' AND refund_credited_at IS NULL
         RETURNING id`,
        [groupId]
      );

      return { group: { ...group, status: 'expired' }, membersRefunded: refundResult.rows.length };
    });
  },

  // ─── GET PAYMENT HISTORY FOR A MEMBER ─────────────────────────────────────
  async getMemberPayments(db: Pool, groupId: string, memberId: string, branchId: string): Promise<any[]> {
    const check = await db.query(
      `SELECT m.id FROM agila_chit_members m
       JOIN agila_chit_groups g ON g.id = m.group_id
       WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3`,
      [memberId, groupId, branchId]
    );
    if (check.rows.length === 0) throw new NotFoundError('Member not found');

    const result = await db.query(
      `SELECT p.*, u.name AS entered_by_name
       FROM agila_chit_payments p
       JOIN users u ON u.id = p.entered_by
       WHERE p.member_id = $1
       ORDER BY p.month_number ASC`,
      [memberId]
    );
    return result.rows;
  },

  // ─── ELIGIBLE WINNERS ─────────────────────────────────────────────────────
  async getEligibleMembers(db: Pool, groupId: string, branchId: string): Promise<any[]> {
    const groupCheck = await db.query(
      'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
      [groupId, branchId]
    );
    if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

    const result = await db.query(
      `SELECT m.id, m.customer_id, m.paying_half, m.status, m.has_won,
              c.name AS customer_name, c.phone AS customer_phone, c.customer_code
       FROM agila_chit_members m
       JOIN customers c ON c.id = m.customer_id
       WHERE m.group_id = $1 AND m.status = 'active' AND m.has_won = false
       ORDER BY c.name ASC`,
      [groupId]
    );
    return result.rows;
  },

  // ─── BRANCH SUMMARY ────────────────────────────────────────────────────────
  async getBranchSummary(
    db: Pool,
    branchId: string,
    _scopedToUserId?: string,
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any> {
    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND g.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND g.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const groupsResult = await db.query(
      `SELECT
         COUNT(*)::int                                                AS total_groups,
         COUNT(*) FILTER (WHERE g.status = 'forming')::int           AS forming_groups,
         COUNT(*) FILTER (WHERE g.status = 'active')::int            AS active_groups,
         COUNT(*) FILTER (WHERE g.status = 'completed')::int         AS completed_groups,
         COUNT(*) FILTER (WHERE g.status = 'pending_combine')::int   AS pending_groups
       FROM agila_chit_groups g WHERE ${where}`,
      params
    );

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
       WHERE ${where}`,
      params
    );

    const commParams: any[] = [branchId, SCHEME_CODE];
    let commWhere = 'acg.branch_id = $1 AND ei.scheme_code = $2';
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
    let memWhere = '1=1';
    let memIdx = 1;
    if (dateFilter?.startDate) { memWhere += ` AND g.created_at >= $${memIdx++}::date`; memParams.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { memWhere += ` AND g.created_at < ($${memIdx++}::date + INTERVAL '1 day')`; memParams.push(dateFilter.endDate); }

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
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;
    if (dateFilter?.startDate) { where += ` AND g.created_at >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND g.created_at < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

    const res = await db.query(
      `SELECT
         g.id, g.group_name, g.package_number, g.full_amount, g.half_amount,
         g.status, g.current_month, g.start_date, g.created_at,
         (SELECT COUNT(*)::int FROM agila_chit_members m WHERE m.group_id = g.id) AS member_count,
         (SELECT COALESCE(SUM(p.amount),0)
          FROM agila_chit_payments p
          JOIN agila_chit_members m ON m.id = p.member_id
          WHERE m.group_id = g.id) AS total_collected
       FROM agila_chit_groups g
       WHERE ${where}
       ORDER BY g.created_at DESC
       LIMIT 500`,
      params
    );
    return res.rows;
  },
};
