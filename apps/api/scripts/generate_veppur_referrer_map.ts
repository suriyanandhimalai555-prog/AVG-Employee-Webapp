// apps/api/scripts/generate_veppur_referrer_map.ts
//
// Step 1 of the Veppur Monthly Gold Card import.
//
// Reads "Ongoing Card" and "Cancel Card" from the source xlsx, collects the
// distinct referrer-name strings, fuzzy-matches each against real Veppur
// employees (including overseers visible from Veppur), and emits a two-sheet
// workbook for the user to confirm before the importer runs.
//
// Run:
//   cd apps/api
//   npx ts-node scripts/generate_veppur_referrer_map.ts
//
// Output: veppur_referrer_mapping.xlsx at the repo root.
// Fill in the "Confirmed Employee" column (col F) and return it to run step 2.

import path       from 'path';
import { Pool }   from 'pg';
import XLSX       from 'xlsx';
// ExcelJS is used only for the output workbook — SheetJS cannot write data validations.
// exceljs uses CommonJS exports, so we import the namespace object, not a default.
import * as ExcelJS from 'exceljs';
import dotenv     from 'dotenv';

// ── Config ──────────────────────────────────────────────────────────────────
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

const VEPPUR_BRANCH_ID = 'eff1ddf3-9ece-41c6-a391-355d13a86629';

const SOURCE_XLSX = path.resolve(
  __dirname, '../../../Data-documents/veppur monthly card details.xlsx'
);
const OUT_XLSX = path.resolve(__dirname, '../../../veppur_referrer_mapping_v2.xlsx');

// ── Fuzzy matching ───────────────────────────────────────────────────────────

// Common role / title tokens to strip before comparing names.
const ROLE_TOKENS = new Set([
  'so', 'abm', 'gm', 'bm', 'admin', 'md', 'director', 'manager', 'branch',
  'assistant', 'officer', 'management', 'sales', 'general', 'oa',
]);

// Returns name tokens after stripping role words and punctuation.
function normalise(raw: string): string[] {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && !ROLE_TOKENS.has(t));
}

