import { describe, it, expect } from 'vitest';
import { getPeriodStartForDate } from './scheme-period';

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
