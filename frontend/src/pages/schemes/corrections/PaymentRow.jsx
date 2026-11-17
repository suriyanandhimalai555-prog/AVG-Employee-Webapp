// frontend/src/pages/schemes/corrections/PaymentRow.jsx
// A single recorded payment with inline edit (amount / date / mode / proof) and remove.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import {
  Loader2,
  Edit2,
  X,
  Check,
  Undo2,
} from 'lucide-react';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { ProofUploadField } from '../../../components/money/ProofUploadField';
import { TransactionIdField } from '../../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../../components/money/CashBankSplitField';
import { PhotoProof } from '../../../components/money/PhotoProof';
import { TransactionIdList } from '../../../components/money/TransactionIdList';
import { SCHEME_PAYMENT_MODES, MODE_LABEL, IC } from './constants';

// ─── Single editable payment row ─────────────────────────────────────────────

export const PaymentRow = ({ payment, branchId, amountField, dateField, modeField, label, onCorrect, onUnpay }) => {
  const [editOpen,  setEditOpen]  = useState(false);
  const [unpayOpen, setUnpayOpen] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [form, setForm] = useState({
    amount:      payment[amountField] ? String(payment[amountField]) : '',
    date:        payment[dateField]   ? payment[dateField].slice(0, 10) : '',
    paymentMode: payment[modeField]   || 'cash',
    notes:       payment.notes        || '',
  });
  const [proofKey,     setProofKey]     = useState([]);
  // Normalize legacy scalar (pre-migration single string) → array for the new multi-id field
  const [txnId,        setTxnId]        = useState(
    Array.isArray(payment.transaction_id)
      ? payment.transaction_id
      : (payment.transaction_id ? [payment.transaction_id] : [])
  );
  // Pre-fill the cash_bank / cash_gpay split from the existing row so an unrelated edit keeps it valid
  const [split,        setSplit]        = useState({
    cashAmount: payment.cash_amount != null ? String(payment.cash_amount) : '',
    bankAmount: payment.bank_amount != null ? String(payment.bank_amount) : '',
    gpayAmount: payment.gpay_amount != null ? String(payment.gpay_amount) : '',
  });
  const [showProofErr, setShowProofErr] = useState(false);

  const handleCorrect = async (e) => {
    e.preventDefault();
    if (form.paymentMode && form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for non-cash payment corrections.');
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
      await onCorrect({
        amount:      form.amount      ? parseFloat(form.amount) : undefined,
        [dateField]: form.date        || undefined,
        paymentMode: form.paymentMode || undefined,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: form.paymentMode && form.paymentMode !== 'cash' ? (txnId.length ? txnId : undefined) : undefined,
        cashAmount: (form.paymentMode === 'cash_bank' || form.paymentMode === 'cash_gpay') ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        gpayAmount: form.paymentMode === 'cash_gpay' ? splitGpay : undefined,
        notes:       form.notes       ?? undefined,
        branchId,
      }).unwrap();
      setEditOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to save.'); }
    finally { setBusy(false); }
  };

  const handleUnpay = async () => {
    setBusy(true); setError('');
    try {
      await onUnpay().unwrap();
      setUnpayOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to unmark.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-navy/3 rounded-xl px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-navy">{label}</span>
          <span className="ml-2 text-[10px] text-navy/50">
            {formatCurrency(payment[amountField])} · {formatDate(payment[dateField])} · {payment[modeField]?.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => { setEditOpen((v) => !v); setUnpayOpen(false); }}
            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-navy/40 hover:text-indigo tactile-press" aria-label="Edit payment">
            <Edit2 size={10} />
          </button>
          <button type="button" onClick={() => { setUnpayOpen((v) => !v); setEditOpen(false); }}
            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-navy/40 hover:text-red-600 tactile-press" aria-label="Unmark as paid">
            <Undo2 size={10} />
          </button>
        </div>
      </div>
      <PhotoProof photoKey={payment.proof_key} />
      <TransactionIdList transactionId={payment.transaction_id} />

      {editOpen && (
        <form onSubmit={handleCorrect} className="border-t border-navy/10 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={IC} step="0.01" />
            </div>
            <div>
              <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={IC} />
            </div>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Mode</label>
            <select value={form.paymentMode} onChange={(e) => { setForm((f) => ({ ...f, paymentMode: e.target.value })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '', gpayAmount: '' }); setShowProofErr(false); }}
              className={`${IC} appearance-none`}>
              {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
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
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={IC} placeholder="Correction note…" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="flex-1 py-2 rounded-xl bg-stone-700 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </button>
            <button type="button" onClick={() => setEditOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press"><X size={10} /></button>
          </div>
        </form>
      )}

      {unpayOpen && (
        <div className="border-t border-red-100 pt-2 space-y-2">
          <p className="text-[10px] text-red-700 font-semibold">Remove this payment? Incentive credits for it will be clawed back.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleUnpay} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />} Confirm Remove
            </button>
            <button type="button" onClick={() => setUnpayOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};
