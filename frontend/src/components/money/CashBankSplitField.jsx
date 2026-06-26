// Shared cash + bank split input used across scheme payment forms.
// Renders nothing unless mode is 'cash_bank'. The customer paid part of this
// payment in cash and part by bank transfer — capture both amounts. The bank
// portion's proof + transaction ids are captured by ProofUploadField /
// TransactionIdField (which already render for any non-cash mode).
//
// Props:
//   mode           - 'cash' | 'gpay' | 'bank_receipt' | 'cash_bank'
//   cashAmount     - current cash portion (string or number)
//   bankAmount     - current bank portion (string or number)
//   onChange({ cashAmount, bankAmount }) - called on every keystroke
//   expectedTotal  - optional locked total (fixed-amount schemes); when set, the
//                    split must sum to it. When omitted the total is just shown.
//   showError      - true to highlight when invalid after a submit attempt

import { formatCurrency } from '../../lib/formatters';

export const CashBankSplitField = ({
  mode,
  cashAmount,
  bankAmount,
  onChange,
  expectedTotal,
  showError = false,
}) => {
  if (mode !== 'cash_bank') return null;

  const cash = parseFloat(cashAmount) || 0;
  const bank = parseFloat(bankAmount) || 0;
  const total = cash + bank;

  const bothEntered = cash > 0 && bank > 0;
  const matchesTotal = expectedTotal == null
    ? true
    : Math.abs(total - Number(expectedTotal)) < 0.01;
  const invalid = !bothEntered || !matchesTotal;

  const inputClass = (bad) =>
    `flex-1 px-4 py-3 bg-white rounded-2xl border ${
      showError && bad ? 'border-red-400' : 'border-navy/10'
    } text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30`;

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Cash + Bank split <span className="text-red-400">*</span>
      </label>

      <div className="flex gap-2">
        <div className="flex-1">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={cashAmount ?? ''}
            onChange={(e) => onChange({ cashAmount: e.target.value, bankAmount })}
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
            value={bankAmount ?? ''}
            onChange={(e) => onChange({ cashAmount, bankAmount: e.target.value })}
            placeholder="Bank ₹"
            className={inputClass(showError && bank <= 0)}
          />
          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 mt-1 ml-1">Bank</p>
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
            ? 'Enter both the cash and bank amounts.'
            : `Cash + bank must equal ${formatCurrency(Number(expectedTotal))}.`}
        </p>
      )}
    </div>
  );
};
