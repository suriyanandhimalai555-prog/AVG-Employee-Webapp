import { Pool, PoolClient } from 'pg';
import { NotFoundError, ConflictError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import type { CreateCustomerInput, UpdateCustomerInput, SearchCustomersQuery } from './customers.schema';

export const CustomerService = {

  // ─── AUTO-GENERATE customer_code (atomic, race-condition-safe) ───────────
  // Uses UPDATE...RETURNING on customer_code_sequences so two concurrent inserts
  // always get different numbers. Must be called inside a transaction.
  async nextCustomerCode(client: PoolClient, branchId: string): Promise<string> {
    // Fetch branch prefix
    const prefixResult = await client.query(
      `SELECT client_prefix FROM branches WHERE id = $1`,
      [branchId]
    );
    const prefix: string = prefixResult.rows[0]?.client_prefix ?? 'CST';

    // Atomically increment the sequence counter for this branch.
    // INSERT...ON CONFLICT ensures the row exists; UPDATE increments it.
    const seqResult = await client.query(
      `INSERT INTO customer_code_sequences (branch_id, last_seq)
       VALUES ($1, 1)
       ON CONFLICT (branch_id)
       DO UPDATE SET last_seq = customer_code_sequences.last_seq + 1
       RETURNING last_seq`,
      [branchId]
    );
    const seq: number = seqResult.rows[0].last_seq;
    return `${prefix}${String(seq).padStart(4, '0')}`;
  },

  // ─── FIND BY PHONE (digit-normalised, branch-scoped) ─────────────────────
  // Strips all non-digit characters before comparing so "98765 43210" and
  // "9876543210" are treated as the same number.  Returns null when not found.
  async findByPhone(
    client: PoolClient,
    branchId: string,
    phone: string
  ): Promise<{ id: string; name: string; customer_code: string; phone: string } | null> {
    const result = await client.query(
      `SELECT id, name, customer_code, phone
       FROM customers
       WHERE branch_id = $1
         AND phone IS NOT NULL
         AND regexp_replace(phone, '\\D', '', 'g') = regexp_replace($2, '\\D', '', 'g')
       LIMIT 1`,
      [branchId, phone]
    );
    return result.rows[0] ?? null;
  },

  // ─── CREATE ──────────────────────────────────────────────────────────────
  // Runs inside a transaction to guarantee the code is unique.
  // Checks for a duplicate phone (per branch) before generating the code so
  // a rejected attempt never wastes a sequence number.
  async create(
    db: Pool,
    branchId: string,
    createdBy: string,
    payload: CreateCustomerInput
  ): Promise<any> {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      // Duplicate-phone guard — only when a phone with at least one digit is provided
      if (payload.phone && /\d/.test(payload.phone)) {
        const existing = await CustomerService.findByPhone(client, branchId, payload.phone);
        if (existing) {
          // Throw before nextCustomerCode so no sequence number is consumed
          throw new ConflictError(
            `This number already belongs to ${existing.name} (${existing.customer_code}).`,
            'CUSTOMER_PHONE_EXISTS',
            { customer: existing }
          );
        }
      }

      const customerCode = await CustomerService.nextCustomerCode(client, branchId);

      const result = await client.query(
        `INSERT INTO customers (customer_code, branch_id, name, phone, address, notes, has_whatsapp, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [customerCode, branchId, payload.name, payload.phone ?? null, payload.address ?? null, payload.notes ?? null, payload.has_whatsapp ?? false, createdBy]
      );

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // ─── SEARCH ──────────────────────────────────────────────────────────────
  async search(
    db: Pool,
    branchId: string,
    query: SearchCustomersQuery
  ): Promise<{ data: any[]; total: number }> {
    const params: any[] = [branchId];
    let where = 'c.branch_id = $1';
    let idx = 2;

    if (query.search?.trim()) {
      where += ` AND (c.name ILIKE $${idx} OR c.phone ILIKE $${idx} OR c.customer_code ILIKE $${idx})`;
      params.push(`%${query.search.trim()}%`);
      idx++;
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM customers c WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const dataResult = await db.query(
      `SELECT c.*, u.name AS created_by_name
       FROM customers c
       JOIN users u ON c.created_by = u.id
       WHERE ${where}
       ORDER BY c.name ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, query.limit, (query.page - 1) * query.limit]
    );

    return { data: dataResult.rows, total };
  },

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  // branchId null = org-wide read (md / management without a branch param):
  // the branch filter is dropped. Branch-scoped roles always pass a branchId.
  async getById(db: Pool, id: string, branchId: string | null): Promise<any> {
    const params: unknown[] = [id];
    let where = 'c.id = $1';
    if (branchId !== null) {
      where += ' AND c.branch_id = $2';
      params.push(branchId);
    }
    const result = await db.query(
      `SELECT c.*, u.name AS created_by_name
       FROM customers c
       JOIN users u ON c.created_by = u.id
       WHERE ${where}`,
      params
    );
    if (result.rows.length === 0) throw new NotFoundError('Customer not found');
    return result.rows[0];
  },

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  // Partial update — only the provided fields are changed.  Scoped to the
  // caller's branch so cross-branch edits are impossible even if id is guessed.
  //
  //   BEGIN
  //     SELECT … FOR UPDATE          (lock row, capture old values)
  //     UPDATE customers SET …       (only fields whose value actually changed)
  //     INSERT customers_audit ×N    (one row per changed field — consent evidence)
  //   COMMIT                         (audit exists ⇔ change committed)
  async update(
    db: Pool,
    id: string,
    branchId: string,
    payload: UpdateCustomerInput,
    changedBy: string | null = null
  ): Promise<any> {
    // Optional text columns are nullable in the DB — store cleared values ('')
    // as NULL so "no phone" has a single representation (IS NULL queries stay correct).
    const orNull = (v: string) => (v.trim() === '' ? null : v);

    // Normalised desired values, keyed by column name.
    const desired: Record<string, string | boolean | null> = {};
    if (payload.name         !== undefined) desired.name         = payload.name;
    if (payload.phone        !== undefined) desired.phone        = orNull(payload.phone);
    if (payload.address      !== undefined) desired.address      = orNull(payload.address);
    if (payload.notes        !== undefined) desired.notes        = orNull(payload.notes);
    if (payload.has_whatsapp !== undefined) desired.has_whatsapp = payload.has_whatsapp;

    // Schema .refine() already rejects empty payloads, but guard here for safety
    if (Object.keys(desired).length === 0) throw new NotFoundError('No fields to update');

    return runInTransaction(db, async (client) => {
      const current = await client.query(
        `SELECT * FROM customers WHERE id = $1 AND branch_id = $2 FOR UPDATE`,
        [id, branchId]
      );
      if (current.rows.length === 0) throw new NotFoundError('Customer not found');
      const before = current.rows[0];

      // Only write (and audit) fields whose value actually changes.
      const changed = Object.entries(desired).filter(([col, val]) => before[col] !== val);
      if (changed.length === 0) return before;

      const fields = changed.map(([col], i) => `${col} = $${i + 1}`);
      const vals: unknown[] = changed.map(([, val]) => val);
      vals.push(id, branchId);

      const result = await client.query(
        `UPDATE customers
         SET ${fields.join(', ')}
         WHERE id = $${changed.length + 1} AND branch_id = $${changed.length + 2}
         RETURNING *`,
        vals
      );

      // Audit trail: who changed what, from what, to what (see migration 080).
      for (const [col, val] of changed) {
        await client.query(
          `INSERT INTO customers_audit (customer_id, field, old_value, new_value, changed_by)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, col, before[col] === null ? null : String(before[col]), val === null ? null : String(val), changedBy]
        );
      }

      return result.rows[0];
    });
  },

  // ─── SCHEME HISTORY ───────────────────────────────────────────────────────
  // Returns all scheme enrollments across all scheme tables for a customer.
  async getSchemeHistory(db: Pool, customerId: string): Promise<any[]> {
    const [trading, gold] = await Promise.all([
      db.query(
        `SELECT 'trading_academy' AS scheme, t.id, t.amount, t.enrollment_date AS date,
                t.payment_mode, t.entered_by,
                u.name AS entered_by_name
         FROM trading_academy_members t
         JOIN users u ON t.entered_by = u.id
         WHERE t.customer_id = $1
         ORDER BY t.enrollment_date DESC`,
        [customerId]
      ),
      db.query(
        `SELECT 'gold_scheme' AS scheme, g.id, g.monthly_amount AS amount, g.start_date AS date,
                g.chit_number, g.status,
                u.name AS entered_by_name
         FROM gold_scheme_members g
         JOIN users u ON g.entered_by = u.id
         WHERE g.customer_id = $1
         ORDER BY g.start_date DESC`,
        [customerId]
      ),
    ]);

    return [...trading.rows, ...gold.rows].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },
};
