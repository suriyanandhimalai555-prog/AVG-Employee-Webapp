// Shared cash + split input used across scheme payment forms.
// Renders for 'cash_bank' (cash + bank transfer) and 'cash_gpay' (cash + GPay),
// both of which split one payment row into two portions that must sum to the total.
// Returns null for any other mode so it is always safe to render unconditionally.
//
// Props:
//   mode           - 'cash' | 'gpay' | 'bank_receipt' | 'cash_bank' | 'cash_gpay'
//   cashAmount     - current cash portion (string or number)
//   bankAmount     - current bank portion — used when mode is 'cash_bank'
//   gpayAmount     - current GPay portion — used when mode is 'cash_gpay'
//   onChange({ cashAmount, bankAmount, gpayAmount }) - called on every keystroke;
//                    the unused second-portion key is passed through unchanged so
//                    callers can hold a single split state object.
//   expectedTotal  - optional locked total (fixed-amount schemes); when set, the
//                    split must sum to it. When omitted the total is just shown.
//   showError      - true to highlight when invalid after a submit attempt

import { formatCurrency } from '../../lib/formatters';

// Derive the second-portion label and colour from the payment mode.
function getSecondConfig(mode) {
  if (mode === 'cash_gpay') return { label: 'GPay', colorClass: 'text-indigo' };
  return { label: 'Bank', colorClass: 'text-emerald-600' };
}

export const CashBankSplitField = ({
  mode,
  cashAmount,
  bankAmount,
  gpayAmount,
  onChange,
  expectedTotal,
  showError = false,
}) => {
  const isCashBank = mode === 'cash_bank';
  const isCashGpay = mode === 'cash_gpay';
  if (!isCashBank && !isCashGpay) return null;

  const { label: secondLabel, colorClass: secondColor } = getSecondConfig(mode);

  const cash       = parseFloat(cashAmount) || 0;
  // second-portion value depends on the current mode
  const secondRaw  = isCashGpay ? gpayAmount : bankAmount;
  const second     = parseFloat(secondRaw) || 0;
  const total      = cash + second;

  const bothEntered  = cash > 0 && second > 0;
  const matchesTotal = expectedTotal == null
    ? true
    : Math.abs(total - Number(expectedTotal)) < 0.01;
  const invalid = !bothEntered || !matchesTotal;

  const inputClass = (bad) =>
    `flex-1 px-4 py-3 bg-white rounded-2xl border ${
      showError && bad ? 'border-red-400' : 'border-navy/10'
    } text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30`;

  // When the cash input changes, emit unchanged gpayAmount / bankAmount too so the
  // caller's split state stays consistent regardless of which mode is active.
  const onCashChange = (val) =>
    onChange({ cashAmount: val, bankAmount, gpayAmount });

  // Second-portion change: emit the right key for each mode.
  const onSecondChange = (val) => {
    if (isCashGpay) {
      onChange({ cashAmount, bankAmount, gpayAmount: val });
    } else {
      onChange({ cashAmount, bankAmount: val, gpayAmount });
    }
  };

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Cash + {secondLabel} split <span className="text-red-400">*</span>
      </label>

      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cashAmount ?? ''}
            onChange={(e) => onCashChange(e.target.value)}
            placeholder="Cash ₹"
            className={inputClass(showError && cash <= 0)}
          />
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-600 mt-1 ml-1">Cash</p>
        </div>
        <div className="flex-1">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={secondRaw ?? ''}
            onChange={(e) => onSecondChange(e.target.value)}
            placeholder={`${secondLabel} ₹`}
            className={inputClass(showError && second <= 0)}
          />
          <p className={`text-[9px] font-bold uppercase tracking-wider mt-1 ml-1 ${secondColor}`}>{secondLabel}</p>
        </div>
      </div>

      {/* Running total + match hint */}
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-medium text-navy/50">
          Total: <span className="font-bold text-navy/70">{formatCurrency(total)}</span>
          {expectedTotal != null && (
            <span className="text-navy/40"> / {formatCurrency(Number(expectedTotal))}</span>
          )}
        </span>
        {bothEntered && matchesTotal && (
          <span className="text-[10px] font-medium text-emerald-500">Split balanced ✓</span>
        )}
      </div>

      {showError && invalid && (
        <p className="text-[10px] text-red-500 font-medium">
          {!bothEntered
            ? `Enter both the cash and ${secondLabel.toLowerCase()} amounts.`
            : `Cash + ${secondLabel.toLowerCase()} must equal ${formatCurrency(Number(expectedTotal))}.`}
        </p>
      )}
    </div>
  );
};
