// frontend/src/pages/schemes/corrections/EntryEditForm.jsx
// Edit form for one entry — fields come from SCHEME_FIELDS for the entry's scheme.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import { Loader2, X, Check } from 'lucide-react';
import { useGetGoldEmployeesQuery } from '../../../store/api/apiSlice';
import { CustomerPicker } from '../../../components/CustomerPicker';
import { FormError } from '../components/FormError';
import { ProofUploadField } from '../../../components/money/ProofUploadField';
import { TransactionIdField } from '../../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../../components/money/CashBankSplitField';
import {
  SCHEME_PAYMENT_MODES,
  MODE_LABEL,
  LAND_PAYMENT_MODES,
  LAND_MODE_LABEL,
  IC,
} from './constants';

// ─── Rich entry edit form ─────────────────────────────────────────────────────

export const EntryEditForm = ({ entry, schemeCode, branchId, fields, actions, onClose }) => {
  const { data: employees = [] } = useGetGoldEmployeesQuery(branchId, { skip: !branchId });

  const initForm = () => {
    const f = {};
    fields.forEach((field) => {
      if (field.type === 'customer') {
        f[field.key] = null;
      } else if (field.type === 'boolean') {
        // '' = leave unchanged — sending the current value would trip server
        // guards on entries where the field doesn't apply yet (e.g. land loan
        // fields before a full payment is recorded).
        f[field.key] = '';
      } else if (field.entryKey && entry[field.entryKey] != null) {
        f[field.key] = field.type === 'date'
          ? String(entry[field.entryKey]).slice(0, 10)
          : String(entry[field.entryKey]);
      } else {
        f[field.key] = '';
      }
    });
    return f;
  };

  const [form, setForm] = useState(initForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modeField = fields.find(f => f.type === 'mode');
  const [entryProofKey,     setEntryProofKey]     = useState([]);
  const [entryTxnId,        setEntryTxnId]        = useState([]);
  // Pre-fill the cash_bank split from the existing entry so unrelated edits keep it valid
  const [entrySplit,        setEntrySplit]        = useState(() => ({
    cashAmount: modeField && entry[modeField.cashEntryKey] != null ? String(entry[modeField.cashEntryKey]) : '',
    bankAmount: modeField && entry[modeField.bankEntryKey] != null ? String(entry[modeField.bankEntryKey]) : '',
  }));
  const [showEntryProofErr, setShowEntryProofErr] = useState(false);

  const entityArgs = actions.entityKey(entry);

  // Expected total the cash_bank split must equal: the live editable amount when present
  // (trading), otherwise the entry's fixed amount column (slots / builders lump sum).
  const entryExpectedTotal = modeField
    ? (modeField.amountFormKey && form[modeField.amountFormKey] !== ''
        ? parseFloat(form[modeField.amountFormKey])
        : (entry[modeField.amountEntryKey] != null ? parseFloat(entry[modeField.amountEntryKey]) : undefined))
    : undefined;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modeField && form[modeField.key] && form[modeField.key] !== 'cash'
        && (!entryProofKey.length || (modeField.txnField && !entryTxnId.length))) {
      setShowEntryProofErr(true);
      setError('Payment proof and transaction ID are required when changing mode to GPay/Bank.');
      return;
    }
    const splitCash = parseFloat(entrySplit.cashAmount) || 0;
    const splitBank = parseFloat(entrySplit.bankAmount) || 0;
    if (modeField && form[modeField.key] === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 ||
         (entryExpectedTotal != null && Math.abs(splitCash + splitBank - entryExpectedTotal) > 0.01))) {
      setShowEntryProofErr(true);
      setError('Cash + bank amounts must be filled and equal the entry amount.');
      return;
    }
    setBusy(true); setError('');
    try {
      const payload = { branchId };
      if (modeField && form[modeField.key] === 'cash_bank') {
        payload[modeField.cashField] = splitCash;
        payload[modeField.bankField] = splitBank;
      }
      fields.forEach((field) => {
        const val = form[field.key];
        if (field.type === 'customer') {
          if (val?.id) payload.customerId = val.id;
        } else if (field.type === 'referrer') {
          // Always send: null clears an existing referrer (triggers incentive claw-back)
          payload[field.key] = (val === '' || val == null) ? null : val;
        } else if (field.type === 'number') {
          if (val !== '') payload[field.key] = parseFloat(val);
        } else if (field.type === 'boolean') {
          if (val !== '') payload[field.key] = val === 'yes';
        } else if (val !== '') {
          payload[field.key] = val || null;
        }
      });
      if (modeField && entryProofKey.length) {
        payload[modeField.proofField] = entryProofKey;
      }
      if (modeField && modeField.txnField && entryTxnId.length) {
        payload[modeField.txnField] = entryTxnId;
      }
      await actions.correct({ ...entityArgs, ...payload }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save correction.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-border pt-3 space-y-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Correct Entry</p>
      {fields.map((field) => {
        // For referrer fields: always include the entry's current referrer as an option even
        // if they're inactive or from a different branch — so the pre-selected UUID always matches.
        let empOptions = employees;
        if (field.type === 'referrer' && field.entryKey) {
          const currentId = entry[field.entryKey];
          const nameKey = field.entryKey === 'enrolled_by' ? 'enrolled_by_name' : 'referrer_name';
          const inList = employees.some((e) => e.id === currentId);
          if (currentId && !inList) {
            empOptions = [{ id: currentId, name: entry[nameKey] || 'Current referrer', role: '' }, ...employees];
          }
        }
        return (
        <div key={field.key}>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">{field.label}</label>
          {field.type === 'customer' && (
            <CustomerPicker
              value={form[field.key]}
              onChange={(c) => setForm((f) => ({ ...f, [field.key]: c }))}
              branchId={branchId}
              placeholder={entry.customer_name || 'Search / create customer…'}
            />
          )}
          {field.type === 'referrer' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              <option value="">— No referrer —</option>
              {empOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}{emp.transferred ? ' (Transferred)' : ''}{emp.role ? ` (${emp.role})` : ''}</option>
              ))}
            </select>
          )}
          {field.type === 'text' && (
            <input type="text" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} />
          )}
          {field.type === 'number' && (
            <input type="number" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} step="0.01" />
          )}
          {field.type === 'date' && (
            <input type="date" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} />
          )}
          {field.type === 'mode' && (
            <select value={form[field.key]} onChange={(e) => { setForm((f) => ({ ...f, [field.key]: e.target.value })); setEntryProofKey([]); setEntryTxnId(''); setEntrySplit({ cashAmount: '', bankAmount: '' }); setShowEntryProofErr(false); }}
              className={`${IC} appearance-none`}>
              {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          )}
          {field.type === 'mode' && (
            <CashBankSplitField
              mode={form[field.key]}
              cashAmount={entrySplit.cashAmount}
              bankAmount={entrySplit.bankAmount}
              onChange={setEntrySplit}
              expectedTotal={entryExpectedTotal}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'mode' && form[field.key] && form[field.key] !== 'cash' && (
            <ProofUploadField
              mode={form[field.key]}
              proofKey={entryProofKey}
              onChange={(keys) => { setEntryProofKey(keys); if (keys?.length) setShowEntryProofErr(false); }}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'mode' && field.txnField && (
            <TransactionIdField
              mode={form[field.key]}
              value={entryTxnId}
              onChange={setEntryTxnId}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'landMode' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              {LAND_PAYMENT_MODES.map((m) => <option key={m} value={m}>{LAND_MODE_LABEL[m]}</option>)}
            </select>
          )}
          {field.type === 'boolean' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              <option value="">— unchanged —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          )}
          {field.type === 'textarea' && (
            <textarea value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              rows={2} className={`${IC} resize-none`} placeholder="Correction note…" />
          )}
        </div>
        );
      })}
      {error && <FormError error={error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="flex-1 py-2.5 rounded-xl bg-stone-700 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save Correction
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
          <X size={12} />
        </button>
      </div>
    </form>
  );
};
