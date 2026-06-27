import { useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, Plus, X, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import {
  useGetPendingEnrollmentQuery,
  useAddPendingEnrollmentPaymentMutation,
  useCancelPendingEnrollmentMutation,
  useRetryPendingEnrollmentMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import {
  SCHEME_INPUT_CLASS, getTodayISO,
  SCHEME_MODE_LABELS, SCHEME_MODE_STYLES, SOURCE_META,
  PENDING_ENROLLMENT_STATUS_STYLES,
} from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../components/money/CashBankSplitField';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';
import LoadingSpinner from '../../components/LoadingSpinner';

export const PendingEnrollmentDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const branchId = params.get('branchId') || undefined;

  const { data: pe, isLoading } = useGetPendingEnrollmentQuery(id);
  const [cancel, { isLoading: cancelling }] = useCancelPendingEnrollmentMutation();
  const [retry,  { isLoading: retrying }]   = useRetryPendingEnrollmentMutation();
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState(null);

  if (isLoading || !pe) {
    return <SchemePageWrapper><LoadingSpinner /></SchemePageWrapper>;
  }

  const meta      = SOURCE_META[pe.scheme_code] || SOURCE_META.other;
  const statusUi  = PENDING_ENROLLMENT_STATUS_STYLES[pe.status] || { label: pe.status, className: 'text-navy/50 bg-navy/5' };
  const remaining = Number(pe.remaining);
  const required  = Number(pe.required_amount);
  const paid      = Number(pe.amount_paid);
  const pct       = required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : 0;
  const isCollecting = pe.status === 'collecting';

  const handleCancel = async () => {
    setError(null);
    try { await cancel({ id, branchId }).unwrap(); navigate('/money/schemes/pending'); }
    catch (err) { setError(err?.data?.error?.message || 'Failed to cancel.'); }
  };
  const handleRetry = async () => {
    setError(null);
    try { await retry({ id, branchId }).unwrap(); }
    catch (err) { setError(err?.data?.error?.message || 'Completion failed again.'); }
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader backTo="/money/schemes/pending" title="Pending Enrollment" subtitle={meta.label} />

      <div className="px-4 space-y-4">
        {/* Customer + status */}
        <div className="bg-white rounded-2xl border border-navy/5 card-shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-navy">{pe.customer_name}</p>
              <p className="text-[11px] font-medium text-navy/40">{pe.customer_code}</p>
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold ${statusUi.className}`}>{statusUi.label}</span>
          </div>

          {/* Progress */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="text-navy/50">Paid {formatCurrency(paid)} of {formatCurrency(required)}</span>
              <span className="font-bold text-navy/70">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-navy/5 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            {isCollecting && remaining > 0 && (
              <p className="text-[11px] font-bold text-amber-600">{formatCurrency(remaining)} remaining to start the scheme</p>
            )}
            {pe.status === 'completed' && (
              <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={12} /> Fully paid — scheme started
              </p>
            )}
          </div>
        </div>

        {/* Completion-failed banner */}
        {pe.status === 'completion_failed' && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-4 space-y-2">
            <p className="text-xs font-bold text-red-600 flex items-center gap-1.5">
              <AlertTriangle size={13} /> Could not start the scheme
            </p>
            <p className="text-[11px] text-red-500/90">{pe.failure_reason || 'Unknown error.'}</p>
            <button
              type="button" onClick={handleRetry} disabled={retrying}
              className="w-full py-2.5 rounded-xl bg-red-600 text-white text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 tactile-press"
            >
              {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Retry starting the scheme
            </button>
          </div>
        )}

        <FormError error={error} />

        {/* Installment ledger */}
        <div>
          <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40 mb-2">Part-payments</p>
          <div className="space-y-2">
            {(pe.payments || []).map((p) => (
              <div key={p.id} className="bg-white rounded-2xl border border-navy/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-navy">{formatCurrency(p.amount)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-navy/40">{formatDate(p.paid_date)}</span>
                    <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${SCHEME_MODE_STYLES[p.payment_mode] || ''}`}>
                      {SCHEME_MODE_LABELS[p.payment_mode] || p.payment_mode}
                    </span>
                  </span>
                </div>
                {p.payment_mode === 'cash_bank' && (
                  <p className="text-[10px] font-medium text-navy/50 mt-1">
                    Cash <span className="font-bold text-amber-600">{formatCurrency(p.cash_amount)}</span>
                    {' · '}Bank <span className="font-bold text-emerald-600">{formatCurrency(p.bank_amount)}</span>
                  </p>
                )}
                <PhotoProof photoKey={p.proof_key} />
                <TransactionIdList transactionId={p.transaction_id} />
              </div>
            ))}
          </div>
        </div>

        {/* Add part-payment */}
        {isCollecting && (
          showAdd ? (
            <AddPartPaymentForm
              pendingId={id} branchId={branchId} remaining={remaining}
              onClose={() => setShowAdd(false)}
              onStarted={() => setShowAdd(false)}
            />
          ) : (
            <button
              type="button" onClick={() => setShowAdd(true)}
              className="w-full py-3.5 bg-indigo text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 tactile-press shadow-lg shadow-indigo/20"
            >
              <Plus size={16} /> Add part-payment
            </button>
          )
        )}

        {/* Cancel */}
        {(pe.status === 'collecting' || pe.status === 'completion_failed') && !showAdd && (
          <button
            type="button" onClick={handleCancel} disabled={cancelling}
            className="w-full py-2.5 text-red-500 text-[11px] font-bold rounded-xl border border-red-100 disabled:opacity-50 tactile-press"
          >
            {cancelling ? 'Cancelling…' : 'Cancel pending enrollment'}
          </button>
        )}
      </div>
    </SchemePageWrapper>
  );
};

