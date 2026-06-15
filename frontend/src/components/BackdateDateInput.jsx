import { useCanBackdate } from '../hooks/useCanBackdate';
import { getCurrentPeriod } from '../lib/schemePeriod';

/**
 * Date input for scheme entry forms whose business date may be backdated.
 *
 * Without backdate permission, `min` is floored at the current period start
 * (the 7th of the current month or the previous month's 7th when today < 7).
 * This matches the server guard in assertBackdateAllowed, which also allows
 * all dates within the current 7-to-6 period without requiring the flag.
 *
 * With backdate permission (management always; branch admins while the
 * management toggle is on), `min` is lifted to undefined so any past date
 * is pickable. The server enforces the same rule; this is only the UX side.
 *
 * Drop-in replacement for `<input type="date" value={...} onChange={...} />`.
 */
export const BackdateDateInput = ({ value, onChange, className, required, ...rest }) => {
  const canBackdate  = useCanBackdate();
  const periodStart  = getCurrentPeriod().startDate; // e.g. '2026-06-07'
  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      min={canBackdate ? undefined : periodStart}
      className={className}
      required={required}
      {...rest}
    />
  );
};
