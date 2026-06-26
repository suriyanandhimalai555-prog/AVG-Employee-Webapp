import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Plus, CheckCircle2, Circle, Loader2,
  Phone, MapPin, User,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetGoldMemberQuery,
  useGetGoldPaymentsQuery,
  useUpdateGoldMemberStatusMutation,
} from '../../store/api/apiSlice';
import { SchemeCalendar } from '../../components/SchemeCalendar';
import { getCurrentPeriod } from '../../lib/schemePeriod';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { GOLD_STATUS_STYLES, SCHEME_MODE_LABELS, SCHEME_MODE_STYLES } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { AddPaymentModal } from './components/AddPaymentModal';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

export const GoldMemberDetailPage = () => {
  const { id }   = useParams();
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [period, setPeriod]                     = useState(getCurrentPeriod);

  const { data: member,   isLoading: isMemberLoading }   = useGetGoldMemberQuery(id);
  const { data: payments = [], isLoading: isPaymentsLoading } = useGetGoldPaymentsQuery(id);
  const [updateStatus] = useUpdateGoldMemberStatusMutation();

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

  const periodPayments = payments.filter(p => {
    const d = p.paid_date?.slice(0, 10);
    return d >= period.startDate && d <= period.endDate;
  });

  const addButton = user?.role === 'branch_admin' && member.status === 'active' ? (
    <button
      onClick={() => setShowPaymentModal(true)}
      disabled={allPaid}
      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-md tactile-press disabled:opacity-40"
    >
      <Plus size={14} aria-hidden="true" /> Add Payment
    </button>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/gold"
        title={member.customer_name}
        subtitle={`Chit No. ${member.chit_number}`}
        action={addButton}
      />

      {/* Member info card */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-5 card-shadow border border-navy/5 space-y-3">
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
        <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5">
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
                  className={`rounded-2xl p-3 border text-center ${p ? 'bg-emerald-50 border-emerald-200' : 'bg-navy/2 border-navy/5'}`}
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
          <div className="bg-white rounded-3xl card-shadow border border-navy/5 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-navy/5 bg-navy/2">
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40">Month</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40">Date</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 text-right">Amount</th>
                  <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 text-center">Mode</th>
                </tr>
              </thead>
              <tbody>
                {periodPayments.map((p, idx) => (
                  <>
                    <tr key={p.id} className={`border-b border-navy/5 ${idx % 2 === 0 ? '' : 'bg-navy/[0.01]'}`}>
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
                      <tr key={`${p.id}-proof`} className="border-b border-navy/5">
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
    </SchemePageWrapper>
  );
};

export default GoldMemberDetailPage;
