import { useState, useEffect, useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, Search, X, ChevronDown, CalendarDays } from 'lucide-react';
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

// Stable display order — mirrors the NAVIGABLE_SCHEMES key order.
const SCHEME_ORDER = Object.keys(NAVIGABLE_SCHEMES);

// Dropdown options: "All" first, then each in-scope pending scheme.
// Land is excluded — it uses a different payment model and is not pending-enrolled.
const SCHEME_OPTIONS = [
  { code: 'all', label: 'All schemes' },
  ...SCHEME_ORDER
    .filter((code) => code !== 'land_scheme')
    .map((code) => ({ code, label: SOURCE_META[code]?.label || code })),
];

// Build an ordered array of non-empty groups from the flat row list.
// Each group carries { schemeCode, meta, items, count, outstanding }.
function groupByScheme(rows) {
  const buckets = {};
  for (const pe of rows) {
    const code = pe.scheme_code || 'other';
    if (!buckets[code]) buckets[code] = [];
    buckets[code].push(pe);
  }

  const seen = new Set();
  const ordered = [];
  for (const code of [...SCHEME_ORDER, 'other']) {
    if (seen.has(code) || !buckets[code]) continue;
    seen.add(code);
    const items = buckets[code];
    const meta  = SOURCE_META[code] || SOURCE_META.other;
    const outstanding = items.reduce(
      (sum, pe) => sum + Math.max(0, Number(pe.required_amount) - Number(pe.amount_paid)),
      0,
    );
    ordered.push({ schemeCode: code, meta, items, count: items.length, outstanding });
  }
  // Safety: emit any codes not in SCHEME_ORDER and not 'other'.
  for (const code of Object.keys(buckets)) {
    if (seen.has(code)) continue;
    const items = buckets[code];
    const meta  = SOURCE_META[code] || SOURCE_META.other;
    const outstanding = items.reduce(
      (sum, pe) => sum + Math.max(0, Number(pe.required_amount) - Number(pe.amount_paid)),
      0,
    );
    ordered.push({ schemeCode: code, meta, items, count: items.length, outstanding });
  }
  return ordered;
}

