import { useMemo, useEffect } from 'react';
import { getCurrentPeriod } from '../lib/schemePeriod';
import { useCanBackdate } from '../hooks/useCanBackdate';

/**
 * Date input clamped to the current 7-to-7 business period.
 *
 * - Sets HTML5 `min` / `max` so native pickers grey out invalid dates.
 * - If the bound value is outside the period (or empty), auto-corrects it to today
 *   (today is always inside the current period by definition).
 * - Backdated entry: when the user may backdate (management, or branch admin
 *   while the management toggle is on) the `min` clamp is lifted so past dates
 *   become pickable. `max` stays at the period end — future entry is never allowed.
 *   The server enforces the same rule, this is only the UX side.
 *
 * Drop-in replacement for `<input type="date" value={...} onChange={...} />`.
 */
export const PeriodDateInput = ({ value, onChange, className, required, ...rest }) => {
  const period = useMemo(() => getCurrentPeriod(), []);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const canBackdate = useCanBackdate();

  // Auto-correct an out-of-period or empty value so the form never submits a
  // date the server would reject. Past dates are left alone when backdating
  // is allowed.
  useEffect(() => {
    const belowMin = !canBackdate && value && value < period.startDate;
    if (!value || belowMin || value > period.endDate) {
      onChange?.({ target: { value: today } });
    }
    // Only run on mount / when the period boundary or permission shifts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period.startDate, period.endDate, canBackdate]);

  return (
    <input
      type="date"
      value={value || today}
      onChange={onChange}
      min={canBackdate ? undefined : period.startDate}
      max={period.endDate}
      className={className}
      required={required}
      {...rest}
    />
  );
};
