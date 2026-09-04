// Aggregates scheme payments across all tables into a per-branch daily-collection
// report used by the MD money dashboard.
//
// Columns returned match the UI table:
//   entries       — rows entered on the selected date
//   cash / bank / gpay  — payment-mode split for the selected date
//   uptoYesterday — total from period start (7th) up to (not incl.) selected date
//   today         — total for the selected date
//   total         — uptoYesterday + today
//
// Land scheme is intentionally excluded — it uses a distinct payment_mode enum
// (full_payment / advance_full_payment) with no cash/bank/GPay split, consistent
// with migration 076 which also excluded it.

import type { Pool } from 'pg';
import { getCompanyToday } from '../../shared/date';
import { getPeriodStartForDate } from '../../shared/scheme-period';
import { ValidationError } from '../../shared/errors';

export interface DailyCollectionRow {
  branchId:      string;
  branchName:    string;
  entries:       number;
  cash:          number;
  bank:          number;
  gpay:          number;
  uptoYesterday: number;
  today:         number;
  total:         number;
}

export interface DailyCollectionResult {
  date:        string;
  periodStart: string;
  rows:        DailyCollectionRow[];
}

export interface DailyCollectionSchemeRow {
  schemeLabel:   string;
  uptoYesterday: number;
  today:         number;
  total:         number;
}

export interface DailyCollectionBySchemeResult {
  date:        string;
  periodStart: string;
  branchId:    string;
  branchName:  string;
  rows:        DailyCollectionSchemeRow[];
}

// TS: helper to build the CASE expression that splits cash_bank rows into cash/bank columns.
// The pattern is the same across all tables so we generate it rather than repeating it.
function splitCases(amtCol: string, cashCol: string, bankCol: string) {
  return `
    CASE payment_mode
      WHEN 'cash'         THEN ${amtCol}
      WHEN 'cash_bank'    THEN COALESCE(${cashCol}, 0)
      ELSE 0
    END AS cash,
    CASE payment_mode
      WHEN 'bank_receipt' THEN ${amtCol}
      WHEN 'cash_bank'    THEN COALESCE(${bankCol}, 0)
      ELSE 0
    END AS bank,
    CASE payment_mode WHEN 'gpay' THEN ${amtCol} ELSE 0 END AS gpay
  `.trim();
}

