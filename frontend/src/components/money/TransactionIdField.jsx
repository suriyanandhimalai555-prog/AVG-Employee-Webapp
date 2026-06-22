// Shared transaction-id input used across all scheme payment forms.
// Renders nothing when mode is 'cash'. For gpay/bank_receipt it shows a
// dynamic list of up to 5 reference-number inputs, one per split transfer.
// Mirrors the multi-image pattern of ProofUploadField.
//
// Props:
//   mode           - 'cash' | 'gpay' | 'bank_receipt'
//   value          - current transaction ids (string[] or legacy single string)
//   onChange(ids)  - called with the updated string[] on every keystroke / add / remove
//   showError      - true to highlight when empty after a submit attempt

import { Plus, X } from 'lucide-react';

const MAX_IDS = 5;

export const TransactionIdField = ({ mode, value, onChange, showError = false }) => {
  // Normalize: accept string[] (normal), single string (legacy), null/undefined → always []
  const ids = Array.isArray(value) ? value : (value ? [value] : []);

  if (mode === 'cash') return null;

  const placeholder = mode === 'gpay' ? 'UPI / GPay reference no.' : 'Bank reference no.';

  const handleChange = (idx, newVal) => {
    // Update one entry in the array and emit the full array
    const updated = ids.map((v, i) => (i === idx ? newVal : v));
    onChange(updated);
  };

  const handleAdd = () => {
    // Only add if there is room and the last entry is not blank
    if (ids.length >= MAX_IDS) return;
    onChange([...ids, '']);
  };

  const handleRemove = (idx) => {
    const next = ids.filter((_, i) => i !== idx);
    onChange(next);
  };

  // Error state: no ids at all, or all are blank
  const empty = ids.length === 0 || ids.every((v) => !v?.trim());
  const showBorderErr = showError && empty;

  return (
    <div className="space-y-2">
      <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block">
        Transaction ID{ids.length > 1 ? 's' : ''} <span className="text-red-400">*</span>
        {ids.length > 0 && !empty && (
          <span className="ml-2 text-emerald-500 normal-case font-medium">
            {ids.filter(v => v?.trim()).length} {ids.filter(v => v?.trim()).length === 1 ? 'reference' : 'references'} added
          </span>
        )}
      </label>

      {/* One input per id */}
      {ids.map((id, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <input
            type="text"
            value={id}
            onChange={(e) => handleChange(idx, e.target.value)}
            placeholder={placeholder}
            maxLength={100}
            className={`flex-1 px-4 py-3 bg-white rounded-2xl border ${showBorderErr && !id?.trim() ? 'border-red-400' : 'border-navy/10'} text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30`}
          />
          {/* Allow removing any entry if there is more than one */}
          {ids.length > 1 && (
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 tactile-press flex-shrink-0"
              aria-label="Remove transaction ID"
            >
              <X size={12} />
            </button>
          )}
        </div>
      ))}

      {/* "Add another" — hidden once the cap is reached */}
      {ids.length < MAX_IDS && (
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-1.5 text-[10px] font-bold text-indigo hover:text-indigo/70 tactile-press py-1"
        >
          <Plus size={12} className="opacity-70" />
          Add another reference
        </button>
      )}

      {/* First-time empty state — show a single blank input if ids is empty */}
      {ids.length === 0 && (
        <button
          type="button"
          onClick={handleAdd}
          className={`w-full px-4 py-3 bg-white rounded-2xl border ${showBorderErr ? 'border-red-400' : 'border-navy/10'} text-sm font-medium text-navy/30 text-left hover:bg-indigo/5 transition-colors tactile-press`}
        >
          {placeholder}
        </button>
      )}

      {showError && empty && (
        <p className="text-[10px] text-red-500 font-medium">
          Transaction ID required for {mode === 'gpay' ? 'GPay' : 'bank'} payments.
        </p>
      )}
    </div>
  );
};
