import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Plus, Search, Loader2, Users } from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetGoldMembersQuery, useGetGoldSummaryQuery } from '../store/api/apiSlice';

const STATUS_STYLES = {
  active:    'text-emerald-600 bg-emerald-50',
  completed: 'text-indigo bg-indigo/10',
  withdrawn: 'text-red-500 bg-red-50',
};

export const GoldSchemePage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: membersResult, isLoading } = useGetGoldMembersQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    limit: 200,
  });
  const { data: summary } = useGetGoldSummaryQuery();
  const members = membersResult?.data || [];

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
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
        <button onClick={() => navigate('/money')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press">
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-navy tracking-tight">Gold Savings Scheme</h2>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">12-month savings scheme members</p>
        </div>
        {user?.role === 'branch_admin' && (
          <button onClick={() => navigate('/gold/add')} className="w-10 h-10 rounded-2xl bg-indigo flex items-center justify-center text-white shadow-md tactile-press">
            <Plus size={20} />
          </button>
        )}
      </div>

      {/* Summary strip */}
      {summary && (
        <div className="px-4 mb-5">
          <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 grid grid-cols-4 divide-x divide-navy/5">
            {[
              { label: 'Total',     val: summary.totalChits },
              { label: 'Active',    val: summary.activeChits,    cls: 'text-emerald-600' },
              { label: 'Done',      val: summary.completedChits, cls: 'text-indigo' },
              { label: 'Monthly',   val: `₹${(summary.monthlyCommitment||0).toLocaleString()}`, cls: 'text-amber-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center px-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${cls || 'text-navy'}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filter */}
      <div className="px-4 mb-4 space-y-3">
        <form onSubmit={handleSearch} className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search name, chit no, phone…"
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 card-shadow"
          />
        </form>
        <div className="p-1 bg-navy/5 rounded-2xl grid grid-cols-4 gap-1">
          {[['all','All'],['active','Active'],['completed','Done'],['withdrawn','Left']].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${statusFilter === key ? 'bg-white shadow-sm text-indigo' : 'text-navy/40 hover:text-navy/60'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-navy/5">
            <Users size={28} className="text-navy/20 mb-3" />
            <p className="text-sm font-bold text-navy">No Members Found</p>
            <p className="text-xs font-medium text-navy/40 mt-1">
              {user?.role === 'branch_admin' ? 'Tap + to add the first member.' : 'No members enrolled yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl card-shadow border border-navy/5 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-navy/5 bg-navy/2">
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">S.No</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Name</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Contact</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Address</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Reference</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-right">Amount</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-center">Month</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, idx) => (
                    <tr
                      key={m.id}
                      onClick={() => navigate(`/gold/${m.id}`)}
                      className={`border-b border-navy/5 cursor-pointer hover:bg-amber-50/60 transition-colors ${idx % 2 === 0 ? '' : 'bg-navy/[0.01]'}`}
                    >
                      <td className="px-4 py-3 text-xs font-bold text-amber-600 whitespace-nowrap">{m.chit_number}</td>
                      <td className="px-4 py-3 text-sm font-bold text-navy whitespace-nowrap">{m.member_name}</td>
                      <td className="px-4 py-3 text-xs font-medium text-navy/60 whitespace-nowrap">{m.member_phone || '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-navy/60 max-w-[140px] truncate">{m.member_address || '—'}</td>
                      <td className="px-4 py-3 text-xs font-medium text-navy/60 whitespace-nowrap max-w-[130px] truncate">{m.referrer_name || '—'}</td>
                      <td className="px-4 py-3 text-sm font-bold text-navy text-right whitespace-nowrap">₹{parseFloat(m.monthly_amount).toLocaleString()}</td>
                      <td className="px-4 py-3 text-xs font-bold text-navy/50 text-center whitespace-nowrap">
                        {Math.min(m.months_elapsed, m.total_months)}/{m.total_months}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLES[m.status]}`}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default GoldSchemePage;
