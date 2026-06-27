import { Pool, PoolClient } from 'pg';
import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors';
import { runInTransaction } from '../../shared/transaction-helper';
import { getCompanyToday } from '../../shared/date';
import { GoldService } from '../gold/gold.service';
import { TradingAcademyService } from '../trading-academy/trading-academy.service';
import { ChitService } from '../chit/chit.service';
import { BuildersService } from '../builders/builders.service';
import { SlotsService as GoldCoinSlotsService } from '../gold-coin/slots.service';
import { SlotsService as LssSlotsService } from '../lss/slots.service';
import type {
  CreatePendingEnrollmentInput,
  AddPendingPaymentInput,
  ListPendingEnrollmentsQuery,
} from './pending-enrollments.schema';

// Payment fields synthesised from the installment ledger at completion. The real
// per-installment modes / splits / proofs stay in the ledger; the started entity
// records ONE enrollment payment of the required amount. Mode collapses to the single
// installment mode when uniform (and not cash_bank), else 'cash' — the entity row never
// carries a cash_bank split (that detail lives in the ledger), which also avoids the
// per-table cash_bank sum CHECK on a row whose amount is the scheme total.
type Synth = { mode: string; proofKey: string[]; transactionId: string[] };

interface SchemeAdapter {
  entityTable: string;
  // Required enrollment amount (may need a DB lookup for package/group-derived amounts).
  requiredAmount(db: Pool, branchId: string, payload: any): Promise<number>;
  // Replay the stored payload (with synthesised payment fields + today's date) through the
  // scheme's existing create fn, inside the caller's transaction. Returns the new entity id.
  complete(
    client: PoolClient, db: Pool, enteredBy: string, branchId: string,
    payload: any, required: number, synth: Synth, today: string,
  ): Promise<string>;
}

