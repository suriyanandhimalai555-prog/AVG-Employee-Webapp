// frontend/src/pages/schemes/corrections/AddPaymentForm.jsx
// Inline "record a missed payment" form used inside the payments panels.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import { Loader2, X, Check } from 'lucide-react';
import { ProofUploadField } from '../../../components/money/ProofUploadField';
import { TransactionIdField } from '../../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../../components/money/CashBankSplitField';
import { SCHEME_PAYMENT_MODES, MODE_LABEL, IC } from './constants';

// ─── AddPaymentForm — inline "Record missed payment" form inside PaymentsPanel ─

export const AddPaymentForm = ({ payments, onAdd, onClose, maxMonth }) => {
  // Pre-fill to the next missing month (max existing + 1, or 1 if none recorded).
  const nextMonth = payments.length > 0
    ? Math.max(...payments.map((p) => p.month_number ?? 0)) + 1
    : 1;

  const [form, setForm] = useState({
    monthNumber: String(Math.min(nextMonth, maxMonth || 60)),
    amount:      '',
    date:        new Date().toISOString().slice(0, 10),
    paymentMode: 'cash',
    notes:       '',
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [split,        setSplit]        = useState({ cashAmount: '', bankAmount: '', gpayAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.date) { setError('Amount and date are required.'); return; }
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    const splitGpay = parseFloat(split.gpayAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - parseFloat(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    if (form.paymentMode === 'cash_gpay' &&
        (splitCash <= 0 || splitGpay <= 0 || Math.abs(splitCash + splitGpay - parseFloat(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + GPay amounts must be filled and equal the payment amount.');
      return;
    }
    setBusy(true); setError('');
    try {
      await onAdd({
        monthNumber: parseInt(form.monthNumber, 10),
        amount:      parseFloat(form.amount),
        date:        form.date,
        paymentMode: form.paymentMode,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: (form.paymentMode === 'cash_bank' || form.paymentMode === 'cash_gpay') ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        gpayAmount: form.paymentMode === 'cash_gpay' ? splitGpay : undefined,
        notes:       form.notes || undefined,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record payment.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-emerald-100 bg-emerald-50/40 rounded-xl px-3 py-3 mt-2 space-y-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">Record Missed Payment</span>
        <button type="button" onClick={onClose} className="text-navy/30 hover:text-navy/60"><X size={12} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Month #</label>
          <input
            type="number" min={1} max={maxMonth || 60}
            value={form.monthNumber}
            onChange={(e) => setForm((f) => ({ ...f, monthNumber: e.target.value }))}
            className={IC}
          />
        </div>
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Amount</label>
          <input
            type="number" step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className={IC}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Date Paid</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={IC}
          />
        </div>
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Mode</label>
          <select
            value={form.paymentMode}
            onChange={(e) => { setForm((f) => ({ ...f, paymentMode: e.target.value })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '', gpayAmount: '' }); setShowProofErr(false); }}
            className={`${IC} appearance-none`}
          >
            {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </div>
      </div>
      <CashBankSplitField
        mode={form.paymentMode}
        cashAmount={split.cashAmount}
        bankAmount={split.bankAmount}
        gpayAmount={split.gpayAmount}
        onChange={setSplit}
        expectedTotal={form.amount ? parseFloat(form.amount) : undefined}
        showError={showProofErr}
      />
      <ProofUploadField
        mode={form.paymentMode}
        proofKey={proofKey}
        onChange={(keys) => { setProofKey(keys); if (keys?.length) setShowProofErr(false); }}
        showError={showProofErr}
      />
      <TransactionIdField
        mode={form.paymentMode}
        value={txnId}
        onChange={setTxnId}
        showError={showProofErr}
      />
      <div>
        <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Notes (optional)</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={IC}
          placeholder="Correction note…"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="w-full py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5"
      >
        {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
        Save Payment
      </button>
    </form>
  );
};
