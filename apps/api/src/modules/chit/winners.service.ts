// Agila Chit — monthly winner: who is eligible, and selecting the winner.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool } from 'pg';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors';
import type { SelectWinnerInput } from './chit.schema';
import { computeWinnerAmount } from './chit.shared';

export const ChitWinnersService = {
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
      throw new NotFoundError('Group not found, not active, or already completed. The group must have 19 members to start winner selection.');
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

      // Cast $2 to varchar at both usages so Postgres deduces one consistent
      // type. Without the cast, $2 is inferred as varchar from the SET clause
      // and as text from the CASE comparison — 42P08 "inconsistent types".
      await client.query(
        `UPDATE agila_chit_groups
         SET current_month = $1, status = $2::varchar,
             completed_at = CASE WHEN $2::varchar = 'completed' THEN NOW() ELSE completed_at END
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

  // ─── ELIGIBLE WINNERS ─────────────────────────────────────────────────────
  async getEligibleMembers(db: Pool, groupId: string, branchId: string): Promise<any[]> {
    const groupCheck = await db.query(
      'SELECT id FROM agila_chit_groups WHERE id = $1 AND branch_id = $2',
      [groupId, branchId]
    );
    if (groupCheck.rows.length === 0) throw new NotFoundError('Group not found');

    const result = await db.query(
      // TS: card_number included so the winner picker can label duplicate-customer cards
      `SELECT m.id, m.customer_id, m.card_number, m.paying_half, m.status, m.has_won,
              c.name AS customer_name, c.phone AS customer_phone, c.customer_code
       FROM agila_chit_members m
       JOIN customers c ON c.id = m.customer_id
       WHERE m.group_id = $1 AND m.status = 'active' AND m.has_won = false
       ORDER BY c.name ASC, m.card_number ASC`,
      [groupId]
    );
    return result.rows;
  },
};