const ADAPTERS: Record<string, SchemeAdapter> = {
  gold_scheme: {
    entityTable: 'gold_scheme_members',
    requiredAmount: async (_db, _b, p) => Number(p.monthlyAmount),
    complete: async (client, db, enteredBy, branchId, p, required, synth, today) => {
      const full = {
        ...p, monthlyAmount: required, startDate: today,
        firstPaymentMode: synth.mode, firstPaymentProofKey: synth.proofKey, firstPaymentTransactionId: synth.transactionId,
      };
      const res = await GoldService.addMember(db, enteredBy, branchId, full as any, client);
      return res.member.id;
    },
  },
  trading_academy: {
    entityTable: 'trading_academy_members',
    requiredAmount: async (_db, _b, p) => Number(p.amount),
    complete: async (client, db, enteredBy, branchId, p, required, synth, today) => {
      const full = {
        ...p, amount: required, enrollmentDate: today,
        paymentMode: synth.mode, proofKey: synth.proofKey, transactionId: synth.transactionId,
      };
      const res = await TradingAcademyService.addMember(db, enteredBy, branchId, full as any, client);
      return res.member.id;
    },
  },
  builders_scheme: {
    entityTable: 'builders_plans',
    requiredAmount: async (db, _b, p) => {
      const pkgs = await BuildersService.getPackages(db);
      const pkg = pkgs[p.packageNumber];
      if (!pkg) throw new ValidationError('Invalid package number');
      return Number(pkg.investmentAmount);
    },
    complete: async (client, db, enteredBy, branchId, p, _required, synth, today) => {
      const full = {
        ...p, lumpSumDate: today,
        lumpSumMode: synth.mode, lumpSumProofKey: synth.proofKey, lumpSumTransactionId: synth.transactionId,
      };
      const res = await BuildersService.createPlan(db, enteredBy, branchId, full as any, client);
      return res.plan.id;
    },
  },
  agila_chit_scheme: {
    entityTable: 'agila_chit_members',
    requiredAmount: async (db, branchId, p) => {
      const r = await db.query('SELECT full_amount FROM agila_chit_groups WHERE id = $1 AND branch_id = $2', [p.groupId, branchId]);
      if (r.rows.length === 0) throw new NotFoundError('Chit group not found in this branch');
      return Number(r.rows[0].full_amount);
    },
    complete: async (client, db, enteredBy, branchId, p, _required, synth, today) => {
      const full = {
        ...p, firstPaymentDate: today,
        firstPaymentMode: synth.mode, firstPaymentProofKey: synth.proofKey, firstPaymentTransactionId: synth.transactionId,
      };
      const res = await ChitService.addMember(db, enteredBy, p.groupId, branchId, full as any, client);
      return res.member.id;
    },
  },
  gold_coin_scheme: {
    entityTable: 'gold_coin_slots',
    requiredAmount: async (db, _b, p) => {
      const r = await db.query('SELECT price FROM gold_coin_packages WHERE id = $1 AND is_active = true', [p.packageId]);
      if (r.rows.length === 0) throw new NotFoundError('Gold coin package not found or inactive');
      return Number(r.rows[0].price) * (Number(p.quantity) || 1);
    },
    complete: async (client, db, enteredBy, branchId, p, required, synth, today) => {
      // No slot was reserved — re-read the CURRENT price; createSlot requires amountPaid == price.
      const r = await client.query('SELECT price FROM gold_coin_packages WHERE id = $1 AND is_active = true', [p.packageId]);
      if (r.rows.length === 0) throw new NotFoundError('Gold coin package not found or inactive');
      const price = Number(r.rows[0].price);
      const qty = Number(p.quantity) || 1;
      if (price * qty > required + 0.01) {
        throw new ValidationError(`Package price increased — collect ₹${(price * qty - required).toFixed(2)} more before starting the slot`);
      }
      const full = {
        ...p, amountPaid: price, saleDate: today,
        paymentMode: synth.mode, proofKey: synth.proofKey, transactionId: synth.transactionId,
      };
      const res = await GoldCoinSlotsService.createSlot(db, branchId, enteredBy, full as any, client);
      return res.slots[0].id;
    },
  },
  lss_scheme: {
    entityTable: 'lss_slots',
    requiredAmount: async (db, _b, p) => {
      const r = await db.query('SELECT price FROM lss_plans WHERE id = $1 AND is_active = true', [p.planId]);
      if (r.rows.length === 0) throw new NotFoundError('LSS plan not found or inactive');
      return Number(r.rows[0].price) * (Number(p.quantity) || 1);
    },
    complete: async (client, db, enteredBy, branchId, p, required, synth, today) => {
      const r = await client.query('SELECT price FROM lss_plans WHERE id = $1 AND is_active = true', [p.planId]);
      if (r.rows.length === 0) throw new NotFoundError('LSS plan not found or inactive');
      const price = Number(r.rows[0].price);
      const qty = Number(p.quantity) || 1;
      if (price * qty > required + 0.01) {
        throw new ValidationError(`Plan price increased — collect ₹${(price * qty - required).toFixed(2)} more before starting the slot`);
      }
      const full = {
        ...p, amountPaid: price, saleDate: today,
        paymentMode: synth.mode, proofKey: synth.proofKey, transactionId: synth.transactionId,
      };
      const res = await LssSlotsService.createSlot(db, branchId, enteredBy, full as any, client);
      return res.slots[0].id;
    },
  },
};

