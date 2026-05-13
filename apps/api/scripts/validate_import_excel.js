/**
 * validate_import_excel.js
 *
 * Validates a completed branch Excel file BEFORE it is inserted into the DB.
 * Prints a table of errors (row number, field, reason).
 * Does NOT write to the database — it only reads and validates.
 *
 * Usage:
 *   node apps/api/scripts/validate_import_excel.js <path-to-file.xlsx>
 *
 * Example:
 *   node apps/api/scripts/validate_import_excel.js EMS_Collection_Import_Chennai_Central.xlsx
 */

const XLSX  = require('xlsx');
const path  = require('path');

// ─── CONFIG ───────────────────────────────────────────────────────────────────
const ALLOWED_MODES = new Set(['gpay', 'bank_receipt', 'cash']);
const ALLOWED_ROLES = new Set(['sales_officer', 'abm', 'branch_manager']);

// Max 2 years back from today
const TODAY        = new Date();
TODAY.setHours(0, 0, 0, 0);
const TWO_YEARS_AGO = new Date(TODAY);
TWO_YEARS_AGO.setFullYear(TODAY.getFullYear() - 2);

// ─── PHONE NORMALISATION ──────────────────────────────────────────────────────
// Strips all non-digit characters, removes leading country code (+91 or 91)
// Returns normalised 10-digit string or null if invalid
function normalisePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // Remove leading 91 if 12 digits total
  const stripped = digits.length === 12 && digits.startsWith('91')
    ? digits.slice(2)
    : digits;
  if (stripped.length !== 10) return null;
  return stripped;
}

