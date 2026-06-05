// Audit helper for the Land Sales module.
//
// Every state-changing operation in land-sites, land-customers, and land-bookings
// calls LandAuditService.log() so the MD can trace exactly who changed what and when.
// old_values / new_values are JSONB snapshots; financial edits capture the delta.
//
// The log table is append-only — rows are never updated or deleted.

import { Pool, PoolClient } from 'pg';
import type { ListAuditQuery } from './land.schema';

export type LandEntity = 'site' | 'plot' | 'customer' | 'booking' | 'payout';
export type LandAction =
  | 'create' | 'update' | 'cancel'
  | 'advance_payment' | 'full_payment'
  | 'deadline_extended' | 'payout_paid';

export interface AuditLogArgs {
  entity:    LandEntity;
  recordId:  string;
  action:    LandAction;
  changedBy: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
}

export const LandAuditService = {

  async log(
    db: Pool | PoolClient,
    args: AuditLogArgs
  ): Promise<void> {
    await db.query(
      `INSERT INTO land_audit_log
         (entity, record_id, action, changed_by, old_values, new_values)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        args.entity,
        args.recordId,
        args.action,
        args.changedBy,
        args.oldValues ? JSON.stringify(args.oldValues) : null,
        args.newValues ? JSON.stringify(args.newValues) : null,
      ]
    );
  },

  async getLog(
    db: Pool,
    query: ListAuditQuery
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [];
    const conditions: string[] = [];
    let idx = 1;

    if (query.entity) {
      conditions.push(`a.entity = $${idx++}`);
      params.push(query.entity);
    }
    if (query.recordId) {
      conditions.push(`a.record_id = $${idx++}`);
      params.push(query.recordId);
    }
    if (query.startDate) {
      conditions.push(`a.created_at >= $${idx++}::date`);
      params.push(query.startDate);
    }
    if (query.endDate) {
      conditions.push(`a.created_at < ($${idx++}::date + INTERVAL '1 day')`);
      params.push(query.endDate);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await db.query(
      `SELECT COUNT(*) FROM land_audit_log a ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT a.*, u.name AS changed_by_name, u.role AS changed_by_role
       FROM land_audit_log a
       JOIN users u ON u.id = a.changed_by
       ${where}
       ORDER BY a.created_at DESC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },
};
