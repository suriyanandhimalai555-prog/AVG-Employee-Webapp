// Agila Chit — under-filled groups: send to head branch, list the inbox, combine, expire.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool, PoolClient } from 'pg';
import { NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import type { CombineChitGroupsInput } from './chit.schema';
import { CHIT_PACKAGES } from './chit.schema';
import { MAX_MEMBERS, FILL_WINDOW_DAYS, assertHeadBranchAdmin, promoteStaleFormingGroups } from './chit.shared';

export const ChitCombineService = {
  // ─── SEND TO HEAD BRANCH ───────────────────────────────────────────────────
  // Branch admin manually forwards a forming group when they can't fill 19 members.
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
                 CASE WHEN $6::text = 'active' THEN NOW() ELSE NULL END,
                 CASE WHEN $6::text = 'active' THEN $8  ELSE NULL END,
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

      // Re-sequence card_number within the combined group so that customers who
      // contributed a card from different source groups don't end up with two "Card 1"
      // rows. ROW_NUMBER ordered by created_at preserves chronological priority.
      await client.query(
        `UPDATE agila_chit_members m
         SET card_number = sub.rn
         FROM (
           SELECT id,
                  ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at ASC)::int AS rn
           FROM agila_chit_members
           WHERE group_id = $1
         ) sub
         WHERE m.id = sub.id AND m.group_id = $1`,
        [newGroup.id]
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
};
