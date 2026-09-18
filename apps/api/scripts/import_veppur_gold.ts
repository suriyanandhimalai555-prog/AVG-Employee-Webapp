// apps/api/scripts/import_veppur_gold.ts
//
// Step 2 of the Veppur Monthly Gold Card import.
//
// Self-contained: uses inline SQL only (no app module imports) so there are no
// plugin side effects (Redis connections etc.) when running as a dev script.
//
// Reads "veppur monthly card details.xlsx" (source) and the confirmed referrer
// mapping workbook from step 1, then inserts every card as a gold_scheme_member
// with its full payment history + referrer incentives (dated to the respective
// payment month so they land in the correct 7-to-7 wallet periods).
//
// Run (always dry-run first):
//   cd apps/api
//   npx ts-node scripts/import_veppur_gold.ts \
//     --file "../../Data-documents/veppur monthly card details.xlsx"
//
// Add --map once the referrer mapping is confirmed:
//   npx ts-node scripts/import_veppur_gold.ts \
//     --file "../../Data-documents/veppur monthly card details.xlsx" \
//     --map  "../../veppur_referrer_mapping.xlsx"
//
// Add --commit to write to the database (default is dry-run):
//   npx ts-node scripts/import_veppur_gold.ts ... --commit
//
// Idempotency: cards whose chit_number already exists in Veppur are skipped.

import path        from 'path';
import { Pool, PoolClient } from 'pg';
import XLSX        from 'xlsx';
import dotenv      from 'dotenv';

// ── Config ───────────────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const VEPPUR_BRANCH_ID = 'eff1ddf3-9ece-41c6-a391-355d13a86629';
// Management account is used as entered_by / cancelled_by for all imported rows.
const MGMT_USER_ID     = '188ff3a6-d00d-4400-b3c3-4f1e3db3dbda';
const GOLD_SCHEME_CODE = 'gold_scheme';

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

const fileArg  = getArg('--file');
const mapArg   = getArg('--map');
const isCommit = args.includes('--commit');

if (!fileArg) {
  console.error('Usage: npx ts-node scripts/import_veppur_gold.ts --file <source.xlsx> [--map <mapping.xlsx>] [--commit]');
  process.exit(1);
}

const SOURCE_XLSX  = path.resolve(fileArg);
const MAPPING_XLSX = mapArg ? path.resolve(mapArg) : null;

// ── Date helpers ──────────────────────────────────────────────────────────────

// Convert an Excel date serial to YYYY-MM-DD.
// 25569 = days from Excel epoch (1899-12-30) to Unix epoch (1970-01-01).
// All dates in this file are 2024-2026 so the 1900 leap-year quirk is irrelevant.
function excelSerialToIso(serial: number): string {
  const ms = (serial - 25569) * 86400 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Parse a date that may be a JS Date (from SheetJS), an Excel serial, or a string
// in any of the formats used across this xlsx:
//   "30.9.25" / "7.11.2025"   — dot separator, 2- or 4-digit year
//   "25/10/25" / "09/03/2026" — slash separator, 2- or 4-digit year
//   "5-11-25"                 — hyphen separator (distinct from ISO YYYY-MM-DD)
//   "YYYY-MM-DD"              — already ISO
// Returns null when the value is blank or unparseable.
function parseDate(val: any): string | null {
  if (val === '' || val == null) return null;
  // SheetJS returns Date objects for cells with date cell-type (t:'d')
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  // Excel serial — all dates in this file are post-2020 so serial > 43000
  if (typeof val === 'number' && val > 10000) return excelSerialToIso(val);
  const s = String(val).trim();
  if (!s) return null;
  // Expand 2-digit year: 00–49 → 20xx, 50–99 → 19xx
  const y4 = (raw: string) =>
    raw.length === 2 ? (parseInt(raw, 10) >= 50 ? `19${raw}` : `20${raw}`) : raw;
  // Already ISO YYYY-MM-DD — check first so the leading-4-digit pattern isn't caught by hyphen below
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD.MM.YY or DD.MM.YYYY
  const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dot) return `${y4(dot[3])}-${dot[2].padStart(2, '0')}-${dot[1].padStart(2, '0')}`;
  // DD/MM/YY or DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) return `${y4(slash[3])}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  // DD-MM-YY or DD-MM-YYYY (day must be 1–2 digits to distinguish from ISO YYYY-MM-DD above)
  const hyp = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
  if (hyp) return `${y4(hyp[3])}-${hyp[2].padStart(2, '0')}-${hyp[1].padStart(2, '0')}`;
  return null;
}

