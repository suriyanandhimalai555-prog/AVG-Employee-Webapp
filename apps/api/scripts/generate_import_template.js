/**
 * generate_import_template.js
 *
 * Generates a branch-specific Excel import template for money collection data.
 * One file should be created per branch (branchName / branchCode differ per call).
 *
 * Usage:
 *   node apps/api/scripts/generate_import_template.js
 *
 * Output:
 *   EMS_Collection_Import_<BranchName>.xlsx   (in project root)
 */

const XLSX = require('xlsx');
const path = require('path');

// ─── CONFIGURE BEFORE SENDING TO EACH BRANCH ─────────────────────────────────
const BRANCH_NAME    = 'Chennai Central';       // change per branch
const BRANCH_CODE    = 'CHN-001';               // internal code (optional label)
const DATA_PERIOD_START = '01-07-2025';
const DATA_PERIOD_END   = '31-03-2026';
const PREPARED_BY    = 'MD Office';
const PREPARED_DATE  = new Date().toLocaleDateString('en-IN');

// ─── PROJECTS LIST (pull from your DB before generating) ─────────────────────
// SELECT name FROM projects WHERE is_active = true ORDER BY name;
const PROJECTS = [
  'Home Loan',
  'Personal Loan',
  'Business Loan',
  'Gold Loan',
  'Vehicle Loan',
  'Insurance Premium',
  'EMI Collection',
  'Other',
];

// ─── STYLE HELPERS ────────────────────────────────────────────────────────────
const STYLES = {
  headerDark: {
    fill:  { fgColor: { rgb: '0B1C30' } },          // navy
    font:  { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'thin', color: { rgb: 'FFFFFF' } },
      bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
      left:   { style: 'thin', color: { rgb: 'FFFFFF' } },
      right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
    },
  },
  headerGreen: {
    fill:  { fgColor: { rgb: '166534' } },           // emerald-800
    font:  { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'thin', color: { rgb: 'FFFFFF' } },
      bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
      left:   { style: 'thin', color: { rgb: 'FFFFFF' } },
      right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
    },
  },
  mandatory: {
    fill:  { fgColor: { rgb: 'FEF9C3' } },           // yellow-50
    font:  { sz: 10, color: { rgb: '1C1C1C' } },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
      left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
      right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
    },
  },
  optional: {
    fill:  { fgColor: { rgb: 'F0F9FF' } },           // sky-50
    font:  { sz: 10, color: { rgb: '1C1C1C' } },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'thin', color: { rgb: 'D1D5DB' } },
      bottom: { style: 'thin', color: { rgb: 'D1D5DB' } },
      left:   { style: 'thin', color: { rgb: 'D1D5DB' } },
      right:  { style: 'thin', color: { rgb: 'D1D5DB' } },
    },
  },
  exampleRow: {
    fill:  { fgColor: { rgb: 'F0FDF4' } },           // green-50
    font:  { sz: 10, color: { rgb: '166534' }, italic: true },
    alignment: { vertical: 'center' },
    border: {
      top:    { style: 'dashed', color: { rgb: 'D1FAE5' } },
      bottom: { style: 'dashed', color: { rgb: 'D1FAE5' } },
      left:   { style: 'dashed', color: { rgb: 'D1FAE5' } },
      right:  { style: 'dashed', color: { rgb: 'D1FAE5' } },
    },
  },
  info: {
    fill:  { fgColor: { rgb: 'EFF6FF' } },
    font:  { sz: 10, color: { rgb: '1E3A8A' } },
    alignment: { vertical: 'center', horizontal: 'left' },
  },
  warning: {
    fill:  { fgColor: { rgb: 'FEF3C7' } },
    font:  { bold: true, sz: 10, color: { rgb: '92400E' } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
  },
  error: {
    fill:  { fgColor: { rgb: 'FEE2E2' } },
    font:  { bold: true, sz: 10, color: { rgb: '991B1B' } },
    alignment: { vertical: 'center', horizontal: 'left', wrapText: true },
  },
};

function cell(v, style) {
  return { v, t: typeof v === 'number' ? 'n' : 's', s: style };
}

