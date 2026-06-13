import { useCanBackdate } from '../hooks/useCanBackdate';
import { getTodayISO } from '../lib/schemeConstants';

/**
 * Date input for scheme entry forms whose business date may be backdated.
 *
 * Past dates are only pickable when the user is allowed to backdate
 * (management always; branch admins while the management toggle is on) —
 * otherwise `min` pins the picker to today. The server enforces the same
 * rule via assertBackdateAllowed; this is only the UX side.
 *
 * Drop-in replacement for `<input type="date" value={...} onChange={...} />`.
 */
export const BackdateDateInput = ({ value, onChange, className, required, ...rest }) => {
  const canBackdate = useCanBackdate();
  return (
    <input
      type="date"
      value={value}
      onChange={onChange}
      min={canBackdate ? undefined : getTodayISO()}
      className={className}
      required={required}
      {...rest}
    />
  );
};
