import { useMemo, useEffect } from 'react';
import { getCurrentPeriod } from '../lib/schemePeriod';

/**
 * Date input clamped to the current 7-to-7 business period.
 *
 * - Sets HTML5 `min` / `max` so native pickers grey out invalid dates.
 * - If the bound value is outside the period (or empty), auto-corrects it to today
 *   (today is always inside the current period by definition).
 *
 * Drop-in replacement for `<input type="date" value={...} onChange={...} />`.
 */
export const PeriodDateInput = ({ value, onChange, className, required, ...rest }) => {
  const period = useMemo(() => getCurrentPeriod(), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Auto-correct an out-of-period or empty value so the form never submits a
  // date the server would reject.
  useEffect(() => {
    if (!value || value < period.startDate || value > period.endDate) {
      onChange?.({ target: { value: today } });
    }
    // Only run on mount / when the period boundary shifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.startDate, period.endDate]);

  return (
    <input
      type="date"
      value={value || today}
      onChange={onChange}
      min={period.startDate}
      max={period.endDate}
      className={className}
      required={required}
      {...rest}
    />
  );
};