// ─── SHEET 1: Collections ─────────────────────────────────────────────────────
function buildCollectionsSheet() {
  const ws = {};

  // ── Column widths ──────────────────────────────────────────────────────────
  ws['!cols'] = [
    { wch: 5  },   // A  S.No
    { wch: 14 },   // B  Date
    { wch: 22 },   // C  Project
    { wch: 24 },   // D  Client Name
    { wch: 16 },   // E  Client Phone
    { wch: 14 },   // F  Amount
    { wch: 16 },   // G  Mode
    { wch: 26 },   // H  Reference No.
    { wch: 24 },   // I  Submitted By Name
    { wch: 16 },   // J  Employee Code (ID)
    { wch: 18 },   // K  Role
    { wch: 28 },   // L  Notes
  ];

  // ── Row heights ────────────────────────────────────────────────────────────
  ws['!rows'] = [
    { hpt: 42 },   // row 1 — header
    { hpt: 50 },   // row 2 — column guide
    { hpt: 22 },   // row 3 — example 1
    { hpt: 22 },   // row 4 — example 2
    { hpt: 22 },   // row 5 — example 3
  ];

  // ── Header row (row 1) ─────────────────────────────────────────────────────
  const HEADERS = [
    ['A1', '#'],
    ['B1', 'Date\n(DD-MM-YYYY)'],
    ['C1', 'Project Name'],
    ['D1', 'Client Full Name'],
    ['E1', 'Client Phone\n(10 digits, no spaces)'],
    ['F1', 'Amount (₹)\n(numbers only)'],
    ['G1', 'Payment Mode\ngpay / bank_receipt / cash'],
    ['H1', 'GPay/Bank Reference No.\n(required for gpay & bank_receipt)'],
    ['I1', 'Collected By\n(Employee Full Name)'],
    ['J1', 'Employee Code\n(from ID card — REQUIRED)'],
    ['K1', 'Role\nsales_officer / abm / branch_manager'],
    ['L1', 'Notes / Remarks\n(optional)'],
  ];
  HEADERS.forEach(([ref, v]) => {
    ws[ref] = cell(v, STYLES.headerDark);
  });

  // ── Sub-header guide row (row 2) ───────────────────────────────────────────
  const GUIDE = [
    ['A2', '★'],
    ['B2', '★ Mandatory'],
    ['C2', '★ Use dropdown only'],
    ['D2', '★ Mandatory'],
    ['E2', '★ 10 digits, no +91'],
    ['F2', '★ e.g. 15000.50'],
    ['G2', '★ Use dropdown only'],
    ['H2', '★ if GPay/Bank — mandatory\n✓ for cash — leave blank'],
    ['I2', '★ Mandatory'],
    ['J2', '★ MANDATORY — use employee ID'],
    ['K2', '★ Use dropdown only'],
    ['L2', '✓ Optional'],
  ];
  GUIDE.forEach(([ref, v]) => {
    ws[ref] = cell(v, STYLES.headerGreen);
  });
  ws['!rows'][1] = { hpt: 44 };

  // ── Example rows (rows 3–5) ────────────────────────────────────────────────
  const EXAMPLES = [
    [ 1, '15-09-2025', 'Home Loan',      'Ramesh Kumar',    '9876543210', 15000,   'gpay',         'UPI/2025/9876543210/001', 'Karthik S',    'EMP-042', 'sales_officer', 'Down payment instalment' ],
    [ 2, '18-11-2025', 'Personal Loan',  'Meena Devi',      '9123456780', 8500,    'bank_receipt', 'HDFC/TXN/20251118/4521', 'Priya A',      'EMP-067', 'sales_officer', '' ],
    [ 3, '02-02-2026', 'EMI Collection', 'Suresh Pillai',   '9988776655', 22000,   'cash',         '',                       'Arun M',       'EMP-019', 'abm',           'Collected at client office' ],
  ];

  EXAMPLES.forEach(([sno, date, project, clientName, phone, amount, mode, ref, empName, empCode, role, notes], i) => {
    const row = i + 3; // rows 3, 4, 5
    ws[`A${row}`] = cell(sno,       STYLES.exampleRow);
    ws[`B${row}`] = cell(date,      STYLES.exampleRow);
    ws[`C${row}`] = cell(project,   STYLES.exampleRow);
    ws[`D${row}`] = cell(clientName,STYLES.exampleRow);
    ws[`E${row}`] = cell(phone,     STYLES.exampleRow);   // text — no numeric conversion
    ws[`F${row}`] = { v: amount, t: 'n', s: STYLES.exampleRow };
    ws[`G${row}`] = cell(mode,      STYLES.exampleRow);
    ws[`H${row}`] = cell(ref,       STYLES.exampleRow);
    ws[`I${row}`] = cell(empName,   STYLES.exampleRow);
    ws[`J${row}`] = cell(empCode,   STYLES.exampleRow);
    ws[`K${row}`] = cell(role,      STYLES.exampleRow);
    ws[`L${row}`] = cell(notes,     STYLES.exampleRow);
  });

  // ── Phone cells: explicitly set as text to prevent Excel stripping leading 0 ─
  ['E3','E4','E5'].forEach(ref => {
    if (ws[ref]) ws[ref].t = 's';
  });

  // Range
  ws['!ref'] = 'A1:L5';

  // ── Data validation (dropdown) ─────────────────────────────────────────────
  // Note: XLSX.js doesn't support full DV natively, but we encode it so
  // tools that read the file (LibreOffice, Google Sheets) will honour it.
  ws['!dataValidation'] = [
    // Project dropdown — references Projects sheet col A
    {
      sqref: 'C3:C5000',
      type: 'list',
      formula1: 'Projects!$A$2:$A$100',
      showDropDown: false,
      showErrorMessage: true,
      errorTitle: 'Invalid Project',
      error: 'Please select a project from the dropdown. Do not type directly.',
    },
    // Payment mode dropdown
    {
      sqref: 'G3:G5000',
      type: 'list',
      formula1: '"gpay,bank_receipt,cash"',
      showDropDown: false,
      showErrorMessage: true,
      errorTitle: 'Invalid Mode',
      error: 'Must be exactly: gpay, bank_receipt, or cash',
    },
    // Role dropdown
    {
      sqref: 'K3:K5000',
      type: 'list',
      formula1: '"sales_officer,abm,branch_manager"',
      showDropDown: false,
      showErrorMessage: true,
      errorTitle: 'Invalid Role',
      error: 'Must be exactly: sales_officer, abm, or branch_manager',
    },
  ];

  return ws;
}

