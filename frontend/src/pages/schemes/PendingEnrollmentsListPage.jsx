import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search, X } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetPendingEnrollmentsQuery } from '../../store/api/apiSlice';
import { needsBranchSelection } from '../../lib/schemeAuth';
import { BranchPicker } from '../../components/BranchPicker';
import { formatCurrency } from '../../lib/formatters';
import { SOURCE_META, PENDING_ENROLLMENT_STATUS_STYLES, NAVIGABLE_SCHEMES } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import EmptyState from '../../components/EmptyState';

const STATUS_TABS = [
  { key: 'collecting',        label: 'Awaiting' },
  { key: 'completion_failed', label: 'Needs action' },
  { key: 'completed',         label: 'Started' },
  { key: 'cancelled',         label: 'Cancelled' },
];

const DATE_INPUT = 'flex-1 px-3 py-2 bg-white rounded-xl border border-navy/10 text-xs font-medium text-navy outline-none focus:ring-2 ring-indigo/20';

export const PendingEnrollmentsListPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isManagement = needsBranchSelection(user?.role);

  // Optional ?scheme= filter — set when arriving from a scheme page's Pending button.
  const schemeFilter = params.get('scheme') || undefined;
  const schemeLabel  = schemeFilter ? (SOURCE_META[schemeFilter]?.label || '') : '';
  const backTo       = (schemeFilter && NAVIGABLE_SCHEMES[schemeFilter]) || '/money/schemes';

  const [status, setStatus] = useState('collecting');
  const [branchId, setBranchId] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const skip = isManagement && !branchId;
  const { data, isLoading } = useGetPendingEnrollmentsQuery(
    {
      status,
      ...(schemeFilter ? { schemeCode: schemeFilter } : {}),
      ...(isManagement && branchId ? { branchId } : {}),
      ...(search ? { search } : {}),
      ...(dateFrom ? { startDate: dateFrom } : {}),
      ...(dateTo ? { endDate: dateTo } : {}),
    },
    { skip },
  );
  const rows    = data?.data || [];
  const summary = data?.summary;
  const hasDateFilter = !!(dateFrom || dateTo);

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={backTo}
        title={schemeLabel ? `${schemeLabel} · Pending` : 'Pending Enrollments'}
        subtitle="Deposits awaiting their balance"
      />

      <div className="px-4 space-y-4">
        {isManagement && (
          <BranchPicker value={branchId} onChange={setBranchId} />
        )}

        {/* Summary — how much is pending (per scheme) */}
        {summary && summary.count > 0 && (
          <div className="bg-white rounded-2xl border border-navy/5 card-shadow p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-navy/40">Outstanding</span>
              <span className="text-[10px] font-medium text-navy/40">{summary.count} pending</span>
            </div>
            <p className="text-2xl font-bold text-orange-600 mt-0.5">{formatCurrency(summary.remaining)}</p>
            <p className="text-[10px] font-medium text-navy/40">{formatCurrency(summary.collected)} collected so far</p>

            {!schemeFilter && summary.byScheme?.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-navy/5">
                {summary.byScheme.map((s) => {
                  const meta = SOURCE_META[s.schemeCode] || SOURCE_META.other;
                  return (
                    <span key={s.schemeCode} className={`px-2 py-1 rounded-lg text-[10px] font-bold ${meta.bg} ${meta.color}`}>
                      {meta.label} {formatCurrency(s.remaining)} ({s.count})
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" aria-hidden="true" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search customer name or code…"
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 card-shadow"
          />
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-navy/40">From</span>
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(e) => setDateFrom(e.target.value)} className={DATE_INPUT} />
          <span className="text-[10px] font-bold uppercase tracking-wider text-navy/40">To</span>
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className={DATE_INPUT} />
          {hasDateFilter && (
            <button type="button" onClick={() => { setDateFrom(''); setDateTo(''); }}
              className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 hover:text-navy/70 tactile-press flex-shrink-0" aria-label="Clear dates">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key} type="button" onClick={() => setStatus(t.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap tactile-press ${
                status === t.key ? 'bg-indigo text-white' : 'bg-white text-navy/50 border border-navy/10'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {skip ? (
          <EmptyState message="Select a branch to view pending enrollments." />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : rows.length === 0 ? (
          <EmptyState message="No pending enrollments here." />
        ) : (
          <div className="space-y-2">
            {rows.map((pe) => {
              const meta = SOURCE_META[pe.scheme_code] || SOURCE_META.other;
              const statusUi = PENDING_ENROLLMENT_STATUS_STYLES[pe.status] || { label: pe.status, className: 'text-navy/50 bg-navy/5' };
              const required = Number(pe.required_amount);
              const paid = Number(pe.amount_paid);
              const pct = required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : 0;
              return (
                <button
                  key={pe.id} type="button"
                  onClick={() => navigate(`/money/schemes/pending/${pe.id}${isManagement && branchId ? `?branchId=${branchId}` : ''}`)}
                  className="w-full bg-white rounded-2xl border border-navy/5 card-shadow p-3.5 text-left tactile-press"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy truncate">{pe.customer_name}</p>
                      <p className="text-[10px] font-medium text-navy/40">{meta.label} · {pe.customer_code}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${statusUi.className}`}>{statusUi.label}</span>
                      <ChevronRight size={16} className="text-navy/30" />
                    </div>
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-navy/5 overflow-hidden">
                      <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] font-bold text-navy/60">
                      {formatCurrency(paid)} / {formatCurrency(required)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default PendingEnrollmentsListPage;
