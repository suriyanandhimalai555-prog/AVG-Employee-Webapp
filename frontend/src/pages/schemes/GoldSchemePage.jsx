import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Users } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetGoldMembersQuery, useGetGoldSummaryQuery } from '../../store/api/apiSlice';
import { SchemeCalendar } from '../../components/SchemeCalendar';
import { getCurrentPeriod, getPeriodForDate } from '../../lib/schemePeriod';
import { formatCurrency } from '../../lib/formatters';
import { REFERRER_ROLES, GOLD_STATUS_STYLES } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { SchemePendingBanner } from './components/SchemePendingBanner';
import { SchemeSearchBar } from './components/SchemeSearchBar';

const STATUS_FILTERS = [
  ['all',       'All'],
  ['active',    'Active'],
  ['completed', 'Done'],
  ['withdrawn', 'Left'],
];

export const GoldSchemePage = () => {
  const user          = useSelector(selectCurrentUser);
  const navigate      = useNavigate();
  const isReferrerView = REFERRER_ROLES.has(user?.role);

  const [search,       setSearch]       = useState('');
  const [scope,        setScope]        = useState('all'); // 'all' | 'period'
  const [statusFilter, setStatusFilter] = useState('all');
  const [period,       setPeriod]       = useState(getCurrentPeriod);

  // When searching globally, omit period bounds so results span all periods
  const searchingGlobally = search && scope === 'all';

  // Backend auto-forces referrerId = user.id for referrer roles
  const { data: membersResult, isLoading } = useGetGoldMembersQuery({
    status:    statusFilter === 'all' ? undefined : statusFilter,
    search:    search || undefined,
    limit:     200,
    startDate: searchingGlobally ? undefined : period.startDate,
    endDate:   searchingGlobally ? undefined : period.endDate,
  });
  const { data: summary } = useGetGoldSummaryQuery({
    startDate: period.startDate,
    endDate:   period.endDate,
  });
  const members = membersResult?.data || [];

  const addButton = user?.role === 'branch_admin' ? (
    <button
      onClick={() => navigate('/money/schemes/gold/add')}
      type="button"
      aria-label="Add gold scheme member"
      className="w-10 h-10 rounded-2xl bg-indigo flex items-center justify-center text-white shadow-md tactile-press"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes"
        title={isReferrerView ? 'My Referrals' : 'Gold Savings Scheme'}
        subtitle={isReferrerView ? 'Gold scheme · customers you referred' : '12-month savings scheme members'}
        action={addButton}
      />

      <SchemePendingBanner schemeCode="gold_scheme" />

      {/* Period picker — dimmed while a global search is active */}
      <div className={`px-4 mb-5 transition-opacity ${searchingGlobally ? 'opacity-40 pointer-events-none' : ''}`}>
        <SchemeCalendar compact onPeriodChange={setPeriod} />
      </div>

      {/* Summary strip — hidden during global search (counts would reflect period, not results) */}
      {summary && !searchingGlobally && (
        <div className="px-4 mb-5">
          <div className="bg-white rounded-3xl p-4 card-shadow border border-border grid grid-cols-4 divide-x divide-border">
            {[
              { label: 'Total',   val: summary.totalChits },
              { label: 'Active',  val: summary.activeChits,    cls: 'text-emerald-600' },
              { label: 'Done',    val: summary.completedChits, cls: 'text-indigo' },
              { label: 'Monthly', val: formatCurrency(summary.monthlyCommitment || 0), cls: 'text-amber-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center px-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${cls || 'text-navy'}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + scope toggle + status filter */}
      <div className="px-4 mb-4 space-y-3">
        <SchemeSearchBar onSearch={setSearch} placeholder="Search name, chit no, phone…" />
        {search && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-navy/40 uppercase tracking-wider">Scope:</span>
            {[['all', 'All periods'], ['period', 'Selected month']].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                  scope === key ? 'bg-indigo text-white' : 'bg-navy/5 text-navy/50 hover:text-navy/70'
                }`}
              >
                {label}
              </button>
            ))}
            {!isLoading && (
              <span className="ml-auto text-[10px] font-medium text-navy/40">{members.length} results</span>
            )}
          </div>
        )}
        <div className="p-1 bg-navy/5 rounded-2xl grid grid-cols-4 gap-1">
          {STATUS_FILTERS.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                statusFilter === key ? 'bg-white shadow-sm text-indigo' : 'text-navy/40 hover:text-navy/60'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Members table */}
      <div className="px-4">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
          </div>
        ) : members.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-border">
            <Users size={28} className="text-navy/20 mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">
              {isReferrerView ? 'No referrals yet' : 'No Members Found'}
            </p>
            <p className="text-xs font-medium text-navy/40 mt-1">
              {user?.role === 'branch_admin'
                ? 'Tap + to add the first member.'
                : 'Customers you refer will appear here.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-3xl card-shadow border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[580px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-navy/2">
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">S.No</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Customer</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Contact</th>
                    {!isReferrerView && (
                      <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap">Referred By</th>
                    )}
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-right">Amount</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-center">Month</th>
                    <th className="px-4 py-3 text-[9px] font-bold uppercase tracking-widest text-navy/40 whitespace-nowrap text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, idx) => (
                    <tr
                      key={m.id}
                      onClick={() => navigate(`/money/schemes/gold/${m.id}`)}
                      className={`border-b border-border cursor-pointer hover:bg-amber-50/60 transition-colors ${idx % 2 === 0 ? '' : 'bg-navy/[0.01]'}`}
                    >
                      <td className="px-4 py-3 text-xs font-bold text-amber-600 whitespace-nowrap">{m.chit_number}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-sm font-bold text-navy">{m.customer_name}</p>
                        <p className="text-[10px] font-bold text-indigo/60">{m.customer_code}</p>
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-navy/60 whitespace-nowrap">{m.customer_phone || '—'}</td>
                      {!isReferrerView && (
                        <td className="px-4 py-3 text-xs font-medium text-navy/60 whitespace-nowrap max-w-[130px] truncate">{m.referrer_name || '—'}</td>
                      )}
                      <td className="px-4 py-3 text-sm font-bold text-navy text-right whitespace-nowrap">
                        {formatCurrency(m.monthly_amount)}
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-navy/50 text-center whitespace-nowrap">
                        {searchingGlobally
                          ? getPeriodForDate(m.start_date).label
                          : `${Math.min(m.months_paid ?? 0, m.total_months)}/${m.total_months}`}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${GOLD_STATUS_STYLES[m.status]}`}>
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
    </SchemePageWrapper>
  );
};

export default GoldSchemePage;
