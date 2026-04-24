import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight, Plus, CheckCircle2, Circle, Loader2,
  AlertCircle, Phone, MapPin, User, ChevronDown, X
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetGoldMemberQuery,
  useGetGoldPaymentsQuery,
  useAddGoldPaymentMutation,
  useUpdateGoldMemberStatusMutation,
} from '../store/api/apiSlice';

const MODE_LABELS = { cash: 'Cash', gpay: 'GPay', bank_receipt: 'Bank' };
const MODE_STYLES = {
  cash:         'text-amber-600 bg-amber-50',
  gpay:         'text-indigo bg-indigo/10',
  bank_receipt: 'text-emerald-600 bg-emerald-50',
};

const AddPaymentModal = ({ member, payments, onClose, onSuccess }) => {
  const user = useSelector(selectCurrentUser);
  const [addPayment, { isLoading }] = useAddGoldPaymentMutation();

  // Next unpaid month
  const paidMonths = new Set((payments || []).map(p => p.month_number));
  const nextMonth = (() => {
    for (let m = 1; m <= member.total_months; m++) {
      if (!paidMonths.has(m)) return m;
    }
    return null;
  })();

  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState({
    monthNumber: nextMonth || 1,
    paidDate:    today,
    amount:      parseFloat(member.monthly_amount),
    paymentMode: 'cash',
    notes:       '',
  });
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      await addPayment({
        memberId:    member.id,
        monthNumber: parseInt(form.monthNumber, 10),
        paidDate:    form.paidDate,
        amount:      parseFloat(form.amount),
        paymentMode: form.paymentMode,
        notes:       form.notes.trim() || undefined,
      }).unwrap();
      onSuccess();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record payment.');
    }
  };

  const inputClass = 'w-full px-4 py-3 bg-navy/2 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-white w-full max-w-md rounded-[28px] p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-navy">Record Payment</p>
            <p className="text-[10px] font-medium text-navy/40 mt-0.5">{member.member_name} · Chit {member.chit_number}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-navy/5 rounded-full"><X size={18} className="text-navy/40" /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Month selector + date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Month No.</label>
              <select
                value={form.monthNumber}
                onChange={set('monthNumber')}
                className={`${inputClass} appearance-none`}
              >
                {Array.from({ length: member.total_months }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m} disabled={paidMonths.has(m)}>
                    Month {m}{paidMonths.has(m) ? ' ✓' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Date Paid</label>
              <input type="date" value={form.paidDate} onChange={set('paidDate')} className={inputClass} />
            </div>
          </div>

          {/* Amount + mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Amount (₹)</label>
              <input
                type="number"
                min="1"
                value={form.amount}
                onChange={set('amount')}
                className={inputClass}
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Mode</label>
              <div className="relative">
                <select value={form.paymentMode} onChange={set('paymentMode')} className={`${inputClass} appearance-none pr-8`}>
                  <option value="cash">Cash</option>
                  <option value="gpay">GPay</option>
                  <option value="bank_receipt">Bank</option>
                </select>
                <ChevronDown size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Notes (optional)</label>
            <input type="text" placeholder="Any note…" value={form.notes} onChange={set('notes')} className={inputClass} />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
              <AlertCircle size={13} className="text-red-500 shrink-0" />
              <p className="text-xs font-bold text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 bg-emerald-500 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-emerald-500/20"
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
            Save Payment
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
};

export const GoldMemberDetailPage = () => {
  const { id } = useParams();
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const { data: member, isLoading: isMemberLoading } = useGetGoldMemberQuery(id);
  const { data: payments = [], isLoading: isPaymentsLoading } = useGetGoldPaymentsQuery(id);
  const [updateStatus] = useUpdateGoldMemberStatusMutation();

  if (isMemberLoading) {
    return <div className="flex justify-center p-20"><Loader2 className="animate-spin text-navy/20" size={32} /></div>;
  }
  if (!member) {
    return <div className="flex justify-center p-20"><p className="text-sm font-bold text-navy/40">Member not found.</p></div>;
  }

  const paidSet = new Set(payments.map(p => p.month_number));
  const paidCount = paidSet.size;
  const totalPaid = payments.reduce((s, p) => s + parseFloat(p.amount), 0);
  const allPaid = paidCount >= member.total_months;

  const handleMarkComplete = async () => {
    if (!allPaid) return;
    try { await updateStatus({ id: member.id, status: 'completed' }).unwrap(); }
    catch {}
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="pb-32 pt-4"
    >
      {/* Header */}
      <div className="px-4 flex items-center gap-4 mb-5">
        <button onClick={() => navigate('/gold')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press">
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-navy tracking-tight">{member.member_name}</h2>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">Chit No. {member.chit_number}</p>
        </div>
        {user?.role === 'branch_admin' && member.status === 'active' && (
          <button
            onClick={() => setShowPaymentModal(true)}
            disabled={allPaid}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-2xl shadow-md tactile-press disabled:opacity-40"
          >
            <Plus size={14} /> Add Payment
          </button>
        )}
      </div>

      {/* Member info card */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-5 card-shadow border border-navy/5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center">
                <User size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-navy">{member.member_name}</p>
                <p className="text-[10px] font-medium text-navy/40">Started {new Date(member.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase tracking-wider ${
              member.status === 'active' ? 'text-emerald-600 bg-emerald-50' :
              member.status === 'completed' ? 'text-indigo bg-indigo/10' : 'text-red-500 bg-red-50'
            }`}>{member.status}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 bg-navy/2 rounded-2xl p-3">
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Monthly Amount</p>
              <p className="text-base font-bold text-navy mt-0.5">₹{parseFloat(member.monthly_amount).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Duration</p>
              <p className="text-sm font-bold text-navy mt-0.5">{member.total_months} months</p>
            </div>
            {member.member_phone && (
              <div className="flex items-center gap-1.5">
                <Phone size={10} className="text-navy/30" />
                <p className="text-xs font-medium text-navy">{member.member_phone}</p>
              </div>
            )}
            {member.member_address && (
              <div className="flex items-center gap-1.5">
                <MapPin size={10} className="text-navy/30" />
                <p className="text-xs font-medium text-navy truncate">{member.member_address}</p>
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

      {/* Progress bar */}
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
              <p className="text-base font-bold text-emerald-600">₹{totalPaid.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">Remaining</p>
              <p className="text-base font-bold text-amber-600">
                ₹{((member.total_months - paidCount) * parseFloat(member.monthly_amount)).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Month grid */}
      <div className="px-4 mb-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Monthly Payments</p>
        {isPaymentsLoading ? (
          <div className="flex justify-center p-6"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
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
                      <CheckCircle2 size={12} className="text-emerald-500 mx-auto mt-1" />
                      <p className="text-[8px] font-bold text-emerald-600 mt-0.5">₹{parseFloat(p.amount).toLocaleString()}</p>
                      <p className="text-[7px] text-navy/30 mt-0.5">
                        {new Date(p.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </>
                  ) : (
                    <Circle size={12} className="text-navy/20 mx-auto mt-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment history table */}
      {payments.length > 0 && (
        <div className="px-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Payment History</p>
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
                {payments.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-navy/5 ${idx % 2 === 0 ? '' : 'bg-navy/[0.01]'}`}>
                    <td className="px-4 py-3 text-sm font-bold text-navy">Month {p.month_number}</td>
                    <td className="px-4 py-3 text-xs font-medium text-navy/60">
                      {new Date(p.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-sm font-bold text-navy text-right">₹{parseFloat(p.amount).toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${MODE_STYLES[p.payment_mode]}`}>
                        {MODE_LABELS[p.payment_mode]}
                      </span>
                    </td>
                  </tr>
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
            <CheckCircle2 size={18} /> Mark Scheme Completed
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
    </motion.div>
  );
};

export default GoldMemberDetailPage;