// Jaccard-like overlap with partial prefix matching for common spelling variants.
function fuzzyScore(aToks: string[], bToks: string[]): number {
  if (!aToks.length || !bToks.length) return 0;
  const setB = new Set(bToks);
  let matched = 0;
  for (const tok of aToks) {
    if (setB.has(tok)) {
      // Exact token match — full weight
      matched += 1;
    } else if (
      bToks.some(
        b =>
          tok.length >= 4 && b.length >= 4 &&
          (b.startsWith(tok.slice(0, 4)) || tok.startsWith(b.slice(0, 4)))
      )
    ) {
      // 4-char prefix match — common for Tamil name transliteration variants
      matched += 0.6;
    }
  }
  return matched / Math.max(aToks.length, bToks.length);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Read referrer names from both sheets ──────────────────────────────────
  const wb = XLSX.readFile(SOURCE_XLSX);

  const readReferrers = (sheetName: string, refCol: number): Map<string, number> => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return new Map();
    const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' });
    const counts = new Map<string, number>();
    // Row 0 = title, row 1 = header, data from row 2
    for (const row of rows.slice(2)) {
      const name = String((row as any[])[refCol] ?? '').trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  };

  // Ongoing Card: referrer at col 4 | Cancel Card: referrer at col 6
  const ongoingCounts = readReferrers('Ongoing Card', 4);
  const cancelCounts  = readReferrers('Cancel Card',  6);

  const combined = new Map<string, number>();
  for (const [k, v] of ongoingCounts) combined.set(k, (combined.get(k) ?? 0) + v);
  for (const [k, v] of cancelCounts)  combined.set(k, (combined.get(k) ?? 0) + v);

  // Sort by frequency descending for easier review (most-referenced first)
  const referrers = [...combined.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Found ${referrers.length} distinct referrer names.`);

  // 2. Load candidate employees from DB ──────────────────────────────────────
  const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  let employees: Array<{ id: string; name: string; role: string; branch: string }> = [];
  try {
    // Include Veppur staff + overseers (GMs/Directors with oversight) + MD.
    // This mirrors GoldService.getBranchEmployees so the same referrer pool is used.
    const res = await db.query<{ id: string; name: string; role: string; branch_name: string }>(
      `SELECT u.id, u.name, u.role, COALESCE(b.name, 'No branch') AS branch_name
       FROM users u
       LEFT JOIN branches b ON b.id = u.branch_id
       WHERE u.is_active
         AND u.role NOT IN ('client', 'oa')
         AND (
           u.branch_id = $1
           OR EXISTS (
             SELECT 1 FROM user_oversight_branches uob
             WHERE uob.user_id = u.id AND uob.branch_id = $1
           )
           OR u.role IN ('md', 'management')
         )
       ORDER BY u.name ASC`,
      [VEPPUR_BRANCH_ID]
    );
    employees = res.rows.map(r => ({
      id:     r.id,
      name:   r.name,
      role:   r.role,
      branch: r.branch_name,
    }));
    console.log(`Loaded ${employees.length} candidate employees.`);
  } finally {
    await db.end();
  }

  // 3. Fuzzy-match each referrer text — top-3 candidates per string ────────────
  const shortId = (emp: typeof employees[0]) => emp.id.slice(0, 8);
  const label   = (emp: typeof employees[0]) =>
    `${emp.name} (${emp.role.toUpperCase().replace(/_/g, ' ')}) [ref:${shortId(emp)}]`;

  const rawMapping = referrers.map(([refText, count]) => {
    const refToks = normalise(refText);

    // Score every candidate and take the top 3 by descending score.
    const scored = employees
      .map(emp => ({ emp, score: fuzzyScore(refToks, normalise(emp.name)) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    const best = scored[0]?.score > 0 ? scored[0] : null;

    const confidence =
      !best               ? 'NONE' :
      best.score >= 0.7   ? 'HIGH' :
      best.score >= 0.4   ? 'MEDIUM' : 'LOW';

    // Only pre-fill col F for HIGH-confidence matches (score ≥ 0.7).
    // MEDIUM/LOW/NONE are left BLANK so non-review is visible in the dry-run count
    // (resolved stays at 155 instead of a falsely-green 220) and fails safe:
    // a blank drops an incentive (recoverable) rather than misrouting cash.
    const confirmed = confidence === 'HIGH' && best ? label(best.emp) : '';

    return {
      referrerText: refText,
      count,
      confidence,
      confirmed,
      // Top-3 options for reviewer convenience (ignored by importer — col A/F only)
      option1: scored[0]?.score > 0 ? label(scored[0].emp) : '',
      option2: scored[1]?.score > 0 ? label(scored[1].emp) : '',
      option3: scored[2]?.score > 0 ? label(scored[2].emp) : '',
    };
  });

  // Sort: uncertain rows (MEDIUM/LOW/NONE) first so reviewer sees them at the top,
  // HIGH rows after — they are pre-filled but remain editable for spot-checking.
  const CONF_ORDER: Record<string, number> = { MEDIUM: 0, LOW: 1, NONE: 2, HIGH: 3 };
  const mapping = [...rawMapping].sort(
    (a, b) => (CONF_ORDER[a.confidence] ?? 4) - (CONF_ORDER[b.confidence] ?? 4)
  );

  // 4. Build the output workbook (exceljs — SheetJS can't write data validations)
  // ─────────────────────────────────────────────────────────────────────────────
  // Column layout (importer contract: col A = refText, col F = confirmed):
  //   A  Referrer Text (from xlsx)  — must stay byte-identical; importer key
  //   B  Count
  //   C  Confidence
  //   D  (spacer)
  //   E  (spacer)
  //   F  ★ Confirmed Employee       — importer reads this col (index 5)
  //   G  Option 1 (top match)       — helper only; importer ignores cols past F
  //   H  Option 2
  //   I  Option 3
  const outWb = new ExcelJS.Workbook();
  outWb.creator = 'EMS import script';

  // ── Sheet 1: Employees (source for the dropdown; built first so we can reference it) ──
  const empSheet = outWb.addWorksheet('Employees');
  empSheet.columns = [
    { header: 'Name',   key: 'name',   width: 30 },
    { header: 'Role',   key: 'role',   width: 20 },
    { header: 'Branch', key: 'branch', width: 20 },
    // col D is the dropdown source — must carry the exact [ref:xxxxxxxx] label
    { header: '← Copy into col F of Mapping (or pick from dropdown)', key: 'label', width: 58 },
    { header: 'Full User ID',  key: 'id',    width: 40 },
  ];
  // Style the header row
  empSheet.getRow(1).font = { bold: true };

  for (const e of employees) {
    const empLabel = `${e.name} (${e.role.toUpperCase().replace(/_/g, ' ')}) [ref:${e.id.slice(0, 8)}]`;
    empSheet.addRow({ name: e.name, role: e.role, branch: e.branch, label: empLabel, id: e.id });
  }
  // Final sentinel row — importer treats NONE/blank as "no referrer"
  empSheet.addRow({ name: '', role: '', branch: '', label: 'NONE', id: '(leave col F blank or pick NONE to skip incentive)' });

  // Row 2 = first employee, last label row = employees.length + 1 (header) + 1 (NONE row)
  const empLabelFirstRow = 2;
  const empLabelLastRow  = employees.length + 2; // +1 header +1 NONE
  // Cross-sheet reference that Excel resolves correctly:
  const dropdownFormula = `Employees!$D$${empLabelFirstRow}:$D$${empLabelLastRow}`;

  // ── Sheet 2: Mapping ──
  const mapSheet = outWb.addWorksheet('Mapping');
  mapSheet.columns = [
    { header: 'Referrer Text (from xlsx)',                                                   key: 'refText',   width: 38 },
    { header: 'Count',                                                                       key: 'count',     width: 8  },
    { header: 'Confidence',                                                                  key: 'conf',      width: 11 },
    { header: '',                                                                            key: 'd',         width: 4  },
    { header: '',                                                                            key: 'e',         width: 4  },
    { header: '★ col F: Confirmed Employee  ← SELECT FROM DROPDOWN (blank = skip referrer)', key: 'confirmed', width: 58 },
    { header: 'Option 1 (top match)',                                                        key: 'opt1',      width: 58 },
    { header: 'Option 2',                                                                    key: 'opt2',      width: 55 },
    { header: 'Option 3',                                                                    key: 'opt3',      width: 55 },
  ];
  mapSheet.getRow(1).font = { bold: true };
  // Freeze the header row and col A so scrolling stays oriented
  mapSheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];

  for (const r of mapping) {
    mapSheet.addRow({
      refText:   r.referrerText,  // A — key; must stay byte-identical
      count:     r.count,          // B
      conf:      r.confidence,     // C
      d:         '',               // D
      e:         '',               // E
      confirmed: r.confirmed,      // F — blank for MEDIUM/LOW/NONE, label for HIGH
      opt1:      r.option1,        // G
      opt2:      r.option2,        // H
      opt3:      r.option3,        // I
    });
  }

  // Apply enforced dropdown to every col-F data cell (row 2 → last mapping row).
  // allowBlank: true — blank is valid (importer treats it as "no referrer").
  // showErrorMessage: true — Excel rejects any value not in the list.
  const lastMapRow = mapping.length + 1; // +1 for header
  for (let row = 2; row <= lastMapRow; row++) {
    const cell = mapSheet.getCell(row, 6); // col F = index 6 (1-based)
    cell.dataValidation = {
      type:             'list',
      allowBlank:       true,
      formulae:         [dropdownFormula],
      showErrorMessage: true,
      errorStyle:       'stop',
      errorTitle:       'Invalid value',
      error:            'Please select an employee from the dropdown, or leave blank to skip.',
    };
  }

  // Colour-code rows by confidence for quick visual orientation:
  //   MEDIUM → light yellow   LOW → light orange   NONE → light red   HIGH → light green
  const CONF_FILL: Record<string, Partial<ExcelJS.Fill>> = {
    MEDIUM: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF9C4' } },
    LOW:    { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0B2' } },
    NONE:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCDD2' } },
    HIGH:   { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC8E6C9' } },
  };
  for (let i = 0; i < mapping.length; i++) {
    const fill = CONF_FILL[mapping[i].confidence];
    if (!fill) continue;
    // Tint cols A–C to make confidence obvious without overwhelming the eye
    for (const col of [1, 2, 3]) {
      mapSheet.getCell(i + 2, col).fill = fill as ExcelJS.Fill;
    }
  }

  await outWb.xlsx.writeFile(OUT_XLSX);

  // 5. Summary ───────────────────────────────────────────────────────────────
  const highConf   = mapping.filter(r => r.confidence === 'HIGH').length;
  const medConf    = mapping.filter(r => r.confidence === 'MEDIUM').length;
  const lowConf    = mapping.filter(r => r.confidence === 'LOW').length;
  const noMatch    = mapping.filter(r => r.confidence === 'NONE').length;
  const uncertain  = medConf + lowConf + noMatch;

  console.log('\n📊 Confidence breakdown:');
  console.log(`   HIGH   : ${highConf}  (pre-filled in col F — verify a sample, all are editable)`);
  console.log(`   MEDIUM : ${medConf}  ← NEED YOUR INPUT (3 options in cols G/H/I)`);
  console.log(`   LOW    : ${lowConf}  ← NEED YOUR INPUT (3 options in cols G/H/I)`);
  console.log(`   NONE   : ${noMatch}  ← NEED YOUR INPUT (no match — use Employees sheet)`);
  console.log(`\n⚠️  ${uncertain} rows need review (top of sheet) — ₹31.7 L in incentives.`);
  console.log(`   ${highConf} HIGH rows are pre-filled at the bottom — spot-check advised.`);
  console.log(`\n✅ Written to: ${OUT_XLSX}`);
  console.log('\nHow to review (open in Microsoft Excel):');
  console.log('1. Open the "Mapping" sheet.  Rows are sorted: MEDIUM → LOW → NONE → HIGH.');
  console.log('   Yellow = MEDIUM, Orange = LOW, Red = NONE, Green = HIGH (pre-filled).');
  console.log('2. For each uncertain row (blank col F): click the cell and use the DROPDOWN');
  console.log('   to pick an employee.  Cols G/H/I show the top-3 suggestions for quick reference.');
  console.log('   Pick "NONE" or leave blank to skip the incentive for that referrer.');
  console.log('3. HIGH rows (green, bottom) are pre-filled but editable — spot-check');
  console.log('   common names like "Ramachandran", "Saraswathi" (same name, different people).');
  console.log('4. Save and return the file, then re-run the importer dry-run.');
  console.log('   Signal: "Referrer linked" should climb well past 155 once rows are filled.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
