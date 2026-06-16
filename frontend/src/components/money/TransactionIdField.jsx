// Shared transaction-id input used across all scheme payment forms.
// Renders nothing when mode is 'cash'. For gpay/bank_receipt it shows a
// required text field for the UPI/bank reference number, mirroring the
// look and error behaviour of ProofUploadField.
//
// Props:
//   mode          - 'cash' | 'gpay' | 'bank_receipt'
//   value         - current transaction id string
//   onChange(val) - called with the new string on every keystroke
//   showError     - true to highlight when empty after a submit attempt

export const TransactionIdField = ({ mode, value, onChange, showError = false }) => {
  if (mode === 'cash') return null;

  const empty = !value?.trim();
  const borderClass = showError && empty ? 'border-red-400' : 'border-navy/10';

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Transaction ID <span className="text-red-400">*</span>
      </label>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={mode === 'gpay' ? 'UPI / GPay reference no.' : 'Bank reference no.'}
        maxLength={100}
        className={`w-full px-4 py-3 bg-white rounded-2xl border ${borderClass} text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30`}
      />
      {showError && empty && (
        <p className="text-[10px] text-red-500 font-medium">
          Transaction ID required for {mode === 'gpay' ? 'GPay' : 'bank'} payments.
        </p>
      )}
    </div>
  );
};
