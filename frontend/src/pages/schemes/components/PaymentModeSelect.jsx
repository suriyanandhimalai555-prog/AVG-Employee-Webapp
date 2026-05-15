// Shared payment mode selector used across scheme forms.
// variant="buttons" → 3-button toggle grid (GoldSchemeAddPage style)
// variant="dropdown" → <select> with ChevronDown (modal/sheet style)
import { ChevronDown } from 'lucide-react';
import { SCHEME_PAYMENT_MODES } from '../../../lib/schemeConstants';

export const PaymentModeSelect = ({ value, onChange, variant = 'buttons', className = '' }) => {
  if (variant === 'dropdown') {
    return (
      <div className="relative">
        <select
          value={value}
          onChange={onChange}
          className={`appearance-none pr-8 ${className}`}
        >
          {SCHEME_PAYMENT_MODES.map(({ value: v, label }) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {SCHEME_PAYMENT_MODES.map(({ value: v, label }) => (
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