// ─── Add part-payment form ───────────────────────────────────────────────────
const AddPartPaymentForm = ({ pendingId, branchId, remaining, onClose, onStarted }) => {
  const [addPayment, { isLoading }] = useAddPendingEnrollmentPaymentMutation();
  const [form, setForm] = useState({ amount: '', paymentMode: 'cash', paidDate: getTodayISO(), notes: '' });
  const [proofKey, setProofKey] = useState([]);
  const [txnId, setTxnId] = useState([]);
  const [split, setSplit] = useState({ cashAmount: '', bankAmount: '' });
  const [showErr, setShowErr] = useState(false);
  const [error, setError] = useState(null);

  const amt = parseFloat(form.amount) || 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!(amt > 0)) { setError('Enter a valid amount.'); return; }
    if (amt > remaining + 0.01) { setError(`Amount exceeds the remaining balance (${formatCurrency(remaining)}).`); return; }
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowErr(true); setError('Payment proof and transaction ID are required for GPay/bank payments.'); return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' && (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - amt) > 0.01)) {
      setShowErr(true); setError('Cash + bank amounts must be filled and equal the payment amount.'); return;
    }
    try {
      const res = await addPayment({
        id: pendingId, branchId,
        amount: amt, paymentMode: form.paymentMode, paidDate: form.paidDate,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
      }).unwrap();
      if (res?.completion) onStarted(); else onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record payment.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-navy/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/50">New part-payment</p>
        <button type="button" onClick={onClose} className="text-navy/30 hover:text-navy/60"><X size={14} /></button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={`Amount (max ${formatCurrency(remaining)})`} required>
          <input type="number" min="1" step="0.01" max={remaining} value={form.amount}
            onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} className={SCHEME_INPUT_CLASS} placeholder="0.00" />
        </FormField>
        <FormField label="Date Paid" required>
          <BackdateDateInput value={form.paidDate} onChange={(e) => setForm(f => ({ ...f, paidDate: e.target.value }))}
            className={SCHEME_INPUT_CLASS} required />
        </FormField>
      </div>

      <FormField label="Payment mode" required>
        <PaymentModeSelect
          value={form.paymentMode}
          onChange={(val) => { setForm(f => ({ ...f, paymentMode: val })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowErr(false); }}
          variant="buttons" includeSplit
        />
      </FormField>

      <CashBankSplitField mode={form.paymentMode} cashAmount={split.cashAmount} bankAmount={split.bankAmount}
        onChange={setSplit} expectedTotal={amt || undefined} showError={showErr} />
      <ProofUploadField mode={form.paymentMode} proofKey={proofKey} onChange={setProofKey} showError={showErr} />
      <TransactionIdField mode={form.paymentMode} value={txnId} onChange={setTxnId} showError={showErr} />

      <FormError error={error} />

      <button type="submit" disabled={isLoading}
        className="w-full py-3 bg-emerald-500 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press">
        {isLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
        {amt >= remaining && amt > 0 ? 'Pay balance & start scheme' : 'Save part-payment'}
      </button>
    </form>
  );
};

export default PendingEnrollmentDetailPage;