// Return YYYY-MM-DD for startDate + n months (clamps overflow to end of month).
function addMonths(startDate: string, n: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + n, d));
  // If day overflowed (e.g. Jan 31 + 1 → Mar 2), rewind to last day of target month
  if (date.getUTCDate() !== d) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

// Normalise a raw phone field to a 10-digit string or null.
function normalisePhone(raw: any): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length === 12) return digits.slice(2);
  return digits.length === 10 ? digits : null;
}

// Round to 2 decimal places (mirrors the app's roundMoney()).
function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

// ── Commission rates ──────────────────────────────────────────────────────────

interface Rates { new: number; renewal: number; }

// Loads the gold commission rates from the DB once at startup.
async function loadGoldRates(db: Pool): Promise<Rates> {
  const res = await db.query<{ role: string; amount: string }>(
    `SELECT r.role, r.amount
     FROM scheme_commission_rules r
     JOIN projects p ON p.id = r.project_id
     WHERE p.code = $1 AND r.rate_type = 'percent'`,
    [GOLD_SCHEME_CODE]
  );
  const rateMap: Record<string, number> = {};
  for (const row of res.rows) rateMap[row.role] = parseFloat(row.amount);
  return {
    new:     rateMap['referrer_new']     ?? 0,
    renewal: rateMap['referrer_renewal'] ?? 0,
  };
}

// ── Referrer mapping ──────────────────────────────────────────────────────────

// Parses the confirmed "Mapping" sheet and returns referrerText → userId (or null).
async function parseReferrerMap(mappingPath: string | null, db: Pool): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  if (!mappingPath) {
    console.log('⚠️  No --map supplied — all referrer links skipped (incentives will NOT be distributed).');
    return map;
  }

  // Build short-8-char-prefix → full user-id lookup
  const empRes = await db.query<{ id: string }>('SELECT id FROM users WHERE is_active');
  const shortToFull = new Map<string, string>();
  for (const { id } of empRes.rows) shortToFull.set(id.slice(0, 8), id);

  const wb   = XLSX.readFile(mappingPath);
  const ws   = wb.Sheets['Mapping'];
  if (!ws) throw new Error('Mapping xlsx must contain a sheet named "Mapping"');
  const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });

  let resolved = 0, none = 0, unknown = 0;
  for (const row of rows.slice(1)) {
    const refText   = String((row as any[])[0] ?? '').trim();
    const confirmed = String((row as any[])[5] ?? '').trim();
    if (!refText) continue;

    if (!confirmed || confirmed.toUpperCase() === 'NONE') {
      map.set(refText, null); none++; continue;
    }
    const match = confirmed.match(/\[ref:([0-9a-f]{8})\]/i);
    if (match) {
      const fullId = shortToFull.get(match[1].toLowerCase());
      if (fullId) { map.set(refText, fullId); resolved++; }
      else { console.warn(`  ⚠️  [ref:${match[1]}] not found for "${refText}" — skipping incentive`); map.set(refText, null); unknown++; }
    } else {
      console.warn(`  ⚠️  Cannot parse confirmed value "${confirmed}" for "${refText}" — skipping incentive`);
      map.set(refText, null); unknown++;
    }
  }
  console.log(`Referrer map: ${resolved} resolved, ${none} NONE, ${unknown} unknown.\n`);
  return map;
}

