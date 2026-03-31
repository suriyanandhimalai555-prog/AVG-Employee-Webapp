// src/modules/transactions/transaction.service.ts
import { Pool } from 'pg';
import { 
  CreateTransactionInput, 
  UpdateTransactionStatusInput, 
  GetTransactionsQuery 
} from './transaction.schema';
import { ForbiddenError, NotFoundError } from '../../shared/errors';

export const TransactionService = {

  // Create a new transaction (requires audit log after creation)
  async createTransaction(
    db: Pool,
    senderId: string,
    payload: CreateTransactionInput
  ) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      const insertResult = await client.query(
        `INSERT INTO transactions (
          sender_id, receiver_id, amount, category, note, status
        ) VALUES (
          $1, $2, $3, $4, $5, 'pending_acknowledgment'
        ) RETURNING *`,
        [senderId, payload.receiverId, payload.amount, payload.category, payload.note]
      );

      const transaction = insertResult.rows[0];

      // Audit log: Initial creation
      await client.query(
        `INSERT INTO transaction_audit (
          transaction_id, changed_by, old_status, new_status, note
        ) VALUES (
          $1, $2, NULL, 'pending_acknowledgment', 'Transaction created'
        )`,
        [transaction.id, senderId]
      );

      await client.query('COMMIT');
      return transaction;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  // Update status (e.g., Acknowledged, Rejected) and log to audit table
  async updateTransactionStatus(
    db: Pool,
    userId: string,
    transactionId: string,
    payload: UpdateTransactionStatusInput
  ) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      const txResult = await client.query(
        'SELECT status, receiver_id, sender_id FROM transactions WHERE id = $1',
        [transactionId]
      );

      if (txResult.rows.length === 0) {
        throw new NotFoundError('Transaction not found');
      }

      const tx = txResult.rows[0];

      // Only the receiver can update status to acknowledged/rejected/flagged
      if (userId !== tx.receiver_id) {
        throw new ForbiddenError('Only the supervisor/receiver can acknowledge or reject this transaction');
      }

      const updateResult = await client.query(
        `UPDATE transactions SET
          status = $1,
          acknowledged_at = CASE WHEN $1 = 'acknowledged' THEN NOW() ELSE acknowledged_at END
        WHERE id = $2 RETURNING *`,
        [payload.status, transactionId]
      );

      const updatedTx = updateResult.rows[0];

      // Audit Log: Status change
      await client.query(
        `INSERT INTO transaction_audit (
          transaction_id, changed_by, old_status, new_status, note
        ) VALUES (
          $1, $2, $3, $4, $5
        )`,
        [transactionId, userId, tx.status, payload.status, payload.note]
      );

      await client.query('COMMIT');
      return updatedTx;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listTransactions(
    db: Pool,
    userId: string,
    query: GetTransactionsQuery
  ) {
    const { role, status, category, limit, page } = query;
    const offset = (page - 1) * limit;

    let sql = `
      SELECT t.*, u_s.name AS sender_name, u_r.name AS receiver_name
      FROM transactions t
      JOIN users u_s ON t.sender_id = u_s.id
      JOIN users u_r ON t.receiver_id = u_r.id
      WHERE (t.sender_id = $1 OR t.receiver_id = $1)
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (role === 'sender') {
      sql += ` AND t.sender_id = $1`; // Redundant, but just in case
    } else if (role === 'receiver') {
      sql += ` AND t.receiver_id = $1`;
    }

    if (status) {
      sql += ` AND t.status = $${paramIndex++}`;
      params.push(status);
    }
    if (category) {
      sql += ` AND t.category = $${paramIndex++}`;
      params.push(category);
    }

    sql += ` ORDER BY t.submitted_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await db.query(sql, params);
    return result.rows;
  }
};