export async function getDailyCollection(
  db:       Pool,
  date?:    string,
  branchId?: string,
): Promise<DailyCollectionResult> {
  // TS: selectedDate defaults to IST today; periodStart drives the "from the 7th" window.
  const selectedDate = date ?? getCompanyToday();
  const periodStart  = getPeriodStartForDate(selectedDate);

  // TS: parameterise branchId filter only when provided to avoid runtime uuid cast errors.
  const branchFilter = branchId ? 'AND p.branch_id = $3::uuid' : '';
  const params: string[] = [selectedDate, periodStart];
  if (branchId) params.push(branchId);

  const sql = `
    WITH payments AS (

      -- gold_scheme_payments (installment / full payments on the scheme)
      SELECT gm.branch_id, p.paid_date AS pdate,
        ${splitCases('p.amount', 'p.cash_amount', 'p.bank_amount')}
      FROM gold_scheme_payments p
      JOIN gold_scheme_members gm ON gm.id = p.member_id
      WHERE p.paid_date >= $2::date AND p.paid_date <= $1::date

      UNION ALL

      -- trading_academy_members (single-payment enrolment)
      SELECT branch_id, enrollment_date AS pdate,
        ${splitCases('amount', 'cash_amount', 'bank_amount')}
      FROM trading_academy_members
      WHERE enrollment_date >= $2::date AND enrollment_date <= $1::date

      UNION ALL

      -- gold_coin_slots (per-slot payment; paid_at is a timestamptz)
      SELECT branch_id, paid_at::date AS pdate,
        ${splitCases('amount_paid', 'cash_amount', 'bank_amount')}
      FROM gold_coin_slots
      WHERE paid_at IS NOT NULL
        AND paid_at::date >= $2::date AND paid_at::date <= $1::date

      UNION ALL

      -- lss_slots (per-slot payment; paid_at is a timestamptz)
      SELECT branch_id, paid_at::date AS pdate,
        ${splitCases('amount_paid', 'cash_amount', 'bank_amount')}
      FROM lss_slots
      WHERE paid_at IS NOT NULL
        AND paid_at::date >= $2::date AND paid_at::date <= $1::date

      UNION ALL

      -- agila_chit_payments (monthly instalment; branch via member → group)
      SELECT acg.branch_id, p.payment_date AS pdate,
        ${splitCases('p.amount', 'p.cash_amount', 'p.bank_amount')}
      FROM agila_chit_payments p
      JOIN agila_chit_members acm ON acm.id = p.member_id
      JOIN agila_chit_groups  acg ON acg.id = acm.group_id
      WHERE p.payment_date >= $2::date AND p.payment_date <= $1::date

      UNION ALL

      -- builders_payouts (recurring payout instalments; branch via plan)
      SELECT bp.branch_id, p.payout_date AS pdate,
        ${splitCases('p.amount', 'p.cash_amount', 'p.bank_amount')}
      FROM builders_payouts p
      JOIN builders_plans bp ON bp.id = p.plan_id
      WHERE p.payout_date >= $2::date AND p.payout_date <= $1::date

      UNION ALL

      -- builders_plans lump-sum (one-time upfront investment; uses lump_sum_* columns)
      SELECT branch_id, lump_sum_date AS pdate,
        CASE lump_sum_mode
          WHEN 'cash'         THEN investment_amount
          WHEN 'cash_bank'    THEN COALESCE(lump_sum_cash_amount, 0)
          ELSE 0
        END AS cash,
        CASE lump_sum_mode
          WHEN 'bank_receipt' THEN investment_amount
          WHEN 'cash_bank'    THEN COALESCE(lump_sum_bank_amount, 0)
          ELSE 0
        END AS bank,
        CASE lump_sum_mode WHEN 'gpay' THEN investment_amount ELSE 0 END AS gpay
      FROM builders_plans
      WHERE lump_sum_date IS NOT NULL AND lump_sum_mode IS NOT NULL
        AND lump_sum_date >= $2::date AND lump_sum_date <= $1::date

    )
    SELECT
      p.branch_id                                                                            AS "branchId",
      b.name                                                                                 AS "branchName",
      COALESCE(COUNT(*)           FILTER (WHERE p.pdate = $1::date), 0)                     AS entries,
      COALESCE(SUM(p.cash)        FILTER (WHERE p.pdate = $1::date), 0)                     AS cash,
      COALESCE(SUM(p.bank)        FILTER (WHERE p.pdate = $1::date), 0)                     AS bank,
      COALESCE(SUM(p.gpay)        FILTER (WHERE p.pdate = $1::date), 0)                     AS gpay,
      COALESCE(SUM(p.cash + p.bank + p.gpay) FILTER (WHERE p.pdate < $1::date),  0)         AS "uptoYesterday",
      COALESCE(SUM(p.cash + p.bank + p.gpay) FILTER (WHERE p.pdate = $1::date),  0)         AS today,
      COALESCE(SUM(p.cash + p.bank + p.gpay), 0)                                            AS total
    FROM payments p
    JOIN branches b ON b.id = p.branch_id
    ${branchFilter}
    GROUP BY p.branch_id, b.name
    ORDER BY b.name ASC
  `;

  const res = await db.query<Record<string, unknown>>(sql, params);

  return {
    date:        selectedDate,
    periodStart,
    rows: res.rows.map((r) => ({
      branchId:      String(r.branchId),
      branchName:    String(r.branchName),
      entries:       Number(r.entries),
      cash:          parseFloat(String(r.cash)),
      bank:          parseFloat(String(r.bank)),
      gpay:          parseFloat(String(r.gpay)),
      uptoYesterday: parseFloat(String(r.uptoYesterday)),
      today:         parseFloat(String(r.today)),
      total:         parseFloat(String(r.total)),
    })),
  };
}

