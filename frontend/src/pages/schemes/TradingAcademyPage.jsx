import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Loader2, Users, IndianRupee, Calendar, Search } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetTradingMembersQuery,
  useGetTradingSummaryQuery,
  useGetTradingEmployeesQuery,
} from '../../store/api/apiSlice';
import { SchemeCalendar } from '../../components/SchemeCalendar';
import { getCurrentPeriod } from '../../lib/schemePeriod';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { TRADING_ROLE_LABELS } from '../../lib/schemeConstants';
import { SchemePageHeader } from './components/SchemePageHeader';
import { AddMemberSheet } from './components/AddMemberSheet';
import { PhotoProof } from '../../components/money/PhotoProof';

export const TradingAcademyPage = () => {
  const navigate = useNavigate();
  const user     = useSelector(selectCurrentUser);

  const [search,   setSearch]   = useState('');
  const [page,     setPage]     = useState(1);
  const [showAdd,  setShowAdd]  = useState(false);
  const [period,   setPeriod]   = useState(getCurrentPeriod);

  const { data: summary }                = useGetTradingSummaryQuery({ startDate: period.startDate, endDate: period.endDate });
  const { data: membersData, isLoading } = useGetTradingMembersQuery({ search, page, limit: 30, startDate: period.startDate, endDate: period.endDate });
  const isManagement = user?.role === 'management';
  const [branchId, setBranchId] = useState('');

  const { data: employees = [] }         = useGetTradingEmployeesQuery(undefined, { skip: user?.role !== 'branch_admin' && !isManagement });

  const members = membersData?.data ?? [];
  const total   = membersData?.total ?? 0;
  const hasMore = total > page * 30;

  return (
    <div className="relative pb-32 pt-4">
      {/* Header */}
      <SchemePageHeader
        backTo="/money/schemes"
        title={(user?.role === 'branch_admin' || isManagement) ? 'Agilavetri Trading Academy' : 'My Referrals'}
        subtitle={(user?.role === 'branch_admin' || isManagement) ? 'PVT LTD' : 'Trading Academy · customers you referred'}
        action={
          (user?.role === 'branch_admin' || isManagement) ? (
            <button
              onClick={() => setShowAdd(true)}
              className="w-10 h-10 rounded-2xl bg-indigo flex items-center justify-center text-white shadow-md tactile-press"
              aria-label="Add new member"
            >
              <Plus size={20} aria-hidden="true" />
            </button>
          ) : null
        }
      />

      {/* Summary strip */}
      {summary && (
        <div className="px-4 grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Total Members',   value: summary.totalMembers,                Icon: Users },
            { label: 'Total Collected', value: formatCurrency(summary.totalCollected), Icon: IndianRupee },
            { label: 'Today',           value: summary.enrolledToday,               Icon: Calendar },
          ].map(({ label, value, Icon }) => (
            <div key={label} className="bg-white p-3 rounded-2xl card-shadow border border-navy/5 text-center">
              <Icon size={16} className="text-indigo mx-auto mb-1" aria-hidden="true" />
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
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" aria-hidden="true" />
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
          <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
        </div>
      ) : members.length === 0 ? (
        <div className="text-center py-16 px-4">
          <Users size={40} className="text-navy/10 mx-auto mb-3" aria-hidden="true" />
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
                    <span className="text-[10px] font-bold text-indigo bg-indigo/5 px-1.5 py-0.5 rounded-full shrink-0">
                      {m.customer_code}
                    </span>
                  </div>
                  {m.customer_phone && (
                    <p className="text-xs text-navy/40 mt-0.5">{m.customer_phone}</p>
                  )}
                  <p className="text-xs text-navy/30 mt-1">
                    By <span className="font-medium text-navy/50">{m.enrolled_by_name}</span>
                    {' '}({TRADING_ROLE_LABELS[m.enrolled_by_role] || m.enrolled_by_role})
                    {' · '}{formatDate(m.enrollment_date)}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-indigo">{formatCurrency(m.amount)}</p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                    m.payment_mode === 'cash'         ? 'bg-amber-100 text-amber-700' :
                    m.payment_mode === 'gpay'         ? 'bg-blue-100 text-blue-700'  :
                    'bg-emerald-100 text-emerald-700'
                  }`}>
                    {m.payment_mode === 'bank_receipt' ? 'Bank' : m.payment_mode}
                  </span>
                </div>
              </div>
              <PhotoProof photoKey={m.proof_key} />
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
              <AddMemberSheet onClose={() => setShowAdd(false)} employees={employees}
                branchId={isManagement ? branchId : undefined} />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

export default TradingAcademyPage;
