import { describe, it, expect } from 'vitest';
import { getPeriodStartForDate, resolvePeriodStart } from './scheme-period';

// ─── Default math (pure, no DB) ──────────────────────────────────────────────

describe('getPeriodStartForDate', () => {
  it('day >= 7 → same month period start', () => {
    expect(getPeriodStartForDate('2026-06-14')).toBe('2026-06-07');
    expect(getPeriodStartForDate('2026-06-07')).toBe('2026-06-07'); // exactly the 7th
    expect(getPeriodStartForDate('2026-06-30')).toBe('2026-06-07');
  });

  it('day < 7 → previous month period start', () => {
    expect(getPeriodStartForDate('2026-06-06')).toBe('2026-05-07');
    expect(getPeriodStartForDate('2026-06-01')).toBe('2026-05-07');
  });

  it('year rollback: January day < 7 → December of previous year', () => {
    expect(getPeriodStartForDate('2026-01-03')).toBe('2025-12-07');
    expect(getPeriodStartForDate('2026-01-06')).toBe('2025-12-07');
  });

  it('January day >= 7 stays in January', () => {
    expect(getPeriodStartForDate('2026-01-07')).toBe('2026-01-07');
    expect(getPeriodStartForDate('2026-01-31')).toBe('2026-01-07');
  });

  it('zero-pads single-digit months', () => {
    expect(getPeriodStartForDate('2026-03-01')).toBe('2026-02-07');
    expect(getPeriodStartForDate('2026-09-14')).toBe('2026-09-07');
  });

  it('leap year boundary: March 1 → February period', () => {
    expect(getPeriodStartForDate('2024-03-01')).toBe('2024-02-07');
  });
});

// ─── Override-aware resolver ──────────────────────────────────────────────────

// Mock db.query returns the given override rows.
function mockDb(rows: { period_key: string; custom_start: string }[]) {
  return {
    query: async () => ({ rows }),
  } as any;
}

describe('resolvePeriodStart — no overrides', () => {
  it('falls back to default 7-to-6 math when no rows returned', async () => {
    const db = mockDb([]);
    expect(await resolvePeriodStart(db, '2026-06-14')).toBe('2026-06-07');
    expect(await resolvePeriodStart(db, '2026-06-06')).toBe('2026-05-07');
    expect(await resolvePeriodStart(db, '2026-01-03')).toBe('2025-12-07');
  });
});

describe('resolvePeriodStart — with overrides', () => {
  it('returns the custom_start when a direct override exists for the candidate', async () => {
    // May 2026 period starts on May 8 instead of May 7
    const db = mockDb([
      { period_key: '2026-05-07', custom_start: '2026-05-08' },
      { period_key: '2026-06-07', custom_start: '2026-06-06' }, // end auto-shifted to Jun 5
    ]);
    // May 8–Jun 5 is now the May period; Jun 6 starts the June period
    expect(await resolvePeriodStart(db, '2026-05-08')).toBe('2026-05-08');
    expect(await resolvePeriodStart(db, '2026-05-20')).toBe('2026-05-08');
    expect(await resolvePeriodStart(db, '2026-06-05')).toBe('2026-05-08');
  });

  it('May 7 falls in the PREVIOUS (April) period when May starts on the 8th', async () => {
    // May period shifted to start on the 8th → May 7 belongs to April's period
    const db = mockDb([
      { period_key: '2026-04-07', custom_start: '2026-04-07' }, // April unchanged
      { period_key: '2026-05-07', custom_start: '2026-05-08' }, // May starts 8th
    ]);
    // April period: Apr 7 → May 7 (one day extra because May starts on the 8th)
    expect(await resolvePeriodStart(db, '2026-05-07')).toBe('2026-04-07');
  });

  it('returns the June custom_start when dateISO falls in the adjusted June period', async () => {
    // June period shifted: starts Jun 6
    const db = mockDb([
      { period_key: '2026-05-07', custom_start: '2026-05-08' },
      { period_key: '2026-06-07', custom_start: '2026-06-06' },
      { period_key: '2026-07-07', custom_start: '2026-07-07' },
    ]);
    // June 6 is the first day of the June period
    expect(await resolvePeriodStart(db, '2026-06-06')).toBe('2026-06-06');
    expect(await resolvePeriodStart(db, '2026-06-20')).toBe('2026-06-06');
  });

  it('December → January year-rollover override', async () => {
    const db = mockDb([
      { period_key: '2026-12-07', custom_start: '2026-12-10' },
      { period_key: '2027-01-07', custom_start: '2027-01-09' }, // auto-shifted Jan start
    ]);
    // Dec 10 to Jan 8 is the December period
    expect(await resolvePeriodStart(db, '2026-12-10')).toBe('2026-12-10');
    expect(await resolvePeriodStart(db, '2027-01-08')).toBe('2026-12-10');
    // Jan 9 starts the January period
    expect(await resolvePeriodStart(db, '2027-01-09')).toBe('2027-01-09');
  });
});