// Per-scheme breakdown for a single branch. Returns one row per scheme type
// (including gold new/renewal split and chit new/renewal split via month_number).
// Land is included as a static zero row — it uses a different payment model.
export async function getDailyCollectionByScheme(
  db:       Pool,
  date?:    string,
  branchId?: string,
): Promise<DailyCollectionBySchemeResult> {
  // TS: branchId is mandatory — ValidationError maps to 400 at every call site.
  if (!branchId) throw new ValidationError('branchId is required for per-scheme breakdown');

  const selectedDate = date ?? getCompanyToday();
  const periodStart  = getPeriodStartForDate(selectedDate);
  const params: string[] = [selectedDate, periodStart, branchId];

  // TS: fetch branch name in a separate cheap query to keep the main SQL readable.
  const branchRes = await db.query<{ name: string }>(
    'SELECT name FROM branches WHERE id = $1::uuid',
    [branchId],
  );
  const branchName = branchRes.rows[0]?.name ?? branchId;

  const sql = `
    WITH scheme_list(scheme_label, ord) AS (
      VALUES
        ('Monthly Gold Renewal',    1),
        ('Monthly Gold New',        2),
        ('Gold Coin Savings',       3),
        ('Jewel Savings',           4),
        ('Global Vetri Chit New',   5),
        ('Global Vetri Chit Renewal', 6),
        ('Trading Academy',         7),
        ('Land',                    8),
        ('Builders',                9)
    ),
    payments AS (

      -- Gold Renewal: payments from month 2 onward
      SELECT 'Monthly Gold Renewal' AS scheme_label, gsp.paid_date AS pdate, gsp.amount AS amt
      FROM gold_scheme_payments gsp
      JOIN gold_scheme_members gsm ON gsm.id = gsp.member_id
      WHERE gsm.branch_id = $3::uuid
        AND gsp.paid_date >= $2::date AND gsp.paid_date <= $1::date
        AND gsp.month_number > 1

      UNION ALL

      -- Gold New: first-month enrollment payment
      SELECT 'Monthly Gold New', gsp.paid_date, gsp.amount
      FROM gold_scheme_payments gsp
      JOIN gold_scheme_members gsm ON gsm.id = gsp.member_id
      WHERE gsm.branch_id = $3::uuid
        AND gsp.paid_date >= $2::date AND gsp.paid_date <= $1::date
        AND gsp.month_number = 1

      UNION ALL

      -- Gold Coin Savings
      SELECT 'Gold Coin Savings', gcs.paid_at::date, gcs.amount_paid
      FROM gold_coin_slots gcs
      WHERE gcs.branch_id = $3::uuid
        AND gcs.paid_at IS NOT NULL
        AND gcs.paid_at::date >= $2::date AND gcs.paid_at::date <= $1::date

      UNION ALL

      -- Jewel Savings (LSS)
      SELECT 'Jewel Savings', ls.paid_at::date, ls.amount_paid
      FROM lss_slots ls
      WHERE ls.branch_id = $3::uuid
        AND ls.paid_at IS NOT NULL
        AND ls.paid_at::date >= $2::date AND ls.paid_at::date <= $1::date

      UNION ALL

      -- Chit New: first enrollment payment
      SELECT 'Global Vetri Chit New', acp.payment_date, acp.amount
      FROM agila_chit_payments acp
      JOIN agila_chit_members acm ON acm.id = acp.member_id
      JOIN agila_chit_groups  acg ON acg.id = acm.group_id
      WHERE acg.branch_id = $3::uuid
        AND acp.payment_date >= $2::date AND acp.payment_date <= $1::date
        AND acp.month_number = 1

      UNION ALL

      -- Chit Renewal: subsequent monthly payments
      SELECT 'Global Vetri Chit Renewal', acp.payment_date, acp.amount
      FROM agila_chit_payments acp
      JOIN agila_chit_members acm ON acm.id = acp.member_id
      JOIN agila_chit_groups  acg ON acg.id = acm.group_id
      WHERE acg.branch_id = $3::uuid
        AND acp.payment_date >= $2::date AND acp.payment_date <= $1::date
        AND acp.month_number > 1

      UNION ALL

      -- Trading Academy (single-payment enrollment)
      SELECT 'Trading Academy', tam.enrollment_date, tam.amount
      FROM trading_academy_members tam
      WHERE tam.branch_id = $3::uuid
        AND tam.enrollment_date >= $2::date AND tam.enrollment_date <= $1::date

      UNION ALL

      -- Builders payouts (recurring instalments)
      SELECT 'Builders', bp.payout_date, bp.amount
      FROM builders_payouts bp
      JOIN builders_plans bpl ON bpl.id = bp.plan_id
      WHERE bpl.branch_id = $3::uuid
        AND bp.payout_date >= $2::date AND bp.payout_date <= $1::date

      UNION ALL

      -- Builders lump-sum (one-time investment)
      SELECT 'Builders', bpl.lump_sum_date, bpl.investment_amount
      FROM builders_plans bpl
      WHERE bpl.branch_id = $3::uuid
        AND bpl.lump_sum_date IS NOT NULL AND bpl.lump_sum_mode IS NOT NULL
        AND bpl.lump_sum_date >= $2::date AND bpl.lump_sum_date <= $1::date

      -- Land is intentionally omitted: it uses a different payment model
      -- and is represented as zeros via the LEFT JOIN below.

    )
    SELECT
      sl.scheme_label                                                                AS "schemeLabel",
      COALESCE(SUM(p.amt) FILTER (WHERE p.pdate < $1::date),  0)                   AS "uptoYesterday",
      COALESCE(SUM(p.amt) FILTER (WHERE p.pdate = $1::date),  0)                   AS today,
      COALESCE(SUM(p.amt), 0)                                                       AS total
    FROM scheme_list sl
    LEFT JOIN payments p ON p.scheme_label = sl.scheme_label
    GROUP BY sl.scheme_label, sl.ord
    ORDER BY sl.ord
  `;

  const res = await db.query<Record<string, unknown>>(sql, params);

  return {
    date:        selectedDate,
    periodStart,
    branchId,
    branchName,
    rows: res.rows.map((r) => ({
      schemeLabel:   String(r.schemeLabel),
      uptoYesterday: parseFloat(String(r.uptoYesterday)),
      today:         parseFloat(String(r.today)),
      total:         parseFloat(String(r.total)),
    })),
  };
}