// ─── SHEET 2: Branch Info ─────────────────────────────────────────────────────
function buildBranchInfoSheet() {
  const ws = {};
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }];
  ws['!rows'] = Array(12).fill({ hpt: 24 });

  const rows = [
    ['A1', 'Field',               'B1', 'Value'],
    ['A2', 'Branch Name',         'B2', BRANCH_NAME],
    ['A3', 'Branch Code',         'B3', BRANCH_CODE],
    ['A4', 'Data Period Start',   'B4', DATA_PERIOD_START],
    ['A5', 'Data Period End',     'B5', DATA_PERIOD_END],
    ['A6', 'Template Prepared By','B6', PREPARED_BY],
    ['A7', 'Template Date',       'B7', PREPARED_DATE],
    ['A8', '⚠ DO NOT EDIT',       'B8', 'This sheet is pre-filled by HO. Do not change any values here.'],
  ];

  rows.forEach(([kRef, kVal, vRef, vVal]) => {
    ws[kRef] = cell(kVal, STYLES.headerDark);
    if (kVal === '⚠ DO NOT EDIT') {
      ws[vRef] = cell(vVal, STYLES.error);
    } else if (kRef === 'A1') {
      ws[vRef] = cell(vVal, STYLES.headerDark);
    } else {
      ws[vRef] = cell(vVal, STYLES.mandatory);
    }
  });

  ws['!ref'] = 'A1:B8';
  return ws;
}

// ─── SHEET 3: Projects ────────────────────────────────────────────────────────
function buildProjectsSheet() {
  const ws = {};
  ws['!cols'] = [{ wch: 30 }];

  ws['A1'] = cell('Project Name', STYLES.headerDark);
  PROJECTS.forEach((name, i) => {
    ws[`A${i + 2}`] = cell(name, STYLES.mandatory);
  });

  ws['!ref'] = `A1:A${PROJECTS.length + 1}`;
  return ws;
}

