// scheme-audit.ts
// Single writer for the shared scheme_corrections_audit table.
// Called inside a transaction by every correctXxx / voidXxx service method.
// PoolClient is required (not Pool) so the write is part of the same atomic unit.

import type { Pool, PoolClient } from 'pg';

export type AuditAction = 'edit' | 'void' | 'unpay' | 'remove';

export interface SchemeAuditArgs {
  schemeCode:  string;
  entityType:  'member' | 'payment' | 'plan' | 'payout' | 'slot' | 'booking' | 'room';
  entityId:    string;
  actorId:     string;
  action:      AuditAction;
  oldValues?:  Record<string, unknown>;
  newValues?:  Record<string, unknown>;
  notes?:      string;
}

export const SchemeAudit = {
  // TS: accepts Pool | PoolClient so it can be called both inside and outside
  // a transaction context — though inside a transaction is strongly preferred.
  async log(db: Pool | PoolClient, args: SchemeAuditArgs): Promise<void> {
    await db.query(
      `INSERT INTO scheme_corrections_audit
         (scheme_code, entity_type, entity_id, actor_id, action, old_values, new_values, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        args.schemeCode,
        args.entityType,
        args.entityId,
        args.actorId,
        args.action,
        args.oldValues ? JSON.stringify(args.oldValues) : null,
        args.newValues ? JSON.stringify(args.newValues) : null,
        args.notes ?? null,
      ]
    );
  },
};
