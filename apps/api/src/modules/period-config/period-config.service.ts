// Business-month boundary configuration service.
//
// The default period runs the 7th of one month → 6th of the next.  Management can
// override any month's start/end.  We store only the custom_start per period; the end
// is derived as (next period's custom_start - 1 day), so contiguity is structural.
//
// Editing month X's boundaries writes two rows in one transaction:
//   period_key=X    → startDate        (X's overridden start;  is_auto_shifted=FALSE)
//   period_key=X+1  → endDate + 1 day  (auto-shifts the neighbor; is_auto_shifted=TRUE)
//
// Resetting X removes X's row unconditionally AND removes X+1 ONLY when it was written
// as an auto-shifted companion (is_auto_shifted=TRUE).  An independently-set X+1
// override is preserved.

import type { Pool } from 'pg';
import { runInTransaction } from '../../shared/transaction-helper';
import { ValidationError } from '../../shared/errors';
import { PERIOD_START_DAY } from '../../shared/scheme-period';
import type { SetPeriodInput, ResetPeriodInput } from './period-config.schema';

// TS: pad a number to 2 digits — mirrors the helper in scheme-period.ts.
const pad = (n: number): string => String(n).padStart(2, '0');

// TS: build the canonical period_key (YYYY-MM-07) from a 1-indexed month/year pair.
// Uses PERIOD_START_DAY so this stays in sync with scheme-period.ts.
function periodKey(year: number, month1: number): string {
  return `${year}-${pad(month1)}-${pad(PERIOD_START_DAY)}`;
}

// TS: advance one calendar month, handling December → January rollover.
function nextMonth(year: number, month1: number): { year: number; month: number } {
  if (month1 === 12) return { year: year + 1, month: 1 };
  return { year, month: month1 + 1 };
}

// TS: add one calendar day to a YYYY-MM-DD string; avoids timezone traps.
function addOneDay(dateISO: string): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// TS: result shape returned to the API consumer for a single overridden period.
export interface PeriodOverride {
  periodYear:    number;
  periodMonth:   number; // 0-indexed
  customStart:   string; // YYYY-MM-DD
  isAutoShifted: boolean;
}

export const PeriodConfigService = {

  // List all active period overrides, returned as { periodYear, periodMonth (0-indexed), customStart, isAutoShifted }.
  async listOverrides(db: Pool): Promise<PeriodOverride[]> {
    const res = await db.query<{
      period_key:      string;
      custom_start:    string;
      is_auto_shifted: boolean;
    }>(
      `SELECT period_key::text, custom_start::text, is_auto_shifted FROM period_overrides ORDER BY period_key`
    );
    return res.rows.map((r) => {
      const parts = r.period_key.split('-').map(Number);
      return {
        periodYear:    parts[0],
        periodMonth:   parts[1] - 1, // convert to 0-indexed for the frontend
        customStart:   r.custom_start,
        isAutoShifted: r.is_auto_shifted,
      };
    });
  },

  // Set a custom start/end for one calendar month.  The end date implicitly
  // moves the next month's start (auto-shift).  Validates ordering vs. neighbors.
  async setPeriod(
    db:     Pool,
    input:  SetPeriodInput,
    userId: string
  ): Promise<{ periodYear: number; periodMonth: number; startDate: string; endDate: string }> {
    const { periodYear, periodMonth, startDate, endDate } = input;
    // TS: convert from 0-indexed (frontend) to 1-indexed (DB / SQL) for the period key.
    const month1 = periodMonth + 1;
    const keyX   = periodKey(periodYear, month1);
    const next   = nextMonth(periodYear, month1);
    const keyX1  = periodKey(next.year, next.month);

    // Basic date ordering.
    if (startDate > endDate) {
      throw new ValidationError('startDate must be on or before endDate');
    }

    // Span sanity: the period must span at least 1 day and at most ~62 days.
    const spanMs   = new Date(endDate).getTime() - new Date(startDate).getTime();
    const spanDays = spanMs / 86_400_000;
    if (spanDays < 0 || spanDays > 61) {
      throw new ValidationError('Period span must be between 1 and 61 days');
    }

    // Validate that the proposed start is within ~15 days of the canonical 7th.
    const canonicalStartMs  = Date.parse(`${keyX}T00:00:00Z`);
    const proposedStartMs   = Date.parse(`${startDate}T00:00:00Z`);
    const startDriftDays    = Math.abs((proposedStartMs - canonicalStartMs) / 86_400_000);
    if (startDriftDays > 15) {
      throw new ValidationError(
        'Custom start may not differ from the 7th by more than 15 days'
      );
    }

    // Validate that the proposed end is within ~15 days of the canonical 6th (= X+1's
    // default 7th − 1).  Without this guard management could push the end a full month
    // forward, erasing the next calendar month as a business period.
    const canonicalEndMs  = Date.parse(`${keyX1}T00:00:00Z`) - 86_400_000; // X+1.7th − 1 day
    const proposedEndMs   = Date.parse(`${endDate}T00:00:00Z`);
    const endDriftDays    = Math.abs((proposedEndMs - canonicalEndMs) / 86_400_000);
    if (endDriftDays > 15) {
      throw new ValidationError(
        'Custom end may not differ from the 6th by more than 15 days'
      );
    }

    await runInTransaction(db, async (client) => {
      // Upsert row for month X: the explicitly-set start; is_auto_shifted = FALSE.
      await client.query(
        `INSERT INTO period_overrides (period_key, custom_start, is_auto_shifted, updated_by, updated_at)
         VALUES ($1::date, $2::date, FALSE, $3::uuid, now())
         ON CONFLICT (period_key)
         DO UPDATE SET custom_start    = EXCLUDED.custom_start,
                       is_auto_shifted = FALSE,
                       updated_by      = EXCLUDED.updated_by,
                       updated_at      = now()`,
        [keyX, startDate, userId]
      );

      // TS: the auto-shifted start of X+1 is endDate + 1 day; is_auto_shifted = TRUE.
      const nextStart = addOneDay(endDate);
      await client.query(
        `INSERT INTO period_overrides (period_key, custom_start, is_auto_shifted, updated_by, updated_at)
         VALUES ($1::date, $2::date, TRUE, $3::uuid, now())
         ON CONFLICT (period_key)
         DO UPDATE SET custom_start    = EXCLUDED.custom_start,
                       is_auto_shifted = TRUE,
                       updated_by      = EXCLUDED.updated_by,
                       updated_at      = now()`,
        [keyX1, nextStart, userId]
      );
    });

    return { periodYear, periodMonth, startDate, endDate };
  },

  // Delete the override for month X.  Also deletes the auto-shifted X+1 companion row
  // when it was written by this month's setPeriod (is_auto_shifted = TRUE), but leaves
  // an independently-configured X+1 override untouched.
  async resetPeriod(
    db:     Pool,
    input:  ResetPeriodInput,
    userId: string
  ): Promise<void> {
    const { periodYear, periodMonth } = input;
    const month1 = periodMonth + 1;
    const keyX   = periodKey(periodYear, month1);
    const next   = nextMonth(periodYear, month1);
    const keyX1  = periodKey(next.year, next.month);

    await runInTransaction(db, async (client) => {
      // Delete X unconditionally; delete X+1 only when it was the auto-shifted companion.
      await client.query(
        `DELETE FROM period_overrides
          WHERE period_key = $1::date
             OR (period_key = $2::date AND is_auto_shifted = TRUE)`,
        [keyX, keyX1]
      );
    });
    void userId; // userId reserved for a future audit trail if needed
  },
};