// ─── SHEET 4: Instructions ────────────────────────────────────────────────────
function buildInstructionsSheet() {
  const ws = {};
  ws['!cols'] = [{ wch: 6 }, { wch: 72 }];

  const lines = [
    // [row, colA, colB, style]
    [1,  '📋', `INSTRUCTIONS — EMS Collection Import Template (${BRANCH_NAME})`, STYLES.headerDark],
    [2,  '',   '', null],
    [3,  '✅', 'MANDATORY FIELDS', STYLES.headerGreen],
    [4,  '',   'Date        — Format must be DD-MM-YYYY (e.g. 25-03-2024). No future dates. Max 2 years old.', STYLES.mandatory],
    [5,  '',   'Project     — Select from dropdown only. Do NOT type manually or paste.', STYLES.mandatory],
    [6,  '',   'Client Name — Full name of the person who paid (not the employee).', STYLES.mandatory],
    [7,  '',   'Client Phone— 10 digits ONLY. No spaces, no +91, no dashes. Excel may strip leading 0 — prefix with apostrophe if needed (e.g. \'09876543210).', STYLES.mandatory],
    [8,  '',   'Amount      — Plain number. No ₹ symbol, no commas. Decimals OK (e.g. 15000.50).', STYLES.mandatory],
    [9,  '',   'Mode        — Select from dropdown: gpay / bank_receipt / cash', STYLES.mandatory],
    [10, '',   'Collected By— Full name of the employee who collected the money (must match HR records).', STYLES.mandatory],
    [11, '',   'Employee Code — From the employee\'s ID card or HR system. THIS IS THE MOST IMPORTANT FIELD. Without it the system cannot identify who submitted the collection.', STYLES.mandatory],
    [12, '',   'Role        — Select from dropdown: sales_officer / abm / branch_manager', STYLES.mandatory],
    [13, '',   '', null],
    [14, '⚠️', 'CONDITIONAL FIELDS', STYLES.headerDark],
    [15, '',   'Reference No — REQUIRED if Mode is gpay or bank_receipt. Enter the UPI transaction ID, bank ref, or UTR number. Leave blank for cash.', STYLES.warning],
    [16, '',   '', null],
    [17, '❌', 'DO NOT DO THIS', STYLES.headerDark],
    [18, '',   'DO NOT add or delete columns.', STYLES.error],
    [19, '',   'DO NOT change column order.', STYLES.error],
    [20, '',   'DO NOT merge cells.', STYLES.error],
    [21, '',   'DO NOT enter "approved" or "rejected" status — the system sets this.', STYLES.error],
    [22, '',   'DO NOT enter verified-by or verification date — the system handles approval.', STYLES.error],
    [23, '',   'DO NOT enter data on the Branch Info or Projects sheets.', STYLES.error],
    [24, '',   '', null],
    [25, '📞', 'SUPPORT', STYLES.headerDark],
    [26, '',   'If you have questions, contact the MD Office before submitting.', STYLES.info],
    [27, '',   'If an employee name or code is not recognised, leave a note in column L and we will resolve it.', STYLES.info],
    [28, '',   'Submit the completed file to: ho-data@yourcompany.com', STYLES.info],
  ];

  lines.forEach(([row, a, b, style]) => {
    ws[`A${row}`] = cell(a, style || STYLES.info);
    ws[`B${row}`] = cell(b, style || STYLES.info);
  });

  ws['!rows'] = lines.map(() => ({ hpt: 28 }));
  ws['!rows'][0] = { hpt: 36 };
  ws['!ref'] = `A1:B${lines.length}`;
  return ws;
}

// ─── SHEET 5: Validation Errors (pre-built for importer to fill on return) ────
function buildValidationSheet() {
  const ws = {};
  ws['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 60 }];

  ws['A1'] = cell('Row',   STYLES.headerDark);
  ws['B1'] = cell('Field', STYLES.headerDark);
  ws['C1'] = cell('Error Description', STYLES.headerDark);
  ws['A2'] = cell('(Leave blank — HO fills this during import and returns to branch for corrections)', STYLES.warning);

  ws['!ref'] = 'A1:C2';
  return ws;
}

// ─── BUILD WORKBOOK ───────────────────────────────────────────────────────────
function generate() {
  const wb = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(wb, buildCollectionsSheet(),  '📥 Collections');
  XLSX.utils.book_append_sheet(wb, buildBranchInfoSheet(),   '🏢 Branch Info');
  XLSX.utils.book_append_sheet(wb, buildProjectsSheet(),     '📂 Projects');
  XLSX.utils.book_append_sheet(wb, buildInstructionsSheet(), '📋 Instructions');
  XLSX.utils.book_append_sheet(wb, buildValidationSheet(),   '⚠ Errors (HO only)');

  const safeName = BRANCH_NAME.replace(/[^a-zA-Z0-9_-]/g, '_');
  const outPath = path.join(
    __dirname, '..', '..', '..',
    `EMS_Collection_Import_${safeName}.xlsx`
  );

  XLSX.writeFile(wb, outPath, { bookType: 'xlsx', compression: true });
  console.log(`\n✅  Template created: ${outPath}`);
  console.log(`    Branch : ${BRANCH_NAME} (${BRANCH_CODE})`);
  console.log(`    Period : ${DATA_PERIOD_START} → ${DATA_PERIOD_END}`);
  console.log(`    Sheets : Collections | Branch Info | Projects | Instructions | Errors\n`);
}

generate();
