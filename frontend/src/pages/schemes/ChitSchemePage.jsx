import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, Loader2, Layers, ChevronRight, ShieldCheck } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetChitGroupsQuery, useGetChitSummaryQuery } from '../../store/api/apiSlice';
import { formatCurrency } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

const PACKAGES = {
  1: { label: 'Pkg 1', amount: '₹5,000',  color: 'text-violet-700 bg-violet-50' },
  2: { label: 'Pkg 2', amount: '₹10,000', color: 'text-indigo bg-indigo/10' },
  3: { label: 'Pkg 3', amount: '₹15,000', color: 'text-emerald-700 bg-emerald-50' },
  4: { label: 'Pkg 4', amount: '₹20,000', color: 'text-amber-700 bg-amber-50' },
  5: { label: 'Pkg 5', amount: '₹25,000', color: 'text-rose-700 bg-rose-50' },
};

const STATUS_STYLES = {
  forming:         'text-blue-600 bg-blue-50',
  active:          'text-emerald-600 bg-emerald-50',
  completed:       'text-indigo bg-indigo/10',
  pending_combine: 'text-amber-700 bg-amber-50',
  combined_into:   'text-navy/50 bg-navy/5',
  expired:         'text-red-500 bg-red-50',
};

const STATUS_LABELS = {
  forming:         'Filling',
  active:          'Active',
  completed:       'Done',
  pending_combine: 'Pending',
  combined_into:   'Combined',
  expired:         'Expired',
};

// Returns days remaining until the fill deadline (negative = overdue)
function daysUntilDeadline(fillDeadline) {
  if (!fillDeadline) return null;
  const diff = new Date(fillDeadline) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

// 'in_progress' is the default — backend maps it to forming + active + pending_combine
const STATUS_FILTERS = [
  ['in_progress',    'Active'],
  ['forming',        'Filling'],
  ['active',         'Running'],
  ['pending_combine','Pending'],
  ['all',            'All'],
  ['completed',      'Done'],
];

const HEAD_VIEW_ROLES = new Set(['md', 'director', 'branch_admin']);

export const ChitSchemePage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [searchInput,  setSearchInput]  = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('in_progress');

  const { data: groupsResult, isLoading } = useGetChitGroupsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    limit:  200,
  });
  const { data: summary } = useGetChitSummaryQuery({});

  const groups = groupsResult?.data || [];

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const isHeadBranchAdmin = user?.role === 'branch_admin' && user?.isHeadBranch;
  const canSeeHeadPage    = HEAD_VIEW_ROLES.has(user?.role) && (isHeadBranchAdmin || user?.role !== 'branch_admin');

  const rightAction = (
    <div className="flex items-center gap-2">
      {(isHeadBranchAdmin || user?.role === 'md' || user?.role === 'director') && (
        <button
          onClick={() => navigate('/money/schemes/agila-chit/head')}
          type="button"
          aria-label="Head Branch"
          className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-700 tactile-press"
        >
          <ShieldCheck size={18} aria-hidden="true" />
        </button>
      )}
      {user?.role === 'branch_admin' && (
        <button
          onClick={() => navigate('/money/schemes/agila-chit/create')}
          type="button"
          aria-label="Create chit group"
          className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center text-white shadow-md tactile-press"
        >
          <Plus size={20} aria-hidden="true" />
        </button>
      )}
    </div>
  );

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes"
        title="Agila Chit Fund"
        subtitle="20 members · 20 months · monthly winner"
        action={rightAction}
      />

      {/* Summary strip */}
      {summary && (
        <div className="px-4 mb-5">
          <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 grid grid-cols-4 divide-x divide-navy/5">
            {[
              { label: 'Groups',   val: summary.totalGroups },
              { label: 'Filling',  val: summary.formingGroups,   cls: 'text-blue-600' },
              { label: 'Running',  val: summary.activeGroups,    cls: 'text-emerald-600' },
              { label: 'Collected', val: formatCurrency(summary.totalCollected || 0), cls: 'text-amber-600' },
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
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search group name…"
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-violet-200 card-shadow"
          />
        </form>
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
          <div className="flex gap-1 w-max">
            {STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  statusFilter === key ? 'bg-violet-600 text-white shadow-sm' : 'bg-navy/5 text-navy/40 hover:text-navy/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Groups list */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-navy/5">
            <Layers size={28} className="text-navy/20 mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No Groups Found</p>
            <p className="text-xs font-medium text-navy/40 mt-1">
              {user?.role === 'branch_admin'
                ? 'Tap + to create the first group.'
                : 'No chit groups in your branch yet.'}
            </p>
          </div>
        ) : (
          groups.map(group => {
            const pkg          = PACKAGES[group.package_number] || PACKAGES[1];
            const progress     = group.winners_selected || 0;
            const isForming    = group.status === 'forming';
            const isPending    = group.status === 'pending_combine';
            const isCompleted  = group.status === 'completed';
            const isTerminal   = ['combined_into','expired'].includes(group.status);
            const daysLeft     = isForming ? daysUntilDeadline(group.fill_deadline) : null;

            return (
              <button
                key={group.id}
                onClick={() => navigate(`/money/schemes/agila-chit/${group.id}`)}
                className="w-full bg-white rounded-3xl p-4 card-shadow border border-navy/5 text-left hover:border-violet-100 transition-colors tactile-press"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-navy truncate">{group.group_name}</p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${pkg.color}`}>
                        {pkg.label} · {pkg.amount}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-medium text-navy/50 flex-wrap">
                      <span>{group.member_count}/20 members</span>
                      {!isForming && !isTerminal && (
                        <>
                          <span>·</span>
                          <span>Month {isCompleted ? 20 : Math.max((group.current_month || 2) - 1, 1)}/20</span>
                          <span>·</span>
                          <span>{progress} winners</span>
                        </>
                      )}
                      {isForming && daysLeft !== null && (
                        <>
                          <span>·</span>
                          <span className={daysLeft <= 3 ? 'text-red-500 font-bold' : ''}>
                            {daysLeft > 0 ? `${daysLeft}d to fill` : 'Deadline passed'}
                          </span>
                        </>
                      )}
                      {isPending && <span>· Awaiting head branch</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLES[group.status] || 'bg-navy/5 text-navy/40'}`}>
                      {STATUS_LABELS[group.status] || group.status}
                    </span>
                    <ChevronRight size={14} className="text-navy/20" aria-hidden="true" />
                  </div>
                </div>

                {/* Progress bar — only shown for active/completed groups */}
                {(group.status === 'active' || isCompleted) && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-violet-500 rounded-full"
                        style={{ width: `${Math.min((progress / 19) * 100, 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-medium text-navy/30 mt-1">
                      {progress} of 19 winner selections done
                    </p>
                  </div>
                )}

                {/* Member fill bar — shown for forming groups */}
                {isForming && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${(group.member_count / 20) * 100}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-medium text-navy/30 mt-1">
                      {group.member_count}/20 members enrolled · winner selection starts at 20
                    </p>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default ChitSchemePage;