// Individual enrollment card — extracted so it's not duplicated per section.
function PendingCard({ pe, isManagement, branchId, navigate }) {
  const meta     = SOURCE_META[pe.scheme_code] || SOURCE_META.other;
  const statusUi = PENDING_ENROLLMENT_STATUS_STYLES[pe.status] || { label: pe.status, className: 'text-navy/50 bg-navy/5' };
  const required = Number(pe.required_amount);
  const paid     = Number(pe.amount_paid);
  const pct      = required > 0 ? Math.min(100, Math.round((paid / required) * 100)) : 0;
  return (
    <button
      type="button"
      onClick={() => navigate(`/money/schemes/pending/${pe.id}${isManagement && branchId ? `?branchId=${branchId}` : ''}`)}
      className="w-full bg-white rounded-2xl border border-border card-shadow p-3.5 text-left tactile-press"
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
}

export const PendingEnrollmentsListPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isManagement = needsBranchSelection(user?.role);

  // Optional ?scheme= deep-link — pre-selects a scheme in the dropdown when
  // arriving from a scheme page's Pending button. Also determines the back target.
  const schemeFilter = params.get('scheme') || undefined;
  const backTo = (schemeFilter && NAVIGABLE_SCHEMES[schemeFilter]) || '/money/schemes';

  const [status,         setStatus]         = useState('collecting');
  const [branchId,       setBranchId]       = useState('');
  const [searchInput,    setSearchInput]    = useState('');
  const [search,         setSearch]         = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  // Scheme dropdown: defaults to the deep-link scheme if present, else "all".
  const [selectedScheme, setSelectedScheme] = useState(schemeFilter || 'all');
  // Date panel toggle — collapsed by default to save vertical space on mobile.
  const [showDates,      setShowDates]      = useState(false);

  // Debounce the search box so we don't refetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const skip = isManagement && !branchId;

  // Fetch ALL schemes — client-side dropdown filters the rendered groups,
  // so switching scheme never triggers a new network request.
  const { data, isLoading } = useGetPendingEnrollmentsQuery(
    {
      status,
      ...(isManagement && branchId ? { branchId } : {}),
      ...(search ? { search } : {}),
      ...(dateFrom ? { startDate: dateFrom } : {}),
      ...(dateTo ? { endDate: dateTo } : {}),
    },
    { skip },
  );
  const summary = data?.summary;
  const hasDateFilter = !!(dateFrom || dateTo);

  // All groups in display order.
  const groups = useMemo(() => groupByScheme(data?.data || []), [data]);

  // Groups visible given the current dropdown selection.
  const visibleGroups = selectedScheme === 'all'
    ? groups
    : groups.filter((g) => g.schemeCode === selectedScheme);

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={backTo}
        title="Pending Enrollments"
        subtitle="Deposits awaiting their balance"
      />

      <div className="px-4 space-y-4">
        {isManagement && (
          <BranchPicker value={branchId} onChange={setBranchId} />
        )}

        {/* Summary — outstanding across all schemes (always shown for full picture) */}
        {summary && summary.count > 0 && (
          <div className="bg-white rounded-2xl border border-border card-shadow p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-navy/40">Outstanding</span>
              <span className="text-[10px] font-medium text-navy/40">{summary.count} pending</span>
            </div>
            <p className="text-2xl font-bold text-orange-600 mt-0.5">{formatCurrency(summary.remaining)}</p>
            <p className="text-[10px] font-medium text-navy/40">{formatCurrency(summary.collected)} collected so far</p>

            {summary.byScheme?.length > 1 && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
                {summary.byScheme.map((s) => {
                  const meta = SOURCE_META[s.schemeCode] || SOURCE_META.other;
                  return (
                    <span key={s.schemeCode} className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${meta.bg} ${meta.color}`}>
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

        {/* Scheme dropdown + date-range toggle on one row */}
        <div className="flex items-center gap-2">
          {/* Scheme select — takes all remaining width */}
          <div className="relative flex-1 min-w-0">
            <select
              value={selectedScheme}
              onChange={(e) => setSelectedScheme(e.target.value)}
              className="w-full px-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 card-shadow appearance-none pr-8"
            >
              {SCHEME_OPTIONS.map((opt) => (
                <option key={opt.code} value={opt.code}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" aria-hidden="true" />
          </div>

          {/* Calendar toggle — shows date panel; active dot when a range is set */}
          <button
            type="button"
            onClick={() => setShowDates((v) => !v)}
            aria-label={showDates ? 'Hide date filter' : 'Show date filter'}
            className={`relative shrink-0 w-11 h-11 rounded-2xl border flex items-center justify-center tactile-press transition-colors ${
              hasDateFilter
                ? 'bg-indigo/10 border-indigo/20 text-indigo'
                : showDates
                  ? 'bg-navy/5 border-navy/10 text-navy/60'
                  : 'bg-white border-navy/10 text-navy/40 card-shadow'
            }`}
          >
            <CalendarDays size={17} aria-hidden="true" />
            {/* Active dot — visible whenever a date range is set, even when panel is closed */}
            {hasDateFilter && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-indigo" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Date range panel — revealed when toggle is open OR when a filter is active */}
        {(showDates || hasDateFilter) && (
          <div className="bg-white rounded-2xl border border-navy/10 card-shadow px-4 py-3 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-navy/40">From</span>
                <input
                  type="date"
                  value={dateFrom}
                  max={dateTo || undefined}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={DATE_INPUT}
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-navy/40">To</span>
                <input
                  type="date"
                  value={dateTo}
                  min={dateFrom || undefined}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={DATE_INPUT}
                />
              </div>
            </div>
            {hasDateFilter && (
              <button
                type="button"
                onClick={() => { setDateFrom(''); setDateTo(''); }}
                className="flex items-center gap-1.5 text-[10px] font-bold text-navy/40 hover:text-navy/70 tactile-press"
              >
                <X size={11} /> Clear dates
              </button>
            )}
          </div>
        )}

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

        {/* List */}
        {skip ? (
          <EmptyState message="Select a branch to view pending enrollments." />
        ) : isLoading ? (
          <LoadingSpinner />
        ) : visibleGroups.length === 0 ? (
          <EmptyState message="No pending enrollments here." />
        ) : (
          <div className="space-y-6 pb-4">
            {visibleGroups.map((group) => (
              <div key={group.schemeCode}>
                {/* Section header — shown only in "All schemes" view;
                    a specific scheme is already evident from the dropdown */}
                {selectedScheme === 'all' && (
                  <div className="flex items-center justify-between mb-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${group.meta.bg}`}>
                        <group.meta.Icon size={13} className={group.meta.color} aria-hidden="true" />
                      </span>
                      <span className="text-[11px] font-bold uppercase tracking-widest text-navy/70">
                        {group.meta.label}
                      </span>
                      <span className="text-[10px] font-medium text-navy/35">· {group.count}</span>
                    </div>
                    {group.outstanding > 0 && (
                      <span className="text-[10px] font-bold text-orange-500">
                        {formatCurrency(group.outstanding)} due
                      </span>
                    )}
                  </div>
                )}
                <div className="space-y-2">
                  {group.items.map((pe) => (
                    <PendingCard
                      key={pe.id}
                      pe={pe}
                      isManagement={isManagement}
                      branchId={branchId}
                      navigate={navigate}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default PendingEnrollmentsListPage;
