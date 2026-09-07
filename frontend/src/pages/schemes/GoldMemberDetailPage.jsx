import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  Plus, CheckCircle2, Circle, Loader2,
  Phone, MapPin, User, XCircle, AlertTriangle,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetGoldMemberQuery,
  useGetGoldPaymentsQuery,
  useUpdateGoldMemberStatusMutation,
  useCancelGoldMemberMutation,
  useRefundGoldMemberMutation,
} from '../../store/api/apiSlice';
import { SchemeCalendar } from '../../components/SchemeCalendar';
import { getCurrentPeriod } from '../../lib/schemePeriod';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { GOLD_STATUS_STYLES, SCHEME_MODE_LABELS, SCHEME_MODE_STYLES } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { AddPaymentModal } from './components/AddPaymentModal';
import { GlassModal } from '../../components/GlassModal';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

export const GoldMemberDetailPage = () => {
  const { id }   = useParams();
  const user     = useSelector(selectCurrentUser);

  // MD/Management drill-down passes branchId (their JWT has no branch) and
  // from=schemes so the back button returns to the monitoring page.
  const [searchParams] = useSearchParams();
  const branchId = searchParams.get('branchId');
  const backTo   = searchParams.get('from') === 'schemes' ? '/schemes/gold_scheme' : '/money/schemes/gold';

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCancelModal,  setShowCancelModal]  = useState(false);
  const [showRefundModal,  setShowRefundModal]  = useState(false);
  const [cancelReason,     setCancelReason]     = useState('');
  const [period, setPeriod]                     = useState(getCurrentPeriod);

  const { data: member,   isLoading: isMemberLoading }   = useGetGoldMemberQuery(branchId ? { id, branchId } : id);
  const { data: payments = [], isLoading: isPaymentsLoading } = useGetGoldPaymentsQuery(branchId ? { memberId: id, branchId } : id);
  const [updateStatus]   = useUpdateGoldMemberStatusMutation();
  const [cancelMember,   { isLoading: isCancelling }]  = useCancelGoldMemberMutation();
  const [refundMember,   { isLoading: isRefunding }]   = useRefundGoldMemberMutation();

  if (isMemberLoading) {
    return (
      <div className="flex justify-center p-20">
        <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
      </div>
    );
  }
  if (!member) {
    return (
      <div className="flex justify-center p-20">
        <p className="text-sm font-bold text-navy/40">Member not found.</p>
      </div>
    );
  }

  const paidSet   = new Set(payments.map(p => p.month_number));
  const paidCount = paidSet.size;
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const allPaid   = paidCount >= member.total_months;

  const handleMarkComplete = async () => {
    if (!allPaid) return;
    try {
      await updateStatus({ id: member.id, status: 'completed' }).unwrap();
    } catch {
      // status update errors surface via RTK Query — swallowing UI-only
    }
  };

  // Compute the member's maturity date for display (display-only; server is authoritative).
  // Parse YYYY-MM-DD components to avoid UTC-midnight timezone shift.
  const computeMaturityDate = (startDate, totalMonths) => {
    const [y, mo, d] = String(startDate).split('-').map(Number);
    return new Date(y, mo - 1 + Number(totalMonths), d);
  };
  const maturityDateObj = member ? computeMaturityDate(member.start_date, member.total_months) : null;
  // Today as YYYY-MM-DD for the display-side gate (device local — server re-checks in IST)
  const todayISO = new Date().toISOString().slice(0, 10);
  const maturityISO = maturityDateObj
    ? `${maturityDateObj.getFullYear()}-${String(maturityDateObj.getMonth() + 1).padStart(2, '0')}-${String(maturityDateObj.getDate()).padStart(2, '0')}`
    : null;
  const isMatured = maturityISO && todayISO >= maturityISO;

  const handleCancel = async () => {
    try {
      const body = cancelReason.trim() ? { reason: cancelReason.trim() } : {};
      if (branchId) body.branchId = branchId;
      await cancelMember({ id: member.id, ...body }).unwrap();
      setShowCancelModal(false);
      setCancelReason('');
    } catch {
      // errors surface via RTK Query; UI remains open for retry
    }
  };

  const handleSettleRefund = async () => {
    try {
      const body = branchId ? { branchId } : {};
      await refundMember({ id: member.id, ...body }).unwrap();
      setShowRefundModal(false);
    } catch {
      // server will return a 400 with the maturity date if the guard fails
    }
  };

  const periodPayments = payments.filter(p => {
    const d = p.paid_date?.slice(0, 10);
    return d >= period.startDate && d <= period.endDate;
  });

  const addButton = user?.role === 'branch_admin' && member.status === 'active' ? (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setShowPaymentModal(true)}
        disabled={allPaid}
        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-md tactile-press disabled:opacity-40"
      >
        <Plus size={14} aria-hidden="true" /> Add Payment
      </button>
      <button
        onClick={() => setShowCancelModal(true)}
        className="flex items-center gap-2 px-3 py-2.5 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-200 tactile-press"
      >
        <XCircle size={14} aria-hidden="true" /> Cancel
      </button>
    </div>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={backTo}
        title={member.customer_name}
        subtitle={`Chit No. ${member.chit_number}`}
        action={addButton}
      />

      {/* Member info card */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-5 card-shadow border border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                <User size={18} className="text-amber-600" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-navy">{member.customer_name}</p>
                <p className="text-[10px] font-medium text-navy/40">
                  Started {formatDate(member.start_date)}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider ${GOLD_STATUS_STYLES[member.status]}`}>
              {member.status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-navy/2 rounded-2xl p-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Monthly Amount</p>
              <p className="text-base font-bold text-navy mt-0.5">{formatCurrency(member.monthly_amount)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Duration</p>
              <p className="text-sm font-bold text-navy mt-0.5">{member.total_months} months</p>
            </div>
            {member.customer_phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={10} className="text-navy/30" aria-hidden="true" />
                <p className="text-xs font-medium text-navy">{member.customer_phone}</p>
              </div>
            )}
            {member.customer_address && (
              <div className="flex items-center gap-1.5">
                <MapPin size={10} className="text-navy/30" aria-hidden="true" />
                <p className="text-xs font-medium text-navy truncate">{member.customer_address}</p>
              </div>
            )}
          </div>

          {member.referrer_name && (
            <div className="flex items-center justify-between px-3 py-2 bg-navy/2 rounded-xl">
              <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30">Referred By</p>
              <p className="text-xs font-bold text-navy">{member.referrer_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Payment progress */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-4 card-shadow border border-border">
          <div className="flex justify-between items-center mb-2">
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Payment Progress</p>
            <p className="text-xs font-bold text-navy">{paidCount} / {member.total_months} months</p>
          </div>
          <div className="h-2.5 bg-navy/5 rounded-full overflow-hidden mb-3">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${(paidCount / member.total_months) * 100}%` }}
            />
          </div>
          <div className="flex justify-between">
            <div>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">Total Collected</p>
              <p className="text-base font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">Remaining</p>
              <p className="text-base font-bold text-amber-600">
                {formatCurrency((member.total_months - paidCount) * parseFloat(member.monthly_amount))}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Refund status banner — only shown for cancelled members */}
      {member.status === 'cancelled' && (
        <div className="px-4 mb-5">
          <div className={`rounded-3xl p-4 border ${member.refund_status === 'refunded' ? 'bg-emerald-50 border-emerald-200' : 'bg-orange-50 border-orange-200'}`}>
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className={`mt-0.5 flex-shrink-0 ${member.refund_status === 'refunded' ? 'text-emerald-500' : 'text-orange-500'}`} aria-hidden="true" />
              <div className="flex-1 min-w-0">
                {member.refund_status === 'refunded' ? (
                  <>
                    <p className="text-xs font-bold text-emerald-700">Refund Settled</p>
                    <p className="text-[11px] text-emerald-600 mt-0.5">
                      {formatCurrency(member.refund_amount)} settled on {formatDate(member.refunded_at)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xs font-bold text-orange-700">Card Cancelled — Refund Pending</p>
                    <p className="text-[11px] text-orange-600 mt-1">
                      Cancelled {formatDate(member.cancelled_at)}.
                      {member.cancel_reason && ` Reason: ${member.cancel_reason}.`}
                    </p>
                    <p className="text-[11px] text-orange-600 mt-0.5">
                      Accumulated <span className="font-bold">{formatCurrency(totalPaid)}</span> is payable
                      when the scheme matures on <span className="font-bold">{maturityDateObj ? maturityDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}</span>.
                    </p>
                    {/* Settle Refund button — visible to branch_admin when matured */}
                    {user?.role === 'branch_admin' && isMatured && (
                      <button
                        onClick={() => setShowRefundModal(true)}
                        className="mt-3 w-full py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-2xl tactile-press shadow-sm"
                      >
                        Settle Refund
                      </button>
                    )}
                    {!isMatured && maturityISO && (
                      <p className="mt-2 text-[10px] font-medium text-orange-400">
                        Refund button unlocks after {maturityDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period picker */}
      <div className="px-4 mb-5">
        <SchemeCalendar compact onPeriodChange={setPeriod} />
      </div>

      {/* Monthly payment grid */}
      <div className="px-4 mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Monthly Payments</p>
        {isPaymentsLoading ? (
          <div className="flex justify-center p-6">
            <Loader2 className="animate-spin text-navy/20" size={24} aria-hidden="true" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: member.total_months }, (_, i) => i + 1).map(month => {
              const p = payments.find(pay => pay.month_number === month);
              return (
                <div
                  key={month}
                  className={`rounded-2xl p-3 border text-center ${p ? 'bg-emerald-50 border-emerald-200' : 'bg-navy/2 border-border'}`}
                >
                  <p className="text-[9px] font-bold uppercase tracking-wider text-navy/40">Month</p>
                  <p className={`text-base font-bold mt-0.5 ${p ? 'text-emerald-600' : 'text-navy/30'}`}>{month}</p>
                  {p ? (
                    <>
                      <CheckCircle2 size={12} className="text-emerald-500 mx-auto mt-1" aria-hidden="true" />
                      <p className="text-[8px] font-bold text-emerald-600 mt-0.5">{formatCurrency(p.amount)}</p>
                      {/* Day+month only — formatDate includes year which is too long here */}
                      <p className="text-[7px] text-navy/30 mt-0.5">
                        {new Date(p.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </>
                  ) : (
                    <Circle size={12} className="text-navy/20 mx-auto mt-1" aria-hidden="true" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history table filtered to selected period */}
      {periodPayments.length > 0 && (
        <div className="px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
            Payment History · {period.label}
          </p>
          <div className="bg-white rounded-3xl card-shadow border border-border overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border bg-navy/2">
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40">Month</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40">Date</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 text-right">Amount</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 text-center">Mode</th>
                </tr>
              </thead>
              <tbody>
                {periodPayments.map((p, idx) => (
                  <>
                    <tr key={p.id} className={`border-b border-border ${idx % 2 === 0 ? '' : 'bg-navy/[0.01]'}`}>
                      <td className="px-4 py-3 text-sm font-bold text-navy">Month {p.month_number}</td>
                      <td className="px-4 py-3 text-xs font-medium text-navy/60">{formatDate(p.paid_date)}</td>
                      <td className="px-4 py-3 text-sm font-bold text-navy text-right">{formatCurrency(p.amount)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${SCHEME_MODE_STYLES[p.payment_mode]}`}>
                          {SCHEME_MODE_LABELS[p.payment_mode]}
                        </span>
                      </td>
                    </tr>
                    {(p.proof_key || p.transaction_id || p.payment_mode === 'cash_bank') && (
                      <tr key={`${p.id}-proof`} className="border-b border-border">
                        <td colSpan={4} className="px-4 pb-3 space-y-2">
                          {p.payment_mode === 'cash_bank' && (
                            <p className="text-[10px] font-medium text-navy/50">
                              Cash <span className="font-bold text-amber-600">{formatCurrency(p.cash_amount)}</span>
                              {' · '}Bank <span className="font-bold text-emerald-600">{formatCurrency(p.bank_amount)}</span>
                            </p>
                          )}
                          <PhotoProof photoKey={p.proof_key} />
                          <TransactionIdList transactionId={p.transaction_id} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Mark complete */}
      {user?.role === 'branch_admin' && member.status === 'active' && allPaid && (
        <div className="px-4 mt-5">
          <button
            onClick={handleMarkComplete}
            className="w-full py-4 bg-indigo text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 tactile-press shadow-lg shadow-indigo/20"
          >
            <CheckCircle2 size={18} aria-hidden="true" /> Mark Scheme Completed
          </button>
        </div>
      )}

      <AnimatePresence>
        {showPaymentModal && (
          <AddPaymentModal
            member={member}
            payments={payments}
            onClose={() => setShowPaymentModal(false)}
            onSuccess={() => setShowPaymentModal(false)}
          />
        )}
      </AnimatePresence>

      {/* Cancel Card confirmation — GlassModal manages its own AnimatePresence */}
      <GlassModal
        isOpen={showCancelModal}
        onClose={() => { setShowCancelModal(false); setCancelReason(''); }}
        title="Cancel Card"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-orange-50 rounded-2xl">
            <XCircle size={16} className="text-orange-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-orange-700">
              The accumulated amount will be refunded when the scheme matures on{' '}
              <span className="font-bold">
                {maturityDateObj ? maturityDateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
              </span>.
              Commission is not reversed.
            </p>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-navy/40 block mb-1.5">
              Reason (optional)
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Customer request, duplicate card, etc."
              className="w-full rounded-2xl border border-border bg-navy/2 px-3 py-2.5 text-xs text-navy placeholder:text-navy/30 resize-none focus:outline-none focus:border-navy/20"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setShowCancelModal(false); setCancelReason(''); }}
              disabled={isCancelling}
              className="flex-1 py-3 rounded-2xl border border-border text-xs font-bold text-navy/60 tactile-press disabled:opacity-40"
            >
              Keep Active
            </button>
            <button
              onClick={handleCancel}
              disabled={isCancelling}
              className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-xs font-bold tactile-press shadow-md disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isCancelling && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              Confirm Cancel
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Settle Refund confirmation — GlassModal manages its own AnimatePresence */}
      <GlassModal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="Settle Refund"
      >
        <div className="space-y-4">
          <div className="bg-navy/2 rounded-2xl p-3 space-y-2">
            <div className="flex justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy/30">Customer</p>
              <p className="text-xs font-bold text-navy">{member.customer_name}</p>
            </div>
            <div className="flex justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy/30">Amount to Return</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
            </div>
          </div>
          <p className="text-xs text-navy/50">
            Mark the accumulated amount as returned to the customer. This cannot be undone.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowRefundModal(false)}
              disabled={isRefunding}
              className="flex-1 py-3 rounded-2xl border border-border text-xs font-bold text-navy/60 tactile-press disabled:opacity-40"
            >
              Go Back
            </button>
            <button
              onClick={handleSettleRefund}
              disabled={isRefunding}
              className="flex-1 py-3 rounded-2xl bg-emerald-500 text-white text-xs font-bold tactile-press shadow-md disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isRefunding && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
              Confirm Settle
            </button>
          </div>
        </div>
      </GlassModal>
    </SchemePageWrapper>
  );
};

export default GoldMemberDetailPage;
