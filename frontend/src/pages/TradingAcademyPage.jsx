import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight, Plus, Loader2, CheckCircle2, X,
  Users, IndianRupee, Calendar, ChevronDown, Search
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetTradingMembersQuery,
  useGetTradingSummaryQuery,
  useGetTradingEmployeesQuery,
  useAddTradingMemberMutation,
} from '../store/api/apiSlice';
import { CustomerPicker } from '../components/CustomerPicker';
import { SchemeCalendar } from '../components/SchemeCalendar';
import { PeriodDateInput } from '../components/PeriodDateInput';
import { getCurrentPeriod } from '../lib/schemePeriod';

const fmt = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const ROLE_LABELS = {
  sales_officer:  'SO',
  abm:            'ABM',
  branch_manager: 'BM',
};

const inputCls = "w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo bg-white";

// ─── Add Member Bottom Sheet ───
const AddMemberSheet = ({ onClose, employees }) => {
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    amount:         '',
    enrolledBy:     '',
    enrollmentDate: new Date().toISOString().split('T')[0],
    paymentMode:    'cash',
    notes:          '',
  });
  const [addMember, { isLoading }] = useAddTradingMemberMutation();
  const [result, setResult] = useState(null);
  const [error, setError]   = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!customer) { setError('Please select or create a customer'); return; }
    try {
      const res = await addMember({
        customerId:     customer.id,
        amount:         parseFloat(form.amount),
        enrolledBy:     form.enrolledBy,
        enrollmentDate: form.enrollmentDate,
        paymentMode:    form.paymentMode,
        notes:          form.notes || undefined,
      }).unwrap();
      setResult(res);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to add member');
    }
  };

  if (result) {
    return (
      <div className="p-6 flex flex-col items-center text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 size={32} className="text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-bold text-navy">Member Added</p>
          <p className="text-sm text-navy/40 mt-1">{result.member?.customer?.name}</p>
          <p className="text-xs font-bold text-indigo mt-0.5">{result.member?.customer?.customer_code}</p>
        </div>
        {result.incentivesCreated > 0 && (
          <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-sm font-bold text-emerald-700">
              ✓ Incentives distributed to {result.incentivesCreated} team member{result.incentivesCreated > 1 ? 's' : ''}
            </p>
          </div>
        )}
        <button onClick={onClose} className="w-full py-3 bg-indigo text-white rounded-2xl font-bold tactile-press">
          Done
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-lg font-bold text-navy">New Enrollment</p>
        <button type="button" onClick={onClose} className="p-2 rounded-xl bg-navy/5 tactile-press">
          <X size={18} className="text-navy/40" />
        </button>
      </div>

      {/* Customer picker */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Customer *</label>
        <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)} />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Amount (₹) *</label>
        <input
          required
          type="number"
          min="1"
          step="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          placeholder="e.g. 10000"
          className={inputCls}
        />
      </div>

      {/* Enrolled By */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Enrolled By *</label>
        <div className="relative">
          <select
            required
            value={form.enrolledBy}
            onChange={e => set('enrolledBy', e.target.value)}
            className={`${inputCls} appearance-none pr-10`}
          >
            <option value="">— Select employee —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({ROLE_LABELS[emp.role] || emp.role})
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
        </div>
      </div>

      {/* Date + Payment Mode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Date *</label>
          <PeriodDateInput
            required
            value={form.enrollmentDate}
            onChange={e => set('enrollmentDate', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Mode *</label>
          <div className="relative">
            <select
              value={form.paymentMode}
              onChange={e => set('paymentMode', e.target.value)}
              className={`${inputCls} appearance-none pr-8`}
            >
              <option value="cash">Cash</option>
              <option value="gpay">GPay</option>
              <option value="bank_receipt">Bank</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Optional remarks"
          className={`${inputCls} resize-none`}
        />
      </div>

      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full py-4 bg-indigo text-white rounded-2xl font-bold tactile-press disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isLoading
          ? <><Loader2 className="animate-spin" size={18} /> Saving & distributing incentives…</>
          : 'Add Member'}
      </button>
    </form>
  );
};

// ─── Main Page ───
export const TradingAcademyPage = () => {
  const navigate = useNavigate();
  const user     = useSelector(selectCurrentUser);
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState(getCurrentPeriod);

  const { data: summary }                         = useGetTradingSummaryQuery({
    startDate: period.startDate,
    endDate: period.endDate,
  });
  const { data: membersData, isLoading }          = useGetTradingMembersQuery({
    search, page, limit: 30,
    startDate: period.startDate,
    endDate: period.endDate,
  });
  const { data: employees = [] }                  = useGetTradingEmployeesQuery(undefined, { skip: user?.role !== 'branch_admin' });

  const members = membersData?.data ?? [];
  const total   = membersData?.total ?? 0;
  const hasMore = total > page * 30;

  return (
    <div className="relative pb-32 pt-4">
      {/* Header */}
      <div className="px-4 flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/money/schemes')}
          className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"
        >
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-navy tracking-tight leading-tight">
            {user?.role === 'branch_admin' ? 'Agilavetri Trading Academy' : 'My Referrals'}
          </h2>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">
            {user?.role === 'branch_admin' ? 'PVT LTD' : 'Trading Academy · customers you referred'}
          </p>
        </div>
        {user?.role === 'branch_admin' && (
          <button
            onClick={() => setShowAdd(true)}
            className="w-10 h-10 rounded-2xl bg-indigo flex items-center justify-center text-white shadow-md tactile-press"
          >
            <Plus size={20} />
          </button>
        )}
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="px-4 grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Members', value: summary.totalMembers, Icon: Users },
            { label: 'Total Collected', value: fmt(summary.totalCollected), Icon: IndianRupee },
            { label: 'Today', value: summary.enrolledToday, Icon: Calendar },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="bg-white p-3 rounded-2xl card-shadow border border-navy/5 text-center">
              <Icon size={16} className="text-indigo mx-auto mb-1" />
              <p className="text-lg font-bold text-navy">{value}</p>
              <p className="text-[10px] text-navy/40 leading-tight">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Period picker */}
      <div className="px-4 mb-4">
        <SchemeCalendar compact onPeriodChange={(p) => { setPeriod(p); setPage(1); }} />
      </div>

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name or phone…"
            className="w-full pl-10 pr-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo bg-white"
          />
        </div>
      </div>

      {/* Members list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-indigo" size={28} />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 px-4">
          <Users size={40} className="text-navy/10 mx-auto mb-3" />
          <p className="text-sm font-semibold text-navy/30">
            {user?.role === 'branch_admin' ? 'No members yet' : 'No referrals yet'}
          </p>
          {user?.role === 'branch_admin' && (
            <p className="text-xs text-navy/20 mt-1">Tap + to add the first enrollment</p>
          )}
          {user?.role !== 'branch_admin' && (
            <p className="text-xs text-navy/20 mt-1">Customers you enroll will appear here</p>
          )}
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {members.map((m) => (
            <div key={m.id} className="bg-white p-4 rounded-2xl card-shadow border border-navy/5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-navy truncate">{m.customer_name}</p>
                    <span className="text-[10px] font-bold text-indigo bg-indigo/5 px-1.5 py-0.5 rounded-full shrink-0">{m.customer_code}</span>
                  </div>
                  {m.customer_phone && (
                    <p className="text-xs text-navy/40 mt-0.5">{m.customer_phone}</p>
                  )}
                  <p className="text-xs text-navy/30 mt-1">
                    By <span className="font-medium text-navy/50">{m.enrolled_by_name}</span>
                    {' '}({ROLE_LABELS[m.enrolled_by_role] || m.enrolled_by_role})
                    {' · '}{fmtDate(m.enrollment_date)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-indigo">{fmt(m.amount)}</p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                    m.payment_mode === 'cash'         ? 'bg-amber-100 text-amber-700' :
                    m.payment_mode === 'gpay'         ? 'bg-blue-100 text-blue-700'  :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {m.payment_mode === 'bank_receipt' ? 'Bank' : m.payment_mode}
                  </span>
                </div>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={() => setPage(p => p + 1)}
              className="w-full py-3 rounded-2xl border border-navy/10 text-sm font-medium text-navy/50 tactile-press"
            >
              Load more
            </button>
          )}
        </div>
      )}

      {/* Add member bottom sheet */}
      <AnimatePresence>
        {showAdd && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowAdd(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-[32px] max-h-[90vh] overflow-y-auto"
            >
              <AddMemberSheet onClose={() => setShowAdd(false)} employees={employees} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