// ── Customer create (bypasses phone-dup guard intentionally) ──────────────────
//
// The source data has many cards sharing a phone number, so we intentionally skip
// the normal duplicate-phone guard.  Each card gets its own customer record.
async function createCustomerRaw(
  client: PoolClient,
  name: string,
  phone: string | null,
  address: string | null,
): Promise<string> {
  const prefixRes = await client.query<{ client_prefix: string }>(
    'SELECT client_prefix FROM branches WHERE id = $1',
    [VEPPUR_BRANCH_ID]
  );
  const prefix = prefixRes.rows[0]?.client_prefix ?? 'CST';

  const seqRes = await client.query<{ last_seq: number }>(
    `INSERT INTO customer_code_sequences (branch_id, last_seq) VALUES ($1, 1)
     ON CONFLICT (branch_id)
     DO UPDATE SET last_seq = customer_code_sequences.last_seq + 1
     RETURNING last_seq`,
    [VEPPUR_BRANCH_ID]
  );
  const code = `${prefix}${String(seqRes.rows[0].last_seq).padStart(4, '0')}`;

  const res = await client.query<{ id: string }>(
    `INSERT INTO customers (customer_code, branch_id, name, phone, address, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [code, VEPPUR_BRANCH_ID, name, phone, address ?? null, MGMT_USER_ID]
  );
  return res.rows[0].id;
}

// ── Data row types ────────────────────────────────────────────────────────────

interface OngoingRow {
  chitNumber:   string;
  name:         string;
  phone:        string | null;
  address:      string | null;
  referrerText: string;
  amount:       number;
  startDate:    string;
  paidMonths:   number[];   // 1-based list, always includes 1
}

interface CancelRow {
  chitNumber:        string;
  name:              string;
  phone:             string | null;
  address:           string | null;
  referrerText:      string;
  amount:            number;
  startDate:         string;
  cancelledDate:     string;
  monthsPaid:        number;
  totalAmount:       number;
  hasAmountMismatch: boolean;
}

// ── Parse xlsx sheets ─────────────────────────────────────────────────────────

function parseOngoingSheet(wb: XLSX.WorkBook): { rows: OngoingRow[]; skipped: number } {
  const ws   = wb.Sheets['Ongoing Card'];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  const rows: OngoingRow[] = [];
  let skipped = 0;

  for (const raw of data.slice(2)) {
    const r      = raw as any[];
    const sno    = r[0];
    const name   = String(r[1] ?? '').trim();
    const amount = parseFloat(String(r[6] ?? 0));

    if (!name || !sno || !amount || amount <= 0) { skipped++; continue; }

    const startDate = parseDate(r[7]);
    if (!startDate)                               { skipped++; continue; }

    const paidMonths: number[] = [1];
    for (let m = 2; m <= 12; m++) {
      if (String(r[7 + (m - 1) * 3] ?? '').trim().toUpperCase() === 'PAID') paidMonths.push(m);
    }

    rows.push({
      chitNumber:   String(sno),
      name,
      phone:        normalisePhone(r[2]),
      address:      String(r[3] ?? '').trim() || null,
      referrerText: String(r[4] ?? '').trim(),
      amount,
      startDate,
      paidMonths,
    });
  }
  return { rows, skipped };
}

function parseCancelSheet(wb: XLSX.WorkBook): { rows: CancelRow[]; skipped: number } {
  const ws   = wb.Sheets['Cancel Card'];
  const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
  const rows: CancelRow[] = [];
  let skipped = 0;

  for (const raw of data.slice(2)) {
    const r           = raw as any[];
    const sno         = r[0];
    const name        = String(r[3] ?? '').trim();
    const amount      = parseFloat(String(r[8] ?? 0));
    // TOTAL AMOUNT is sometimes blank — treat blank/NaN as 0 (will default to 1 paid month)
    const totalAmount = parseFloat(String(r[10] ?? '')) || 0;

    if (!name || !sno || !amount || amount <= 0) { skipped++; continue; }

    const startDate     = parseDate(r[1]);
    const cancelledDate = parseDate(r[2]);
    if (!startDate || !cancelledDate)            { skipped++; continue; }

    // Guard against NaN when totalAmount is blank (treat as 1 paid month)
    const rawMonths  = totalAmount > 0 ? totalAmount / amount : 1;
    const monthsPaid = Math.max(1, Math.round(rawMonths));

    rows.push({
      chitNumber:        String(sno),
      name,
      phone:             normalisePhone(r[4]),
      address:           String(r[5] ?? '').trim() || null,
      referrerText:      String(r[6] ?? '').trim(),
      amount,
      startDate,
      cancelledDate,
      monthsPaid,
      totalAmount,
      hasAmountMismatch: Math.abs(rawMonths - monthsPaid) > 0.05,
    });
  }
  return { rows, skipped };
}

// ── Core import logic (one card = one PG transaction) ─────────────────────────
//
// Inserts: customer → member → month-1 payment → enrollment incentive →
//          months 2..N payments → months 2..N renewal incentives →
//          (cancel cards only) UPDATE status.
//
// All steps are inside a single BEGIN/COMMIT so partial failures roll back cleanly.

async function importCard(
  db:           Pool,
  chitNumber:   string,
  name:         string,
  phone:        string | null,
  address:      string | null,
  referrerId:   string | null,
  referrerName: string | null,   // resolved Name ROLE string (or null)
  amount:       number,
  startDate:    string,
  paidMonths:   number[],        // 1-based; always includes 1
  rates:        Rates,
  cancelledDate?: string,        // when present → mark cancelled after payments
  notes?:       string,
): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    // 1. Create customer (one per card; phone-dup guard bypassed intentionally)
    const customerId = await createCustomerRaw(client, name, phone, address);

    // 2. Insert gold member
    const memberRes = await client.query<{ id: string }>(
      `INSERT INTO gold_scheme_members
         (branch_id, chit_number, customer_id, referrer_id, referrer_name,
          monthly_amount, start_date, total_months, notes, entered_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        VEPPUR_BRANCH_ID, chitNumber, customerId,
        referrerId ?? null, referrerName,
        amount, startDate,
        // For cancel cards, total_months = months paid; otherwise 12
        cancelledDate ? paidMonths.length : 12,
        notes ?? 'Imported: Veppur monthly card backfill',
        MGMT_USER_ID,
      ]
    );
    const memberId = memberRes.rows[0].id;

    // 3. Month-1 payment (the enrollment / start month)
    await client.query(
      `INSERT INTO gold_scheme_payments
         (member_id, month_number, paid_date, amount, payment_mode, entered_by)
       VALUES ($1, 1, $2, $3, 'cash', $4)`,
      [memberId, startDate, amount, MGMT_USER_ID]
    );

    // 4. Enrollment incentive (20% of month-1 amount, credited to referrer, backdated)
    if (referrerId && rates.new > 0) {
      const incentiveAmount = roundMoney(amount * rates.new / 100);
      if (incentiveAmount > 0) {
        await client.query(
          `INSERT INTO employee_incentives
             (user_id, amount, source_type, scheme_code, payment_event,
              source_id, source_description, credited_by, created_at)
           VALUES ($1,$2,'scheme',$3,'enrollment',$4,$5,$6,$7::timestamptz)`,
          [
            referrerId, incentiveAmount, GOLD_SCHEME_CODE,
            memberId,
            `Gold enrollment: ${name} – Chit ${chitNumber}`,
            MGMT_USER_ID,
            startDate,   // lands in the start month's 7-to-7 wallet period
          ]
        );
      }
    }

    // 5. Months 2..N — payment + renewal incentive each dated to the respective month
    for (const m of paidMonths.slice(1)) {
      const paidDate = addMonths(startDate, m - 1);

      await client.query(
        `INSERT INTO gold_scheme_payments
           (member_id, month_number, paid_date, amount, payment_mode, entered_by)
         VALUES ($1,$2,$3,$4,'cash',$5)`,
        [memberId, m, paidDate, amount, MGMT_USER_ID]
      );

      if (referrerId && rates.renewal > 0) {
        const renewalAmount = roundMoney(amount * rates.renewal / 100);
        if (renewalAmount > 0) {
          await client.query(
            `INSERT INTO employee_incentives
               (user_id, amount, source_type, scheme_code, payment_event,
                source_id, source_description, credited_by, created_at)
             VALUES ($1,$2,'scheme',$3,'renewal',$4,$5,$6,$7::timestamptz)`,
            [
              referrerId, renewalAmount, GOLD_SCHEME_CODE,
              memberId,
              `Gold M${m} payment: ${name} – Chit ${chitNumber}`,
              MGMT_USER_ID,
              paidDate,   // lands in this month's 7-to-7 wallet period
            ]
          );
        }
      }
    }

    // 6. Cancel card: flip status after all payments are recorded
    if (cancelledDate) {
      await client.query(
        `UPDATE gold_scheme_members
         SET status        = 'cancelled',
             cancelled_at  = $1::date,
             cancelled_by  = $2,
             cancel_reason = 'Imported - cancelled',
             refund_status = 'pending'
         WHERE id = $3`,
        [cancelledDate, MGMT_USER_ID, memberId]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Resolve referrer name string from DB (for denormalised referrer_name column) ──

// Builds userId → "Name ROLE" map so we can populate the denormalised column.
async function loadReferrerNames(db: Pool): Promise<Map<string, string>> {
  const res = await db.query<{ id: string; name: string; role: string }>(
    'SELECT id, name, role FROM users WHERE is_active'
  );
  const m = new Map<string, string>();
  for (const r of res.rows) {
    m.set(r.id, `${r.name} ${r.role.toUpperCase().replace(/_/g, ' ')}`);
  }
  return m;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(isCommit ? '🚀 COMMIT MODE — writing to DB' : '🔍 DRY-RUN (no changes; add --commit to write)');
  console.log(`Source xlsx : ${SOURCE_XLSX}`);
  console.log(`Mapping xlsx: ${MAPPING_XLSX ?? '(none — incentives will be skipped)'}`);
  console.log('');

  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Load supporting data from DB
    const [rates, referrerMap, userNameMap] = await Promise.all([
      loadGoldRates(db),
      parseReferrerMap(MAPPING_XLSX, db),
      loadReferrerNames(db),
    ]);
    console.log(`Gold rates: new=${rates.new}%, renewal=${rates.renewal}%`);

    // Load existing Veppur chit_numbers for idempotency
    const existingRes = await db.query<{ chit_number: string }>(
      `SELECT chit_number FROM gold_scheme_members WHERE branch_id = $1`,
      [VEPPUR_BRANCH_ID]
    );
    const existingChits = new Set(existingRes.rows.map(r => r.chit_number));
    console.log(`Existing Veppur gold members: ${existingChits.size}\n`);

    // Parse source xlsx
    const wb = XLSX.readFile(SOURCE_XLSX);
    const { rows: ongoingRows, skipped: ongoingSkipped } = parseOngoingSheet(wb);
    const { rows: cancelRows,  skipped: cancelSkipped  } = parseCancelSheet(wb);

    console.log(`Ongoing Card : ${ongoingRows.length} valid rows (${ongoingSkipped} skipped in parse)`);
    console.log(`Cancel Card  : ${cancelRows.length} valid rows  (${cancelSkipped} skipped in parse)\n`);

    // ── Counters
    let imported = 0, skippedExisting = 0, errored = 0;
    let totalPayments = 0, noPhone = 0, amountMismatch = 0;
    let refResolved = 0, refNone = 0, refUnknown = 0;
    const errors: string[] = [];

    const resolveRef = (text: string): { id: string | null; label: string | null } => {
      if (!text)               { refNone++;    return { id: null, label: null }; }
      if (!referrerMap.size)   { refUnknown++; return { id: null, label: null }; }
      if (referrerMap.has(text)) {
        const id = referrerMap.get(text)!;
        if (id) { refResolved++; return { id, label: userNameMap.get(id) ?? null }; }
        refNone++;    return { id: null, label: null };
      }
      refUnknown++; return { id: null, label: null };
    };

    // ── Process Ongoing cards ──
    console.log('── Ongoing Cards ──────────────────────────────────────');
    for (const row of ongoingRows) {
      if (!row.phone) noPhone++;
      if (existingChits.has(row.chitNumber)) { skippedExisting++; continue; }

      const { id: referrerId, label: referrerLabel } = resolveRef(row.referrerText);

      if (isCommit) {
        try {
          await importCard(
            db,
            row.chitNumber, row.name, row.phone, row.address,
            referrerId, referrerLabel,
            row.amount, row.startDate, row.paidMonths,
            rates,
          );
          imported++;
          totalPayments += row.paidMonths.length;
          if (imported % 200 === 0) console.log(`  ✓ ${imported} cards committed`);
        } catch (err: any) {
          errored++;
          const msg = `Ongoing chit ${row.chitNumber} (${row.name}): ${err.message}`;
          errors.push(msg);
          if (errored <= 20) console.error(`  ✗ ${msg}`);
        }
      } else {
        // Dry-run: just tally
        imported++;
        totalPayments += row.paidMonths.length;
      }
    }

    // ── Process Cancel cards ──
    console.log('\n── Cancel Cards ───────────────────────────────────────');
    for (const row of cancelRows) {
      if (!row.phone) noPhone++;
      if (row.hasAmountMismatch) {
        amountMismatch++;
        console.warn(
          `  ⚠️  Chit ${row.chitNumber}: TOTAL ${row.totalAmount} / AMOUNT ${row.amount}` +
          ` = ${(row.totalAmount / row.amount).toFixed(2)} → using ${row.monthsPaid} months`
        );
      }
      if (existingChits.has(row.chitNumber)) { skippedExisting++; continue; }

      const { id: referrerId, label: referrerLabel } = resolveRef(row.referrerText);
      const paidMonths = Array.from({ length: row.monthsPaid }, (_, i) => i + 1);

      if (isCommit) {
        try {
          await importCard(
            db,
            row.chitNumber, row.name, row.phone, row.address,
            referrerId, referrerLabel,
            row.amount, row.startDate, paidMonths,
            rates,
            row.cancelledDate,  // triggers status update to 'cancelled' at the end
          );
          imported++;
          totalPayments += row.monthsPaid;
        } catch (err: any) {
          errored++;
          const msg = `Cancel chit ${row.chitNumber} (${row.name}): ${err.message}`;
          errors.push(msg);
          if (errored <= 20) console.error(`  ✗ ${msg}`);
        }
      } else {
        imported++;
        totalPayments += row.monthsPaid;
      }
    }

    // ── Summary ──
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`SUMMARY (${isCommit ? 'COMMITTED' : 'DRY-RUN'})`);
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Cards imported    : ${imported}`);
    console.log(`Payments inserted : ${totalPayments}`);
    console.log(`Skipped (exists)  : ${skippedExisting}`);
    console.log(`Errors            : ${errored}`);
    console.log('');
    console.log(`Referrer linked   : ${refResolved}`);
    console.log(`Referrer NONE     : ${refNone}`);
    console.log(`Referrer unknown  : ${refUnknown}  ${refUnknown > 0 ? '← run --map to link these' : ''}`);
    console.log('');
    console.log(`Missing phone     : ${noPhone}`);
    console.log(`Amount mismatch   : ${amountMismatch}`);

    if (errors.length) {
      console.log(`\n⚠️  First ${Math.min(errors.length, 30)} errors:`);
      errors.slice(0, 30).forEach(e => console.log(`  • ${e}`));
    }

    if (!isCommit) {
      console.log('\nThis was a DRY-RUN — add --commit to write to the database.');
    } else {
      console.log('\n✅ Import complete.');
    }
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