export const PendingEnrollmentsService = {

  // ─── CREATE (open a pending enrollment with its first deposit) ───────────────
  async createPending(
    db: Pool, enteredBy: string, branchId: string, input: CreatePendingEnrollmentInput,
  ): Promise<{ pendingId: string; completion: any }> {
    const adapter = ADAPTERS[input.schemeCode];
    if (!adapter) throw new ValidationError('Unsupported scheme for partial enrollment');

    const cust = await db.query('SELECT id FROM customers WHERE id = $1 AND branch_id = $2', [input.customerId, branchId]);
    if (cust.rows.length === 0) throw new NotFoundError('Customer not found in this branch');
    if (input.referrerId) {
      const ref = await db.query('SELECT id FROM users WHERE id = $1', [input.referrerId]);
      if (ref.rows.length === 0) throw new NotFoundError('Referrer not found');
    }

    const payloadWithIds = { ...input.payload, customerId: input.customerId, referrerId: input.referrerId };
    const required = await adapter.requiredAmount(db, branchId, payloadWithIds);
    if (!(required > 0)) throw new ValidationError('Could not determine the required amount for this scheme');
    if (input.firstPayment.amount > required + 0.01) throw new ValidationError('Deposit cannot exceed the required amount');

    const pendingId: string = await runInTransaction(db, async (client) => {
      const peRes = await client.query(
        `INSERT INTO pending_enrollments
           (scheme_code, branch_id, customer_id, referrer_id, required_amount, amount_paid, status, payload, entered_by)
         VALUES ($1, $2, $3, $4, $5, 0, 'collecting', $6, $7)
         RETURNING id`,
        [input.schemeCode, branchId, input.customerId, input.referrerId ?? null, required, JSON.stringify(input.payload), enteredBy],
      );
      const id = peRes.rows[0].id;
      await PendingEnrollmentsService._recordPayment(client, id, input.firstPayment, enteredBy);
      return id;
    });

    const completion = await PendingEnrollmentsService._maybeComplete(db, pendingId, enteredBy);
    return { pendingId, completion };
  },

  // ─── ADD a later part-payment ────────────────────────────────────────────────
  async addPayment(
    db: Pool, enteredBy: string, branchId: string, pendingId: string, payment: AddPendingPaymentInput,
  ): Promise<{ pendingId: string; completion: any }> {
    await runInTransaction(db, async (client) => {
      const owner = await client.query('SELECT branch_id FROM pending_enrollments WHERE id = $1', [pendingId]);
      if (owner.rows.length === 0) throw new NotFoundError('Pending enrollment not found');
      if (owner.rows[0].branch_id !== branchId) throw new ForbiddenError('Pending enrollment belongs to another branch');
      await PendingEnrollmentsService._recordPayment(client, pendingId, payment, enteredBy);
    });
    const completion = await PendingEnrollmentsService._maybeComplete(db, pendingId, enteredBy);
    return { pendingId, completion };
  },

  // Insert one ledger row + bump amount_paid. Caps the payment at the remaining balance
  // so amount_paid can never exceed required (no overpayment / surplus to reconcile).
  async _recordPayment(client: PoolClient, pendingId: string, payment: AddPendingPaymentInput, enteredBy: string): Promise<void> {
    const peRes = await client.query(
      'SELECT amount_paid, required_amount, status FROM pending_enrollments WHERE id = $1 FOR UPDATE',
      [pendingId],
    );
    if (peRes.rows.length === 0) throw new NotFoundError('Pending enrollment not found');
    const pe = peRes.rows[0];
    if (pe.status !== 'collecting') throw new ValidationError(`Cannot add a payment to a ${pe.status} enrollment`);
    const remaining = Number(pe.required_amount) - Number(pe.amount_paid);
    if (payment.amount > remaining + 0.01) {
      throw new ValidationError(`Payment exceeds the remaining balance (₹${remaining.toFixed(2)})`);
    }
    await client.query(
      `INSERT INTO pending_enrollment_payments
         (pending_enrollment_id, amount, payment_mode, cash_amount, bank_amount, proof_key, transaction_id, paid_date, entered_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        pendingId, payment.amount, payment.paymentMode,
        payment.paymentMode === 'cash_bank' ? payment.cashAmount : null,
        payment.paymentMode === 'cash_bank' ? payment.bankAmount : null,
        payment.proofKey?.length ? payment.proofKey : null,
        payment.transactionId?.length ? payment.transactionId : null,
        payment.paidDate, enteredBy,
      ],
    );
    await client.query('UPDATE pending_enrollments SET amount_paid = amount_paid + $2, updated_at = now() WHERE id = $1', [pendingId, payment.amount]);
  },

  // Trigger completion only when the balance is cleared (idempotent — safe to call always).
  async _maybeComplete(db: Pool, pendingId: string, enteredBy: string): Promise<any> {
    const fresh = await db.query('SELECT amount_paid, required_amount, status FROM pending_enrollments WHERE id = $1', [pendingId]);
    const row = fresh.rows[0];
    if (row && row.status === 'collecting' && Number(row.amount_paid) >= Number(row.required_amount)) {
      return PendingEnrollmentsService.completeEnrollment(db, pendingId, enteredBy);
    }
    return null;
  },

  // ─── COMPLETION (start the scheme — exactly once, atomic) ─────────────────────
  async completeEnrollment(db: Pool, pendingId: string, enteredBy: string): Promise<any> {
    try {
      return await runInTransaction(db, async (client) => {
        // Atomic claim — only one caller can move 'collecting' → 'completing'.
        const claimed = await client.query(
          `UPDATE pending_enrollments SET status = 'completing', updated_at = now()
           WHERE id = $1 AND status = 'collecting' AND amount_paid >= required_amount
           RETURNING *`,
          [pendingId],
        );
        if (claimed.rowCount === 0) return null;   // already taken / not ready — no-op
        const pe = claimed.rows[0];

        const adapter = ADAPTERS[pe.scheme_code];
        if (!adapter) throw new ValidationError(`Unsupported scheme ${pe.scheme_code}`);

        // Synthesise the single enrollment payment from the installment ledger.
        const pays = (await client.query(
          'SELECT payment_mode, proof_key, transaction_id FROM pending_enrollment_payments WHERE pending_enrollment_id = $1 ORDER BY created_at',
          [pe.id],
        )).rows;
        const modes = Array.from(new Set(pays.map((r: any) => r.payment_mode)));
        const synth: Synth = {
          mode: (modes.length === 1 && modes[0] !== 'cash_bank') ? modes[0] : 'cash',
          proofKey: pays.flatMap((r: any) => r.proof_key || []),
          transactionId: pays.flatMap((r: any) => r.transaction_id || []),
        };

        const today = getCompanyToday();
        const payload = { ...pe.payload, customerId: pe.customer_id, referrerId: pe.referrer_id ?? undefined };
        const entityId = await adapter.complete(client, db, enteredBy, pe.branch_id, payload, Number(pe.required_amount), synth, today);

        // Exactly-once link (UNIQUE pending_enrollment_id) — a racing completion rolls back here.
        await client.query(`UPDATE ${adapter.entityTable} SET pending_enrollment_id = $1 WHERE id = $2`, [pe.id, entityId]);
        await client.query(
          `UPDATE pending_enrollments SET status = 'completed', created_entity_id = $1, updated_at = now() WHERE id = $2`,
          [entityId, pe.id],
        );
        return { entityId, entityTable: adapter.entityTable };
      });
    } catch (err: any) {
      // Surface a failed completion to the admin; the failing tx already rolled back
      // (no orphan entity / incentive). Separate tx so the failure record persists.
      await db.query(
        `UPDATE pending_enrollments SET status = 'completion_failed', failure_reason = $2, updated_at = now()
         WHERE id = $1 AND status IN ('collecting', 'completing')`,
        [pendingId, String(err?.message ?? err).slice(0, 500)],
      );
      throw err;
    }
  },

  // ─── CANCEL ───────────────────────────────────────────────────────────────────
  async cancel(db: Pool, branchId: string, pendingId: string): Promise<any> {
    const res = await db.query(
      `UPDATE pending_enrollments SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND branch_id = $2 AND status IN ('collecting', 'completion_failed')
       RETURNING *`,
      [pendingId, branchId],
    );
    if (res.rows.length === 0) throw new NotFoundError('Pending enrollment not found or not cancellable');
    return res.rows[0];
  },

  // ─── RETRY a failed completion ─────────────────────────────────────────────────
  async retry(db: Pool, enteredBy: string, branchId: string, pendingId: string): Promise<any> {
    const reset = await db.query(
      `UPDATE pending_enrollments SET status = 'collecting', failure_reason = NULL, updated_at = now()
       WHERE id = $1 AND branch_id = $2 AND status = 'completion_failed'
       RETURNING id`,
      [pendingId, branchId],
    );
    if (reset.rows.length === 0) throw new NotFoundError('No failed completion to retry');
    const completion = await PendingEnrollmentsService.completeEnrollment(db, pendingId, enteredBy);
    return { pendingId, completion };
  },

  // ─── LIST / GET ─────────────────────────────────────────────────────────────
  async list(db: Pool, branchId: string, query: ListPendingEnrollmentsQuery): Promise<{ data: any[]; total: number; summary: any }> {
    const params: any[] = [branchId];
    let where = 'WHERE pe.branch_id = $1';
    if (query.schemeCode) { params.push(query.schemeCode); where += ` AND pe.scheme_code = $${params.length}`; }
    if (query.status)     { params.push(query.status);     where += ` AND pe.status = $${params.length}`; }
    if (query.search)     { params.push(`%${query.search}%`); where += ` AND (c.name ILIKE $${params.length} OR c.customer_code ILIKE $${params.length})`; }
    // Date range filters on the enrollment/deposit date (created_at); end is inclusive.
    if (query.startDate)  { params.push(query.startDate); where += ` AND pe.created_at >= $${params.length}::date`; }
    if (query.endDate)    { params.push(query.endDate);   where += ` AND pe.created_at < ($${params.length}::date + INTERVAL '1 day')`; }

    const offset = (query.page - 1) * query.limit;
    const data = await db.query(
      `SELECT pe.*, c.name AS customer_name, c.customer_code,
              (pe.required_amount - pe.amount_paid) AS remaining
       FROM pending_enrollments pe
       JOIN customers c ON c.id = pe.customer_id
       ${where}
       ORDER BY pe.created_at DESC
       LIMIT ${query.limit} OFFSET ${offset}`,
      params,
    );
    // Per-scheme aggregate over the SAME filter set (respects status/scheme/search/date).
    const agg = await db.query(
      `SELECT pe.scheme_code,
              COUNT(*)::int AS count,
              COALESCE(SUM(pe.amount_paid), 0) AS collected,
              COALESCE(SUM(pe.required_amount - pe.amount_paid), 0) AS remaining
       FROM pending_enrollments pe
       JOIN customers c ON c.id = pe.customer_id
       ${where}
       GROUP BY pe.scheme_code`,
      params,
    );
    const byScheme = agg.rows.map((r: any) => ({
      schemeCode: r.scheme_code, count: r.count, collected: Number(r.collected), remaining: Number(r.remaining),
    }));
    const summary = byScheme.reduce(
      (acc, s) => ({ count: acc.count + s.count, collected: acc.collected + s.collected, remaining: acc.remaining + s.remaining, byScheme }),
      { count: 0, collected: 0, remaining: 0, byScheme },
    );
    const total = summary.count;
    return { data: data.rows, total, summary };
  },

  async get(db: Pool, branchId: string, pendingId: string): Promise<any> {
    const pe = await db.query(
      `SELECT pe.*, c.name AS customer_name, c.customer_code,
              (pe.required_amount - pe.amount_paid) AS remaining
       FROM pending_enrollments pe
       JOIN customers c ON c.id = pe.customer_id
       WHERE pe.id = $1 AND pe.branch_id = $2`,
      [pendingId, branchId],
    );
    if (pe.rows.length === 0) throw new NotFoundError('Pending enrollment not found');
    const payments = await db.query(
      'SELECT * FROM pending_enrollment_payments WHERE pending_enrollment_id = $1 ORDER BY paid_date, created_at',
      [pendingId],
    );
    return { ...pe.rows[0], payments: payments.rows };
  },

  // ─── REPORTING — deposits collected while still 'collecting' (per branch) ──────
  // Money leaves this bucket the instant the enrollment completes (status flips off
  // 'collecting'); the same money then appears under the real scheme. No double count.
  async getOverviewByBranch(
    db: Pool, dateFilter?: { startDate?: string; endDate?: string },
  ): Promise<Array<{ branchId: string; branchName: string; count: number; collected: number }>> {
    const params: any[] = [];
    let where = `pe.status = 'collecting'`;
    if (dateFilter?.startDate) { params.push(dateFilter.startDate); where += ` AND pep.paid_date >= $${params.length}`; }
    if (dateFilter?.endDate)   { params.push(dateFilter.endDate);   where += ` AND pep.paid_date <= $${params.length}`; }
    const res = await db.query(
      `SELECT pe.branch_id, b.name AS branch_name,
              COUNT(DISTINCT pe.id)::int AS count,
              COALESCE(SUM(pep.amount), 0) AS collected
       FROM pending_enrollment_payments pep
       JOIN pending_enrollments pe ON pe.id = pep.pending_enrollment_id
       JOIN branches b ON b.id = pe.branch_id
       WHERE ${where}
       GROUP BY pe.branch_id, b.name`,
      params,
    );
    return res.rows.map((r: any) => ({
      branchId: r.branch_id, branchName: r.branch_name, count: r.count, collected: Number(r.collected),
    }));
  },
};
