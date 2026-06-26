import { Pool, PoolClient } from 'pg';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { IncentiveService } from '../incentives/incentives.service';
import { runInTransaction } from '../../shared/transaction-helper';
import { SchemeAudit } from '../../shared/scheme-audit';
import type {
  CreateChitGroupInput,
  AddChitMemberInput,
  RecordChitPaymentInput,
  SelectWinnerInput,
  CancelMemberInput,
  GetChitGroupsQuery,
  CombineChitGroupsInput,
  CorrectChitMemberInput,
  CorrectChitPaymentInput,
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

  // ─── GET PACKAGES (DB) ────────────────────────────────────────────────────
  async getPackages(db: Pool): Promise<any[]> {
    const res = await db.query(
      `SELECT package_number, full_amount, half_amount, is_active
       FROM chit_packages
       WHERE is_active = true
       ORDER BY package_number ASC`
    );
    // TS: fall back to hardcoded constant if table not yet migrated
    if (res.rows.length === 0) {
      return Object.entries(CHIT_PACKAGES).map(([num, pkg]) => ({
        package_number: parseInt(num),
        full_amount:    pkg.fullAmount,
        half_amount:    pkg.halfAmount,
        is_active:      true,
      }));
    }
    return res.rows.map(r => ({
      package_number: r.package_number,
      full_amount:    parseFloat(r.full_amount),
      half_amount:    parseFloat(r.half_amount),
      is_active:      r.is_active,
    }));
  },

  // ─── UPDATE PACKAGE (config roles only) ────────────────────────────────────
  async updatePackage(
    db: Pool,
    packageNumber: number,
    payload: { fullAmount?: number; halfAmount?: number }
  ): Promise<any> {
    const fields: string[] = [];
    const values: any[]    = [];
    let idx = 1;
    if (payload.fullAmount != null) { fields.push(`full_amount = $${idx++}`); values.push(payload.fullAmount); }
    if (payload.halfAmount != null) { fields.push(`half_amount = $${idx++}`); values.push(payload.halfAmount); }
    if (fields.length === 0) throw new Error('No fields to update');
    fields.push(`updated_at = now()`);
    values.push(packageNumber);
    const res = await db.query(
      `UPDATE chit_packages SET ${fields.join(', ')} WHERE package_number = $${idx} RETURNING *`,
      values
    );
    if (res.rows.length === 0) throw new Error(`Package ${packageNumber} not found`);
    return res.rows[0];
  },

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
    const params: any[] = [];
    let where: string;
    if (referrerId) {
      params.push(referrerId);
      where = 'EXISTS (SELECT 1 FROM agila_chit_members mm WHERE mm.group_id = g.id AND mm.referrer_id = $1)';
    } else {
      params.push(branchId);
      where = 'g.branch_id = $1';
    }
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
  async getGroup(db: Pool, groupId: string, branchId: string, referrerId?: string): Promise<any> {
    // Referrer-scoped roles can open a group from any branch, but only if they have
    // a card in it — gate access via EXISTS instead of the branch match.
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
           WHERE g.id = $1 AND g.branch_id = $2`,
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
    const memberScope = referrerId ? ' AND m.referrer_id = $2' : '';
    const memberParams = referrerId ? [groupId, referrerId] : [groupId];

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

      // cash_bank split must sum to the month-1 full amount (validated here since the
      // amount is derived from the group package, not the request payload)
      if (payload.firstPaymentMode === 'cash_bank' &&
          Math.abs((payload.firstPaymentCashAmount ?? 0) + (payload.firstPaymentBankAmount ?? 0) - fullAmount) > 0.01) {
        throw new ValidationError('firstPaymentCashAmount + firstPaymentBankAmount must equal the monthly amount');
      }

      // Auto-record Month-1 full payment
      await client.query(
        `INSERT INTO agila_chit_payments
           (group_id, member_id, month_number, amount, payment_date, payment_mode, proof_key, transaction_id, cash_amount, bank_amount, entered_by)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [groupId, member.id, fullAmount, paymentDate, payload.firstPaymentMode, payload.firstPaymentProofKey?.length ? payload.firstPaymentProofKey : null, payload.firstPaymentTransactionId?.length ? payload.firstPaymentTransactionId : null,
          // cash_bank split amounts — null unless mode is cash_bank
          payload.firstPaymentMode === 'cash_bank' ? payload.firstPaymentCashAmount : null,
          payload.firstPaymentMode === 'cash_bank' ? payload.firstPaymentBankAmount : null,
          enteredBy]
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
          // Backdated entry: the incentive sits in the month-1 payment date's wallet period
          effectiveDate:     paymentDate,
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
           (group_id, member_id, month_number, amount, payment_date, payment_mode, proof_key, transaction_id, cash_amount, bank_amount, notes, entered_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING *`,
        [groupId, memberId, payload.monthNumber, payload.amount,
         payload.paymentDate, payload.paymentMode,
         payload.proofKey?.length ? payload.proofKey : null,
         // transactionId is TEXT[] — bind array directly; empty array → NULL
         payload.transactionId?.length ? payload.transactionId : null,
         // cash_bank split amounts — null unless mode is cash_bank
         payload.paymentMode === 'cash_bank' ? payload.cashAmount : null,
         payload.paymentMode === 'cash_bank' ? payload.bankAmount : null,
         payload.notes || null, enteredBy]
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
    return runInTransaction(db, async (client: PoolClient) => {
      const groupCheck = await client.query(
        'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
        [groupId, branchId]
      );
      if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

      const result = await client.query(
        `UPDATE agila_chit_members
         SET status = 'cancelled', cancellation_due_month_1 = $1, cancellation_due_month_2 = $2
         WHERE id = $3 AND group_id = $4 AND status = 'active'
         RETURNING *`,
        [payload.cancelDueMonth1, payload.cancelDueMonth2 || null, memberId, groupId]
      );
      if (result.rows.length === 0) throw new NotFoundError('Member not found or already cancelled');

      // Reverse the enrollment incentive that was credited when this member joined.
      // Previously this was skipped, leaving orphan incentive rows in the ledger.
      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     memberId,
        paymentEvent: 'enrollment',
      });

      return result.rows[0];
    });
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

  // ─── CORRECT MEMBER (admin: MD / Management) ────────────────────────────────
  // Patches editable fields on an existing chit member. When referrerId or
  // amount changes the enrollment incentive is reversed and re-distributed.
  async correctMember(
    db: Pool,
    correctedBy: string,
    groupId: string,
    memberId: string,
    branchId: string,
    payload: CorrectChitMemberInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const beforeRes = await client.query(
        `SELECT m.*, c.name AS customer_name, g.full_amount, g.group_name
         FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         JOIN customers c ON c.id = m.customer_id
         WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3`,
        [memberId, groupId, branchId]
      );
      if (beforeRes.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = beforeRes.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.notes      !== undefined) { fields.push(`notes = $${idx++}`);       vals.push(payload.notes); }
      // TS: customerId allows admin to re-assign the enrollment to the correct customer
      if (payload.customerId !== undefined) { fields.push(`customer_id = $${idx++}`); vals.push(payload.customerId); }

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

      vals.push(memberId, groupId);
      const updated = await client.query(
        `UPDATE agila_chit_members SET ${fields.join(', ')} WHERE id = $${idx} AND group_id = $${idx + 1} RETURNING *`,
        vals
      );

      const referrerChanged = payload.referrerId !== undefined && payload.referrerId !== old.referrer_id;
      const effectiveReferrer = payload.referrerId !== undefined ? payload.referrerId : old.referrer_id;

      if (referrerChanged) {
        // Always claw back first — clearing the referrer (null) must also remove
        // the old referrer's credit, so the reversal cannot depend on a new referrer.
        await IncentiveService.reverseIncentives(client, {
          schemeCode:   SCHEME_CODE,
          sourceId:     memberId,
          paymentEvent: 'enrollment',
        });
        if (effectiveReferrer) {
          // TS: effectiveDate = original enrollment date so the corrected credit lands
          // in the same accounting period the old credit was removed from (not today).
          await IncentiveService.distributeIncentives(client, {
            schemeCode:        SCHEME_CODE,
            dealMakerUserId:   effectiveReferrer,
            mode:              'percent_referrer',
            percentRole:       'referrer_direct',
            baseAmount:        parseFloat(old.full_amount),
            paymentEvent:      'enrollment',
            sourceId:          memberId,
            sourceDescription: `Agila Chit enrollment (corrected): ${old.customer_name} – ${old.group_name}`,
            creditedBy:        correctedBy,
            effectiveDate:     old.created_at,
          });
        }
      }

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId:    correctedBy,
        action:     'edit',
        oldValues:  old,
        newValues:  updated.rows[0],
      });

      return updated.rows[0];
    });
  },

  // ─── VOID MEMBER (admin: MD / Management) ────────────────────────────────────
  async voidMember(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT m.* FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3`,
        [memberId, groupId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = before.rows[0];
      if (old.status === 'voided') throw new ValidationError('Member is already voided');

      await client.query(
        `UPDATE agila_chit_members SET status = 'voided' WHERE id = $1`,
        [memberId]
      );

      await IncentiveService.reverseIncentives(client, {
        schemeCode:   SCHEME_CODE,
        sourceId:     memberId,
        paymentEvent: 'enrollment',
      });

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId,
        action:     'void',
        oldValues:  old,
      });

      return { ...old, status: 'voided' };
    });
  },

  // ─── DELETE MEMBER (admin: MD / Management) ──────────────────────────────────
  // Permanently deletes a chit member and all of their payments, claws back ALL
  // incentives, and snapshots the before-state into the audit log. Members who
  // have already won a month are blocked — deleting them would erase the group's
  // winner history (agila_chit_winners holds the month slot); void instead.
  async deleteMember(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const before = await client.query(
        `SELECT m.* FROM agila_chit_members m
         JOIN agila_chit_groups g ON g.id = m.group_id
         WHERE m.id = $1 AND m.group_id = $2 AND g.branch_id = $3
         FOR UPDATE OF m`,
        [memberId, groupId, branchId]
      );
      if (before.rows.length === 0) throw new NotFoundError('Chit member not found');
      const old = before.rows[0];
      if (old.has_won) {
        throw new ValidationError('Member has already won a month — void the member instead of deleting');
      }

      const payments = await client.query(
        `SELECT * FROM agila_chit_payments WHERE member_id = $1 ORDER BY month_number`,
        [memberId]
      );

      // Claw back all incentives for this member (enrollment + any payment events)
      await IncentiveService.reverseIncentives(client, {
        schemeCode: SCHEME_CODE,
        sourceId:   memberId,
      });

      await client.query(`DELETE FROM agila_chit_payments WHERE member_id = $1`, [memberId]);
      // Defensive: zero rows given the has_won guard, but keeps the FK path clean
      await client.query(`DELETE FROM agila_chit_winners WHERE member_id = $1`, [memberId]);
      await client.query(`DELETE FROM agila_chit_members WHERE id = $1`, [memberId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'member',
        entityId:   memberId,
        actorId,
        action:     'delete',
        oldValues:  { member: old, payments: payments.rows },
      });

      return { deleted: true, id: memberId, payments: payments.rows.length };
    });
  },

  // ─── CORRECT PAYMENT (admin: MD / Management) ────────────────────────────────
  // Edits an existing chit payment row (month/amount/date/mode/notes).
  async correctPayment(
    db: Pool,
    correctedBy: string,
    groupId: string,
    memberId: string,
    paymentId: string,
    branchId: string,
    payload: CorrectChitPaymentInput
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const groupRow = await client.query(
        `SELECT * FROM agila_chit_groups WHERE id = $1 AND branch_id = $2`,
        [groupId, branchId]
      );
      if (groupRow.rows.length === 0) throw new NotFoundError('Chit group not found');

      const payRow = await client.query(
        `SELECT * FROM agila_chit_payments WHERE id = $1 AND member_id = $2 AND group_id = $3`,
        [paymentId, memberId, groupId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      const fields: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (payload.monthNumber  != null)  { fields.push(`month_number = $${idx++}`);  vals.push(payload.monthNumber); }
      if (payload.amount       != null)  { fields.push(`amount = $${idx++}`);         vals.push(payload.amount); }
      if (payload.paymentDate  != null)  { fields.push(`payment_date = $${idx++}`);   vals.push(payload.paymentDate); }
      if (payload.paymentMode  != null)  { fields.push(`payment_mode = $${idx++}`);   vals.push(payload.paymentMode); }
      if (payload.proofKey     != null)  { fields.push(`proof_key = $${idx++}`);      vals.push(payload.proofKey); }
      // transactionId is TEXT[] — bind array directly; empty array or null → explicit NULL
      if (payload.transactionId !== undefined) { fields.push(`transaction_id = $${idx++}`); vals.push(payload.transactionId?.length ? payload.transactionId : null); }
      // cash_bank split: set when correcting to cash_bank, clear when switching to another mode
      if (payload.paymentMode === 'cash_bank') {
        if (payload.cashAmount != null) { fields.push(`cash_amount = $${idx++}`); vals.push(payload.cashAmount); }
        if (payload.bankAmount != null) { fields.push(`bank_amount = $${idx++}`); vals.push(payload.bankAmount); }
      } else if (payload.paymentMode != null) {
        fields.push(`cash_amount = NULL`);
        fields.push(`bank_amount = NULL`);
      }
      if (payload.notes !== undefined)   { fields.push(`notes = $${idx++}`);          vals.push(payload.notes); }
      if (fields.length === 0) throw new ValidationError('No fields to update');

      vals.push(paymentId, memberId, groupId);
      const updated = await client.query(
        `UPDATE agila_chit_payments SET ${fields.join(', ')}
         WHERE id = $${idx} AND member_id = $${idx + 1} AND group_id = $${idx + 2} RETURNING *`,
        vals
      );

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
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

  // ─── UNPAY PAYMENT (admin: MD / Management) ──────────────────────────────────
  // Deletes a single chit payment. Chit payments currently carry no incentive
  // (only the initial enrollment does), so no incentive reversal is needed.
  async unpayPayment(
    db: Pool,
    actorId: string,
    groupId: string,
    memberId: string,
    paymentId: string,
    branchId: string
  ): Promise<any> {
    return runInTransaction(db, async (client: PoolClient) => {
      const groupRow = await client.query(
        `SELECT * FROM agila_chit_groups WHERE id = $1 AND branch_id = $2`,
        [groupId, branchId]
      );
      if (groupRow.rows.length === 0) throw new NotFoundError('Chit group not found');

      const payRow = await client.query(
        `SELECT * FROM agila_chit_payments WHERE id = $1 AND member_id = $2 AND group_id = $3`,
        [paymentId, memberId, groupId]
      );
      if (payRow.rows.length === 0) throw new NotFoundError('Payment not found');
      const old = payRow.rows[0];

      await client.query('DELETE FROM agila_chit_payments WHERE id = $1', [paymentId]);

      await SchemeAudit.log(client, {
        schemeCode: SCHEME_CODE,
        entityType: 'payment',
        entityId:   paymentId,
        actorId,
        action:     'unpay',
        oldValues:  old,
      });

      return old;
    });
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
    let memWhere = '1=1';
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
    dateFilter?: { startDate?: string; endDate?: string }
  ): Promise<any[]> {
    const params: any[] = [branchId];
    let where = 'g.branch_id = $1';
    let idx = 2;
    // Filter by business date (start_date) so backdated groups count in their real period
    if (dateFilter?.startDate) { where += ` AND g.start_date >= $${idx++}::date`; params.push(dateFilter.startDate); }
    if (dateFilter?.endDate)   { where += ` AND g.start_date < ($${idx++}::date + INTERVAL '1 day')`; params.push(dateFilter.endDate); }

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
