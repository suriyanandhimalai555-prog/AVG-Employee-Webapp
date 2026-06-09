// Packages — seeded by migration 031; editable by config roles via PATCH /packages/:id.
import { Pool } from 'pg';
import { NotFoundError } from '../../shared/errors';

export interface GoldCoinPackage {
  id:         string;
  name:       string;
  price:      number;
  goldGrams:  number;
  isActive:   boolean;
}

export const PackagesService = {

  async listActive(db: Pool): Promise<GoldCoinPackage[]> {
    const res = await db.query(
      `SELECT id, name, price, gold_grams AS "goldGrams", is_active AS "isActive"
       FROM gold_coin_packages
       WHERE is_active = true
       ORDER BY price ASC`
    );
    return res.rows.map(r => ({ ...r, price: parseFloat(r.price), goldGrams: parseFloat(r.goldGrams) }));
  },

  // TS: list all packages (including inactive) for the control-center editor
  async listAll(db: Pool): Promise<GoldCoinPackage[]> {
    const res = await db.query(
      `SELECT id, name, price, gold_grams AS "goldGrams", is_active AS "isActive"
       FROM gold_coin_packages
       ORDER BY price ASC`
    );
    return res.rows.map(r => ({ ...r, price: parseFloat(r.price), goldGrams: parseFloat(r.goldGrams) }));
  },

  async updatePackage(
    db: Pool,
    id: string,
    payload: { name?: string; price?: number; goldGrams?: number; isActive?: boolean }
  ): Promise<GoldCoinPackage> {
    const fields: string[] = [];
    const values: any[]    = [];
    let idx = 1;
    if (payload.name      != null) { fields.push(`name = $${idx++}`);       values.push(payload.name); }
    if (payload.price     != null) { fields.push(`price = $${idx++}`);      values.push(payload.price); }
    if (payload.goldGrams != null) { fields.push(`gold_grams = $${idx++}`); values.push(payload.goldGrams); }
    if (payload.isActive  != null) { fields.push(`is_active = $${idx++}`);  values.push(payload.isActive); }
    if (fields.length === 0) throw new Error('No fields to update');
    values.push(id);
    const res = await db.query(
      `UPDATE gold_coin_packages SET ${fields.join(', ')} WHERE id = $${idx}
       RETURNING id, name, price, gold_grams AS "goldGrams", is_active AS "isActive"`,
      values
    );
    if (res.rows.length === 0) throw new NotFoundError('Package not found');
    const r = res.rows[0];
    return { ...r, price: parseFloat(r.price), goldGrams: parseFloat(r.goldGrams) };
  },

};
