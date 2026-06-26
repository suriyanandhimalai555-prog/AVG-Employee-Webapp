// Bottom-sheet modal for recording a monthly gold scheme payment.
// Extracted from GoldMemberDetailPage where it was defined inline.
// Intentionally uses bg-navy/2 inputClass (modal context differs from page forms).
import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { CheckCircle2, Loader2, X } from 'lucide-react';
import { selectCurrentUser } from '../../../store/slices/authSlice';
import { useAddGoldPaymentMutation } from '../../../store/api/apiSlice';
import { needsBranchSelection } from '../../../lib/schemeAuth';
import { BranchPicker } from '../../../components/BranchPicker';
import { PeriodDateInput } from '../../../components/PeriodDateInput';
import { SCHEME_MODE_LABELS, SCHEME_MODE_STYLES, getTodayISO } from '../../../lib/schemeConstants';
import { ProofUploadField } from '../../../components/money/ProofUploadField';
import { TransactionIdField } from '../../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../../components/money/CashBankSplitField';
import { FormError } from './FormError';

const MODAL_INPUT_CLASS =
  'w-full px-4 py-3 bg-navy/2 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20';

export const AddPaymentModal = ({ member, payments, onClose, onSuccess }) => {
  const user = useSelector(selectCurrentUser);
  const isManagement = needsBranchSelection(user?.role);

  const paidMonths = new Set((payments || []).map(p => p.month_number));
  const nextMonth  = (() => {
    for (let m = 1; m <= member.total_months; m++) {
      if (!paidMonths.has(m)) return m;
    }
    return null;
  })();

  const [form, setForm] = useState({
    monthNumber: nextMonth || 1,
    paidDate:    getTodayISO(),
    amount:      parseFloat(member.monthly_amount),
    paymentMode: 'cash',
    notes:       '',
  });
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [split,        setSplit]        = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);
  const [branchId, setBranchId]             = useState('');
  const [error, setError]                   = useState(null);
  const [addPayment, { isLoading }]         = useAddGoldPaymentMutation();

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - parseFloat(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    try {
      await addPayment({
        memberId:    member.id,
        monthNumber: parseInt(form.monthNumber, 10),
        paidDate:    form.paidDate,
        amount:      parseFloat(form.amount),
        paymentMode: form.paymentMode,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        notes:       form.notes.trim() || undefined,
        branchId:    isManagement ? branchId : undefined,
      }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record payment.');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end justify-center bg-navy/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-[28px] p-6 pb-10 space-y-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-navy">Record Payment</p>
            <p className="text-[10px] font-medium text-navy/40 mt-0.5">
              {member.customer_name} · Chit {member.chit_number}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-navy/5 rounded-full">
            <X size={18} className="text-navy/40" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Branch picker — only shown for management accounts */}
          {isManagement && (
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
                Branch *
              </label>
              <BranchPicker value={branchId} onChange={setBranchId} className={MODAL_INPUT_CLASS} />
            </div>
          )}

          {/* Month + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
                Month No.
              </label>
              <select
                value={form.monthNumber}
                onChange={set('monthNumber')}
                className={`${MODAL_INPUT_CLASS} appearance-none`}
              >
                {Array.from({ length: member.total_months }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m} disabled={paidMonths.has(m)}>
                    Month {m}{paidMonths.has(m) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
                Date Paid
              </label>
              <PeriodDateInput value={form.paidDate} onChange={set('paidDate')} className={MODAL_INPUT_CLASS} />
            </div>
          </div>

          {/* Amount + mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
                Amount (₹)
              </label>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={set('amount')}
                className={MODAL_INPUT_CLASS}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
                Mode
              </label>
              <div className="relative">
                <select
                  value={form.paymentMode}
                  onChange={(e) => { set('paymentMode')(e); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
                  className={`${MODAL_INPUT_CLASS} appearance-none pr-8`}
                >
                  {Object.entries(SCHEME_MODE_LABELS).map(([val, lbl]) => (
                    <option key={val} value={val}>{lbl}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <CashBankSplitField
            mode={form.paymentMode}
            cashAmount={split.cashAmount}
            bankAmount={split.bankAmount}
            onChange={setSplit}
            expectedTotal={form.amount ? parseFloat(form.amount) : undefined}
            showError={showProofErr}
          />

          <ProofUploadField
            mode={form.paymentMode}
            proofKey={proofKey}
            onChange={setProofKey}
            showError={showProofErr}
          />

          <TransactionIdField
            mode={form.paymentMode}
            value={txnId}
            onChange={setTxnId}
            showError={showProofErr}
          />

          {/* Notes */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">
              Notes (optional)
            </label>
            <input
              type="text"
              placeholder="Any note…"
              value={form.notes}
              onChange={set('notes')}
              className={MODAL_INPUT_CLASS}
            />
          </div>

          <FormError error={error} />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-emerald-500 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-emerald-500/20"
          >
            {isLoading
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <CheckCircle2 size={16} aria-hidden="true" />}
            Save Payment
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};
