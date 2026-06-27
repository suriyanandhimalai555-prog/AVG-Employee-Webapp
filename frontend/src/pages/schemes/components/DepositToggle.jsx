// Shared "Full payment / Pay deposit" toggle for scheme enrollment forms.
// In deposit mode the scheme is held as a pending enrollment until the balance
// clears (see PendingEnrollmentDetailPage). Renders the deposit-amount input too.
//
// Props:
//   mode           - 'full' | 'deposit'
//   onModeChange(m)
//   deposit        - deposit amount string
//   onDepositChange(v)
//   required       - the full required amount (for the deposit max + hint); optional
import { formatCurrency } from '../../../lib/formatters';
import { SCHEME_INPUT_CLASS } from '../../../lib/schemeConstants';
import { FormField } from './FormField';

export const DepositToggle = ({ mode, onModeChange, deposit, onDepositChange, required }) => {
  const dep = parseFloat(deposit) || 0;
  const req = Number(required) || 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {[
          { val: 'full',    label: 'Full payment' },
          { val: 'deposit', label: 'Pay deposit' },
        ].map(({ val, label }) => (
          <button
            key={val} type="button" onClick={() => onModeChange(val)}
            className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
              mode === val ? 'bg-indigo text-white border-indigo shadow-md shadow-indigo/20' : 'bg-white text-navy/50 border-navy/10'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'deposit' && (
        <FormField label={`Deposit amount${req > 0 ? ` (of ${formatCurrency(req)})` : ''}`} required>
          <input
            type="number" min="1" step="0.01" max={req > 0 ? req : undefined}
            value={deposit}
            onChange={(e) => onDepositChange(e.target.value)}
            className={SCHEME_INPUT_CLASS}
            placeholder="0.00"
          />
          {req > 0 && dep > 0 && dep < req && (
            <p className="text-[10px] font-medium text-amber-600 mt-1">
              {formatCurrency(req - dep)} balance will be collected later — the scheme starts once it's fully paid.
            </p>
          )}
        </FormField>
      )}
    </div>
  );
};
