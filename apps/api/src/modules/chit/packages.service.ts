// Agila Chit — package catalogue: list packages and edit their configuration.
// Part of ChitService — composed in ./chit.service.ts; call it through that facade.

import { Pool } from 'pg';
import { CHIT_PACKAGES } from './chit.schema';

export const ChitPackagesService = {
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
};