// ─── DATE PARSING ─────────────────────────────────────────────────────────────
// Accepts DD-MM-YYYY or YYYY-MM-DD or Excel serial number
function parseDate(raw) {
  if (!raw) return null;
  let d;
  if (typeof raw === 'number') {
    // Excel serial date
    d = XLSX.SSF.parse_date_code(raw);
    return new Date(d.y, d.m - 1, d.d);
  }
  const s = String(raw).trim();
  // DD-MM-YYYY
  const ddmm = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmm) return new Date(+ddmm[3], +ddmm[2] - 1, +ddmm[1]);
  // YYYY-MM-DD
  const yyyymm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (yyyymm) return new Date(+yyyymm[1], +yyyymm[2] - 1, +yyyymm[3]);
  return null;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function validate(filePath) {
  let wb;
  try {
    wb = XLSX.readFile(filePath);
  } catch (e) {
    console.error(`\n❌  Cannot open file: ${filePath}\n    ${e.message}\n`);
    process.exit(1);
  }

  // ── Read Branch Info ───────────────────────────────────────────────────────
  const branchSheet = wb.Sheets['🏢 Branch Info'];
  if (!branchSheet) {
    console.error('\n❌  Sheet "🏢 Branch Info" is missing. File may be corrupted.\n');
    process.exit(1);
  }
  const branchRows = XLSX.utils.sheet_to_json(branchSheet, { header: 1 });
  const branchInfo = {};
  branchRows.slice(1).forEach(([key, val]) => {
    if (key) branchInfo[String(key).trim()] = val;
  });
  const branchName = branchInfo['Branch Name'] || '(unknown)';
  const branchCode = branchInfo['Branch Code'] || '(unknown)';

  // ── Read Collections ───────────────────────────────────────────────────────
  const collSheet = wb.Sheets['📥 Collections'];
  if (!collSheet) {
    console.error('\n❌  Sheet "📥 Collections" is missing.\n');
    process.exit(1);
  }

  // Skip header row (row 1) and guide row (row 2); rows 3+ are data
  const allRows = XLSX.utils.sheet_to_json(collSheet, { header: 1, defval: '' });
  // First 2 rows are header+guide; skip them
  const dataRows = allRows.slice(2);

  const errors   = [];
  const warnings = [];
  let valid = 0;

  dataRows.forEach((row, idx) => {
    const rowNum = idx + 3; // 1-indexed, accounting for 2 header rows
    const [sno, dateRaw, projectName, clientName, clientPhoneRaw,
           amountRaw, modeRaw, referenceNo, empName, empCode,
           roleRaw, notes] = row;

    // Skip completely empty rows
    if (!dateRaw && !projectName && !clientName && !amountRaw && !empName) return;

    const E = (field, msg) => errors.push({ row: rowNum, field, msg });
    const W = (field, msg) => warnings.push({ row: rowNum, field, msg });

    // ── Date ────────────────────────────────────────────────────────────────
    const parsedDate = parseDate(dateRaw);
    if (!parsedDate) {
      E('Date', `Cannot parse "${dateRaw}". Use DD-MM-YYYY.`);
    } else if (parsedDate > TODAY) {
      E('Date', `Date ${dateRaw} is in the future.`);
    } else if (parsedDate < TWO_YEARS_AGO) {
      E('Date', `Date ${dateRaw} is more than 2 years old. Max allowed: ${TWO_YEARS_AGO.toLocaleDateString('en-IN')}.`);
    }

    // ── Project ──────────────────────────────────────────────────────────────
    if (!projectName || String(projectName).trim() === '') {
      E('Project Name', 'Project Name is empty.');
    }

    // ── Client Name ──────────────────────────────────────────────────────────
    if (!clientName || String(clientName).trim().length < 2) {
      E('Client Name', 'Client Name is missing or too short.');
    }

    // ── Phone ────────────────────────────────────────────────────────────────
    const normPhone = normalisePhone(clientPhoneRaw);
    if (!normPhone) {
      E('Client Phone', `"${clientPhoneRaw}" is not a valid 10-digit phone number. Strips +91 automatically — still invalid.`);
    }

    // ── Amount ───────────────────────────────────────────────────────────────
    const amount = parseFloat(amountRaw);
    if (isNaN(amount) || amount <= 0) {
      E('Amount', `"${amountRaw}" is not a valid positive number.`);
    } else if (amount > 10_000_000) {
      W('Amount', `₹${amount.toLocaleString()} is unusually large. Please verify.`);
    }

    // ── Payment Mode ──────────────────────────────────────────────────────────
    const mode = String(modeRaw || '').trim().toLowerCase();
    if (!ALLOWED_MODES.has(mode)) {
      E('Payment Mode', `"${modeRaw}" is not valid. Must be: gpay, bank_receipt, or cash.`);
    } else if ((mode === 'gpay' || mode === 'bank_receipt') && !String(referenceNo).trim()) {
      E('Reference No.', `Reference number is required when mode is "${mode}".`);
    }

    // ── Employee Code (the critical field) ───────────────────────────────────
    if (!empCode || String(empCode).trim() === '') {
      E('Employee Code', 'Employee Code (Column J) is EMPTY. This field is mandatory — the system cannot identify who collected without it.');
    }

    // ── Employee Name ─────────────────────────────────────────────────────────
    if (!empName || String(empName).trim().length < 2) {
      W('Collected By', 'Employee name is missing or too short. Employee Code will be used as primary key, but name helps for manual review.');
    }

    // ── Role ──────────────────────────────────────────────────────────────────
    const role = String(roleRaw || '').trim().toLowerCase().replace(/ /g, '_');
    if (!ALLOWED_ROLES.has(role)) {
      E('Role', `"${roleRaw}" is not valid. Must be: sales_officer, abm, or branch_manager.`);
    }

    if (errors.filter(e => e.row === rowNum).length === 0) valid++;
  });

  // ── Report ─────────────────────────────────────────────────────────────────
  const totalRows = dataRows.filter(r => r.some(c => c !== '')).length;
  console.log('\n' + '═'.repeat(80));
  console.log(`  EMS Import Validator — ${path.basename(filePath)}`);
  console.log(`  Branch: ${branchName} (${branchCode})`);
  console.log('═'.repeat(80));
  console.log(`  Total data rows  : ${totalRows}`);
  console.log(`  ✅ Clean rows    : ${valid}`);
  console.log(`  ❌ Error rows    : ${errors.length > 0 ? [...new Set(errors.map(e => e.row))].length : 0}`);
  console.log(`  ⚠  Warnings      : ${warnings.length}`);
  console.log('─'.repeat(80));

  if (errors.length === 0 && warnings.length === 0) {
    console.log('\n  🎉  All rows are valid. Safe to import.\n');
  }

  if (errors.length > 0) {
    console.log('\n  ❌  ERRORS (must fix before import):');
    console.log('  ' + '─'.repeat(76));
    console.log(`  ${'Row'.padEnd(5)} ${'Field'.padEnd(22)} ${'Problem'}`);
    console.log('  ' + '─'.repeat(76));
    errors.forEach(({ row, field, msg }) => {
      console.log(`  ${String(row).padEnd(5)} ${field.padEnd(22)} ${msg}`);
    });
  }

  if (warnings.length > 0) {
    console.log('\n  ⚠   WARNINGS (review recommended):');
    console.log('  ' + '─'.repeat(76));
    warnings.forEach(({ row, field, msg }) => {
      console.log(`  Row ${row} · ${field}: ${msg}`);
    });
  }

  console.log('\n' + '═'.repeat(80) + '\n');

  // Exit code: 0 = clean, 1 = has errors
  process.exit(errors.length > 0 ? 1 : 0);
}

// ─── CLI ENTRY ────────────────────────────────────────────────────────────────
const file = process.argv[2];
if (!file) {
  console.error('\nUsage: node validate_import_excel.js <path-to-file.xlsx>\n');
  process.exit(1);
}

validate(path.resolve(process.cwd(), file));
