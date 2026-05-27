// Packages — read-only for now. Seeded by migration 031.
import { Pool } from 'pg';

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

};
