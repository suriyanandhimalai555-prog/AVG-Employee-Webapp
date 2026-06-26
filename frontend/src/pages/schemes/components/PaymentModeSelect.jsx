// Shared payment mode selector used across scheme forms.
// variant="buttons" → toggle grid (GoldSchemeAddPage style)
// variant="dropdown" → <select> with ChevronDown (modal/sheet style)
// includeSplit=true adds the "Cash + Bank" split mode (opt-in: schemes that don't
// support a split — e.g. Land channels — leave it off and keep the base 3 modes).
import { ChevronDown } from 'lucide-react';
import { SCHEME_PAYMENT_MODES, SCHEME_PAYMENT_MODES_WITH_SPLIT } from '../../../lib/schemeConstants';

export const PaymentModeSelect = ({ value, onChange, variant = 'buttons', includeSplit = false, className = '' }) => {
  const modes = includeSplit ? SCHEME_PAYMENT_MODES_WITH_SPLIT : SCHEME_PAYMENT_MODES;

  if (variant === 'dropdown') {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className={`appearance-none pr-8 ${className}`}
        >
          {modes.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
      </div>
    );
  }

  // 4 modes wrap to a 2×2 grid; the base 3 stay on one row.
  return (
    <div className={`grid ${modes.length > 3 ? 'grid-cols-2' : 'grid-cols-3'} gap-2`}>
      {modes.map(({ value: v, label }) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
            value === v
              ? 'bg-indigo text-white border-indigo shadow-md shadow-indigo/20'
              : 'bg-white text-navy/50 border-navy/10'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};
