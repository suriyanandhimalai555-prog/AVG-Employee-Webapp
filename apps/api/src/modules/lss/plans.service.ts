// Plans — seeded by migration 038; editable by config roles via PATCH /lss/plans/:id.
import { Pool } from 'pg';
import { NotFoundError } from '../../shared/errors';

export interface LSSPlan {
  id:       string;
  name:     string;
  price:    number;
  isActive: boolean;
}

export const PlansService = {

  async listActive(db: Pool): Promise<LSSPlan[]> {
    const res = await db.query(
      `SELECT id, name, price, is_active AS "isActive"
       FROM lss_plans
       WHERE is_active = true
       ORDER BY price ASC`
    );
    return res.rows.map(r => ({ ...r, price: parseFloat(r.price) }));
  },

  // TS: list all plans (including inactive) for the control-center editor
  async listAll(db: Pool): Promise<LSSPlan[]> {
    const res = await db.query(
      `SELECT id, name, price, is_active AS "isActive"
       FROM lss_plans
       ORDER BY price ASC`
    );
    return res.rows.map(r => ({ ...r, price: parseFloat(r.price) }));
  },

  async updatePlan(
    db: Pool,
    id: string,
    payload: { name?: string; price?: number; isActive?: boolean }
  ): Promise<LSSPlan> {
    const fields: string[] = [];
    const values: any[]    = [];
    let idx = 1;
    if (payload.name     != null) { fields.push(`name = $${idx++}`);      values.push(payload.name); }
    if (payload.price    != null) { fields.push(`price = $${idx++}`);     values.push(payload.price); }
    if (payload.isActive != null) { fields.push(`is_active = $${idx++}`); values.push(payload.isActive); }
    if (fields.length === 0) throw new Error('No fields to update');
    values.push(id);
    const res = await db.query(
      `UPDATE lss_plans SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, price, is_active AS "isActive"`,
      values
    );
    if (res.rows.length === 0) throw new NotFoundError('Plan not found');
    const r = res.rows[0];
    return { ...r, price: parseFloat(r.price) };
  },

};
