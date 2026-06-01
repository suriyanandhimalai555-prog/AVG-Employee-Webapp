// Plans — read-only. Seeded by migration 038.
import { Pool } from 'pg';

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

};
