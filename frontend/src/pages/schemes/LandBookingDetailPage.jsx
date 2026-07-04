import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Loader2, ChevronLeft, CheckCircle2, AlertCircle,
  Clock, Home, Banknote, X,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLandBookingQuery,
  useGetLandBuybackQuery,
  useRecordLandAdvanceMutation,
  useRecordLandFullPaymentMutation,
  useExtendLandDeadlineMutation,
  useCancelLandBookingMutation,
  useMarkLandPayoutPaidMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, getTodayISO, SCHEME_MODE_LABELS } from '../../lib/schemeConstants';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

const STATUS_STYLES = {
  booked:       'text-blue-600 bg-blue-50',
  advance_paid: 'text-amber-700 bg-amber-50',
  full_paid:    'text-emerald-600 bg-emerald-50',
  completed:    'text-indigo bg-indigo/10',
  cancelled:    'text-red-500 bg-red-50',
};
const STATUS_LABELS = {
  booked: 'Booked', advance_paid: 'Advance Paid', full_paid: 'Full Paid',
  completed: 'Completed', cancelled: 'Cancelled',
};

// ─── Record Advance Modal ─────────────────────────────────────────────────────
const AdvanceModal = ({ booking, onClose, onSuccess }) => {
  const [recordAdvance, { isLoading }] = useRecordLandAdvanceMutation();
  const [form,  setForm]  = useState({ advanceAmount: '', advanceDate: getTodayISO(), advanceChannel: 'cash' });
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [showProofErr, setShowProofErr] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.advanceChannel !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    try {
      await recordAdvance({
        id: booking.id,
        advanceAmount:   Number(form.advanceAmount),
        advanceDate:     form.advanceDate,
        advanceChannel:  form.advanceChannel,
        advanceProofKey: proofKey.length ? proofKey : undefined,
        advanceTransactionId: txnId.length ? txnId : undefined,
      }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record advance.');
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-navy">Record Advance Payment</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Advance Amount (₹) *</p>
            <input type="number" value={form.advanceAmount}
              onChange={e => setForm(f => ({ ...f, advanceAmount: e.target.value }))}
              min="1" className={SCHEME_INPUT_CLASS} required placeholder="Amount paid" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Payment Date *</p>
            <BackdateDateInput value={form.advanceDate}
              onChange={e => setForm(f => ({ ...f, advanceDate: e.target.value }))}
              className={SCHEME_INPUT_CLASS} required />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-2">Payment Mode *</p>
            <PaymentModeSelect
              value={form.advanceChannel}
              onChange={(val) => { setForm(f => ({ ...f, advanceChannel: val })); setProofKey([]); setTxnId([]); setShowProofErr(false); }}
              variant="buttons"
            />
          </div>
          <ProofUploadField mode={form.advanceChannel} proofKey={proofKey} onChange={setProofKey} showError={showProofErr} />
          <TransactionIdField mode={form.advanceChannel} value={txnId} onChange={setTxnId} showError={showProofErr} />
          <FormError error={error} />
          <button type="submit" disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-amber-600 text-white text-sm font-bold disabled:opacity-50 tactile-press">
            {isLoading ? 'Saving…' : 'Record Advance'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Record Full Payment Modal ────────────────────────────────────────────────
const FullPaymentModal = ({ booking, onClose, onSuccess }) => {
  const [recordFull, { isLoading }] = useRecordLandFullPaymentMutation();
  const [form,  setForm]  = useState({
    fullAmount: '', fullPaymentDate: getTodayISO(), loanTaken: false, loanAmount: '', fullChannel: 'cash',
  });
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [showProofErr, setShowProofErr] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.fullChannel !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    try {
      await recordFull({
        id: booking.id,
        fullAmount:      Number(form.fullAmount),
        fullPaymentDate: form.fullPaymentDate,
        loanTaken:       form.loanTaken,
        loanAmount:      form.loanTaken ? Number(form.loanAmount) : undefined,
        fullChannel:     form.fullChannel,
        fullProofKey: proofKey.length ? proofKey : undefined,
        fullTransactionId: txnId.length ? txnId : undefined,
      }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record full payment.');
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-navy">Record Full Payment</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Full Amount (₹) *</p>
            <input type="number" value={form.fullAmount}
              onChange={e => setForm(f => ({ ...f, fullAmount: e.target.value }))}
              min="1" className={SCHEME_INPUT_CLASS} required placeholder="Amount paid" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Payment Date *</p>
            <BackdateDateInput value={form.fullPaymentDate}
              onChange={e => setForm(f => ({ ...f, fullPaymentDate: e.target.value }))}
              className={SCHEME_INPUT_CLASS} required />
          </div>
          {booking.loan_enabled && (
            <>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.loanTaken}
                  onChange={e => setForm(f => ({ ...f, loanTaken: e.target.checked }))}
                  className="w-5 h-5 rounded accent-stone-700" />
                <span className="text-sm font-medium text-navy">Customer took a company loan</span>
              </label>
              {form.loanTaken && (
                <div>
                  <p className="text-[10px] font-bold text-navy/40 mb-1">Loan Amount (₹) *</p>
                  <input type="number" value={form.loanAmount}
                    onChange={e => setForm(f => ({ ...f, loanAmount: e.target.value }))}
                    min="1" className={SCHEME_INPUT_CLASS} required placeholder="Loan amount" />
                </div>
              )}
            </>
          )}
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-2">Payment Mode *</p>
            <PaymentModeSelect
              value={form.fullChannel}
              onChange={(val) => { setForm(f => ({ ...f, fullChannel: val })); setProofKey([]); setTxnId([]); setShowProofErr(false); }}
              variant="buttons"
            />
          </div>
          <ProofUploadField mode={form.fullChannel} proofKey={proofKey} onChange={setProofKey} showError={showProofErr} />
          <TransactionIdField mode={form.fullChannel} value={txnId} onChange={setTxnId} showError={showProofErr} />
          <div className="bg-stone-50 border border-stone-100 rounded-2xl p-3 text-xs text-stone-600">
            ℹ️ Buyback schedule of 60 monthly payouts will be auto-created, starting 60 days after this payment date.
          </div>
          <FormError error={error} />
          <button type="submit" disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 tactile-press">
            {isLoading ? 'Saving…' : 'Record Full Payment'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Buyback Payout Modal ─────────────────────────────────────────────────────
const BuybackPayoutModal = ({ booking, month, onClose, onSuccess }) => {
  const [markPayoutPaid, { isLoading }] = useMarkLandPayoutPaidMutation();
  const [paidChannel,  setPaidChannel]  = useState('cash');
  const [paidDate,     setPaidDate]     = useState(new Date().toISOString().split('T')[0]);
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [showProofErr, setShowProofErr] = useState(false);
  const [error,        setError]        = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (paidChannel !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    try {
      await markPayoutPaid({ id: booking.id, month, paidDate, paidChannel, paidProofKey: proofKey.length ? proofKey : undefined, paidTransactionId: txnId.length ? txnId : undefined }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to mark payout paid.');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-navy">Mark Buyback Month {month} Paid</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold">×</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Date Paid *</p>
            <BackdateDateInput value={paidDate} onChange={e => setPaidDate(e.target.value)} className={SCHEME_INPUT_CLASS} required />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-2">Payment Channel *</p>
            <PaymentModeSelect
              value={paidChannel}
              onChange={(val) => { setPaidChannel(val); setProofKey([]); setTxnId([]); setShowProofErr(false); }}
              variant="buttons"
            />
          </div>
          <ProofUploadField mode={paidChannel} proofKey={proofKey} onChange={setProofKey} showError={showProofErr} />
          <TransactionIdField mode={paidChannel} value={txnId} onChange={setTxnId} showError={showProofErr} />
          <FormError error={error} />
          <button type="submit" disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-sm font-bold disabled:opacity-50 tactile-press">
            {isLoading ? 'Saving…' : 'Confirm Payout'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Cancel Booking Modal ─────────────────────────────────────────────────────
const CancelModal = ({ booking, onClose, onSuccess }) => {
  const [cancelBooking, { isLoading }] = useCancelLandBookingMutation();
  const [reason, setReason] = useState('');
  const [error,  setError]  = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!reason.trim()) { setError('Please provide a reason.'); return; }
    try {
      await cancelBooking({ id: booking.id, reason: reason.trim() }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to cancel booking.');
    }
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full bg-white rounded-t-3xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-base font-bold text-navy">Cancel Booking</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold">×</button>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3 text-xs text-red-700">
          ⚠️ This will cancel the booking and return plot {booking.site_number} to available. Advance paid is forfeited.
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Reason *</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Reason for cancellation…"
              className={`${SCHEME_INPUT_CLASS} resize-none`} required />
          </div>
          <FormError error={error} />
          <button type="submit" disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-red-600 text-white text-sm font-bold disabled:opacity-50 tactile-press">
            {isLoading ? 'Cancelling…' : 'Confirm Cancellation'}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export const LandBookingDetailPage = () => {
  const { id }   = useParams();
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const isBranchAdmin = user?.role === 'branch_admin';

  const [showAdvanceModal,  setShowAdvanceModal]  = useState(false);
  const [showFullModal,     setShowFullModal]      = useState(false);
  const [showCancelModal,   setShowCancelModal]    = useState(false);
  const [payoutMonth,       setPayoutMonth]        = useState(null);

  const [extendDeadline, { isLoading: extending }] = useExtendLandDeadlineMutation();
  const [extendError, setExtendError] = useState('');

  const { data: booking, isLoading, error: bookingError } = useGetLandBookingQuery(id);
  const { data: payouts = [] } = useGetLandBuybackQuery(id, {
    skip: !booking || !['full_paid', 'completed'].includes(booking?.status),
  });

  if (isLoading) {
    return (
      <SchemePageWrapper>
        <div className="flex justify-center py-20">
          <Loader2 className="animate-spin text-stone-400" size={32} aria-hidden="true" />
        </div>
      </SchemePageWrapper>
    );
  }
  if (bookingError || !booking) {
    return (
      <SchemePageWrapper>
        <div className="px-4 pt-10 text-center">
          <p className="text-sm font-bold text-navy">Booking not found.</p>
          <button onClick={() => navigate('/money/schemes/land/bookings')}
            className="mt-4 text-xs font-bold text-stone-600 underline">← Bookings</button>
        </div>
      </SchemePageWrapper>
    );
  }

  const today     = new Date().toISOString().split('T')[0];
  const isOverdue = booking.advance_deadline && today > booking.advance_deadline
    && ['booked','advance_paid'].includes(booking.status);
  const canExtend = isBranchAdmin && ['booked','advance_paid'].includes(booking.status)
    && booking.payment_mode === 'advance_full_payment'
    && (booking.advance_extensions_used ?? 0) < 2;
  const canAdvance = isBranchAdmin && booking.status === 'booked'
    && booking.payment_mode === 'advance_full_payment';
  const canFull    = isBranchAdmin && ['booked','advance_paid'].includes(booking.status);
  const canCancel  = isBranchAdmin && ['booked','advance_paid'].includes(booking.status);

  // Payout status helpers
  const paidCount    = payouts.filter(p => p.status === 'paid').length;
  const overdueCount = payouts.filter(p => p.status === 'pending' && p.due_date < today).length;

  const handleExtend = async () => {
    setExtendError('');
    try {
      await extendDeadline(booking.id).unwrap();
    } catch (err) {
      setExtendError(err?.data?.error?.message || 'Failed to extend deadline.');
    }
  };

  const handleMarkPaid = (month) => { setPayoutMonth(month); };

  return (
    <SchemePageWrapper>
      {/* Header */}
      <div className="px-4 mb-4 flex items-center gap-3">
        <button onClick={() => navigate('/money/schemes/land/bookings')}
          className="w-9 h-9 rounded-2xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press flex-shrink-0"
          aria-label="Back">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-navy truncate">{booking.customer_name}</h2>
          <p className="text-[11px] font-medium text-navy/40">{booking.booking_ref}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase flex-shrink-0 ${STATUS_STYLES[booking.status] || 'bg-navy/5 text-navy/40'}`}>
          {STATUS_LABELS[booking.status] || booking.status}
        </span>
      </div>

      {/* Overdue deadline alert */}
      {isOverdue && (
        <div className="px-4 mb-4">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex items-center gap-2">
            <AlertCircle size={14} className="text-red-600 flex-shrink-0" aria-hidden="true" />
            <p className="text-xs font-semibold text-red-700">
              Advance payment deadline passed ({formatDate(booking.advance_deadline)})
            </p>
          </div>
        </div>
      )}

      {/* Booking details card */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-3xl p-5 card-shadow border border-border">
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { label: 'Plot',          val: `${booking.site_number} — ${booking.site_name}` },
              { label: 'Customer ID',   val: booking.customer_ref },
              { label: 'Phone',         val: booking.customer_phone || '—' },
              { label: 'Booking Date',  val: formatDate(booking.booking_date) },
              { label: 'Payment Mode',  val: booking.payment_mode === 'full_payment' ? 'Full Payment' : 'Advance + Full' },
              { label: 'Land Cost',     val: formatCurrency(booking.land_cost) },
              ...(booking.advance_amount ? [
                { label: 'Advance Paid', val: `${formatCurrency(booking.advance_amount)} on ${formatDate(booking.advance_date)}` },
                { label: 'Adv. Deadline', val: `${formatDate(booking.advance_deadline)} (${booking.advance_extensions_used || 0} ext.)` },
              ] : []),
              ...(booking.full_amount ? [
                { label: 'Full Payment', val: `${formatCurrency(booking.full_amount)} on ${formatDate(booking.full_payment_date)}` },
                { label: 'Buyback Start', val: formatDate(booking.buyback_start_date) },
              ] : []),
              ...(booking.loan_taken ? [
                { label: 'Loan', val: formatCurrency(booking.loan_amount) },
              ] : []),
              ...(booking.cancellation_reason ? [
                { label: 'Cancellation', val: booking.cancellation_reason },
              ] : []),
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30">{label}</p>
                <p className="text-sm font-semibold text-navy mt-0.5 break-words">{val}</p>
              </div>
            ))}
          </div>
          {(booking.advance_proof_key || booking.full_proof_key ||
            booking.advance_transaction_id || booking.full_transaction_id) && (
            <div className="mt-4 space-y-3">
              {(booking.advance_proof_key || booking.advance_transaction_id) && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30 mb-1">Advance Receipt</p>
                  <PhotoProof photoKey={booking.advance_proof_key} />
                  <TransactionIdList transactionId={booking.advance_transaction_id} />
                </div>
              )}
              {(booking.full_proof_key || booking.full_transaction_id) && (
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30 mb-1">Full Payment Receipt</p>
                  <PhotoProof photoKey={booking.full_proof_key} />
                  <TransactionIdList transactionId={booking.full_transaction_id} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 mb-4 space-y-2">
        {canAdvance && (
          <button type="button" onClick={() => setShowAdvanceModal(true)}
            className="w-full py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2">
            <Banknote size={16} aria-hidden="true" />
            Record Advance Payment
          </button>
        )}
        {canFull && (
          <button type="button" onClick={() => setShowFullModal(true)}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2">
            <CheckCircle2 size={16} aria-hidden="true" />
            Record Full Payment
          </button>
        )}
        {canExtend && (
          <>
            <button type="button" onClick={handleExtend} disabled={extending}
              className="w-full py-3.5 rounded-2xl bg-blue-600 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2 disabled:opacity-50">
              <Clock size={16} aria-hidden="true" />
              {extending ? 'Extending…' : `Extend Deadline +30 days (${2 - (booking.advance_extensions_used || 0)} left)`}
            </button>
            {extendError && <p className="text-xs text-red-600 text-center">{extendError}</p>}
          </>
        )}
        {canCancel && (
          <button type="button" onClick={() => setShowCancelModal(true)}
            className="w-full py-3.5 rounded-2xl bg-red-50 text-red-600 text-sm font-bold border border-red-100 tactile-press flex items-center justify-center gap-2">
            <X size={16} aria-hidden="true" />
            Cancel Booking
          </button>
        )}
      </div>

      {/* Buyback schedule */}
      {['full_paid','completed'].includes(booking.status) && payouts.length > 0 && (
        <div className="px-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">
              Buyback Schedule · {paidCount}/60 paid
            </p>
            {overdueCount > 0 && (
              <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                {overdueCount} overdue
              </span>
            )}
          </div>
          <div className="bg-white rounded-2xl card-shadow border border-border overflow-hidden">
            <div className="grid grid-cols-4 text-[9px] font-bold uppercase tracking-wider text-navy/30 px-4 py-2.5 bg-navy/[0.02] border-b border-border">
              <span>Month</span>
              <span className="text-right">Due</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Status</span>
            </div>
            <div className="divide-y divide-border max-h-96 overflow-y-auto">
              {payouts.map(p => {
                const isOverduePayment = p.status === 'pending' && p.due_date < today;
                return (
                  <div key={p.id} className={`px-4 py-2.5 ${isOverduePayment ? 'bg-red-50/30' : ''}`}>
                    <div className="grid grid-cols-4 items-center">
                      <span className="text-xs font-bold text-navy">M{p.month_number}</span>
                      <span className="text-[10px] text-navy/50 text-right">{formatDate(p.due_date)}</span>
                      <span className="text-xs font-bold text-emerald-600 text-right">
                        {formatCurrency(parseFloat(p.amount))}
                      </span>
                      <div className="flex justify-end">
                        {p.status === 'paid' ? (
                          <span className="text-[9px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full uppercase">
                            Paid
                          </span>
                        ) : isBranchAdmin ? (
                          <button type="button" onClick={() => handleMarkPaid(p.month_number)}
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tactile-press ${
                              isOverduePayment
                                ? 'bg-red-100 text-red-700'
                                : 'bg-emerald-50 text-emerald-700'
                            }`}>
                            {isOverduePayment ? 'Overdue' : 'Pay'}
                          </button>
                        ) : (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${isOverduePayment ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'}`}>
                            {isOverduePayment ? 'Overdue' : 'Pending'}
                          </span>
                        )}
                      </div>
                    </div>
                    {p.status === 'paid' && (
                      <>
                        <PhotoProof photoKey={p.paid_proof_key} />
                        <TransactionIdList transactionId={p.paid_transaction_id} />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {showAdvanceModal  && <AdvanceModal       booking={booking} onClose={() => setShowAdvanceModal(false)}  onSuccess={() => setShowAdvanceModal(false)} />}
      {showFullModal     && <FullPaymentModal   booking={booking} onClose={() => setShowFullModal(false)}     onSuccess={() => setShowFullModal(false)} />}
      {showCancelModal   && <CancelModal        booking={booking} onClose={() => setShowCancelModal(false)}   onSuccess={() => navigate('/money/schemes/land/bookings')} />}
      {payoutMonth       && <BuybackPayoutModal booking={booking} month={payoutMonth} onClose={() => setPayoutMonth(null)} onSuccess={() => setPayoutMonth(null)} />}
    </SchemePageWrapper>
  );
};

export default LandBookingDetailPage;
