// SchemeBranchListPage — shows one scheme's per-branch breakdown.
// Reached from SchemesOverviewPage when MD/Director/Management taps a scheme card.
// Branches are ranked by collections with a period filter; for gold, MD and
// Management also get an org-wide member search with read-only drill-down.

import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Loader2, ChevronRight, MapPin, ShieldCheck,
  ChevronLeft, Trophy, Layers, Users,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetSchemesOverviewQuery,
  useGetSchemeBranchEntriesQuery,
  useGetGoldMembersQuery,
} from '../store/api/apiSlice';
import { SchemeCalendar } from '../components/SchemeCalendar';
import { BranchPicker } from '../components/BranchPicker';
import { SchemeSearchBar } from './schemes/components/SchemeSearchBar';
import { getCurrentPeriod } from '../lib/schemePeriod';
import { formatCurrency, formatNumber, formatDate } from '../lib/formatters';
import { SOURCE_META, GOLD_STATUS_STYLES } from '../lib/schemeConstants';

const VIEWER_ROLES = new Set(['md', 'director', 'management']);
// Roles allowed the org-wide member search + drill-down (view-only)
const SEARCH_ROLES = new Set(['md', 'management']);

const GOLD_STATUS_FILTERS = [
  ['all',       'All'],
  ['active',    'Active'],
  ['completed', 'Done'],
  ['withdrawn', 'Left'],
];

// ─── Entry row renderers — one per scheme (same as SchemesOverviewPage) ───────

const EntryRowGold = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
      #{entry.chit_number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {entry.customer_name || '—'}
        {entry.customer_code && <span className="ml-1.5 text-[10px] text-navy/40">{entry.customer_code}</span>}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatCurrency(entry.monthly_amount)}/mo · {entry.months_paid}/{entry.total_months} paid · {formatDate(entry.start_date)}
        {entry.referrer_name ? ` · via ${entry.referrer_name}` : ''}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-navy">{formatCurrency(entry.paid_so_far)}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${GOLD_STATUS_STYLES[entry.status] || 'bg-navy/5 text-navy/40'}`}>
        {entry.status}
      </span>
    </div>
  </div>
);

const EntryRowTrading = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-indigo/10 text-indigo flex items-center justify-center flex-shrink-0">
      <Layers size={14} aria-hidden="true" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {entry.customer_name || '—'}
        {entry.customer_code && <span className="ml-1.5 text-[10px] text-navy/40">{entry.customer_code}</span>}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatDate(entry.enrollment_date)}
        {entry.enrolled_by_name ? ` · by ${entry.enrolled_by_name}` : ''}
      </p>
    </div>
    <div className="flex-shrink-0">
      <p className="text-sm font-bold text-indigo">{formatCurrency(entry.amount)}</p>
    </div>
  </div>
);

const GC_STATUS = {
  filling: 'bg-blue-50 text-blue-600', pending_combine: 'bg-amber-50 text-amber-700',
  combined_into: 'bg-navy/5 text-navy/60', expired: 'bg-red-50 text-red-600',
  active: 'bg-emerald-50 text-emerald-700', completed: 'bg-indigo/10 text-indigo',
};

const EntryRowGoldCoin = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
      R{entry.room_number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">{entry.package_name}</p>
      <p className="text-[11px] text-navy/40 truncate">
        {entry.slots_held + entry.slots_won + entry.slots_refunded}/16 slots · {entry.draws_done}/16 draws
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-amber-700">{formatCurrency(entry.collected)}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${GC_STATUS[entry.status] || 'bg-navy/5 text-navy/40'}`}>
        {entry.status.replace(/_/g, ' ')}
      </span>
    </div>
  </div>
);

const EntryRowLss = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
      R{entry.room_number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">{entry.plan_name}</p>
      <p className="text-[11px] text-navy/40 truncate">
        {entry.slots_held + entry.slots_won + entry.slots_refunded}/20 slots · {entry.draws_done}/20 draws
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-violet-700">{formatCurrency(parseFloat(entry.collected))}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${GC_STATUS[entry.status] || 'bg-navy/5 text-navy/40'}`}>
        {entry.status.replace(/_/g, ' ')}
      </span>
    </div>
  </div>
);

const EntryRowChit = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
      P{entry.package_number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">{entry.group_name}</p>
      <p className="text-[11px] text-navy/40 truncate">
        {entry.member_count}/20 members · started {formatDate(entry.start_date)}
        {entry.status === 'completed' ? ' · completed' : ` · month ${entry.current_month ? entry.current_month - 1 : 1}/20`}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-violet-700">{formatCurrency(parseFloat(entry.total_collected || 0))}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${entry.status === 'completed' ? 'bg-indigo/10 text-indigo' : 'bg-emerald-50 text-emerald-700'}`}>
        {entry.status}
      </span>
    </div>
  </div>
);

const EntryRowLand = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0 truncate">
      {entry.site_number || '—'}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {entry.customer_name || '—'}
        {entry.customer_ref && <span className="ml-1.5 text-[10px] text-navy/40">{entry.customer_ref}</span>}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatDate(entry.booking_date)} · {entry.payment_mode?.replace(/_/g, ' ')}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-stone-700">{formatCurrency(parseFloat(entry.full_amount || 0))}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${entry.status === 'completed' ? 'bg-indigo/10 text-indigo' : entry.status === 'cancelled' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-700'}`}>
        {entry.status?.replace(/_/g, ' ')}
      </span>
    </div>
  </div>
);

const BUILDERS_STATUS_STYLES = {
  cooling: 'bg-blue-50 text-blue-600', active: 'bg-emerald-50 text-emerald-700',
  decision_pending: 'bg-amber-50 text-amber-700', house: 'bg-sky-50 text-sky-700',
  cash: 'bg-violet-50 text-violet-700', completed: 'bg-indigo/10 text-indigo',
  cancelled: 'bg-red-50 text-red-500',
};

const EntryRowBuilders = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
      {entry.investment_amount / 100_000}L
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {entry.customer_name || '—'}
        {entry.customer_code && <span className="ml-1.5 text-[10px] text-navy/40">{entry.customer_code}</span>}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatDate(entry.lump_sum_date)}
        {entry.current_month > 0 ? ` · month ${entry.current_month}/60` : ' · cooling'}
        {entry.reward_choice ? ` · ${entry.reward_choice}` : ''}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-sky-700">{formatCurrency(parseFloat(entry.total_paid_out || 0))}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${BUILDERS_STATUS_STYLES[entry.status] || 'bg-navy/5 text-navy/40'}`}>
        {entry.status?.replace(/_/g, ' ')}
      </span>
    </div>
  </div>
);

const ENTRY_ROW = {
  gold_scheme:       EntryRowGold,
  trading_academy:   EntryRowTrading,
  gold_coin_scheme:  EntryRowGoldCoin,
  lss_scheme:        EntryRowLss,
  agila_chit_scheme: EntryRowChit,
  builders_scheme:   EntryRowBuilders,
  land_scheme:       EntryRowLand,
};

// ─── Branch entries (inline expand) ──────────────────────────────────────────

const BranchEntries = ({ schemeCode, branchId, startDate, endDate, onEntryClick }) => {
  const { data, isLoading, error } = useGetSchemeBranchEntriesQuery({ code: schemeCode, branchId, startDate, endDate });
  const Row = ENTRY_ROW[schemeCode];

  if (isLoading) return <div className="flex justify-center py-6"><Loader2 className="animate-spin text-indigo/40" size={20} aria-hidden="true" /></div>;
  if (error)     return <p className="px-4 py-4 text-xs text-red-600 text-center">Failed to load entries.</p>;

  const entries = data?.entries ?? [];
  if (entries.length === 0) return <p className="px-4 py-6 text-xs text-navy/40 text-center">No entries for this branch{startDate ? ' in this period' : ''}.</p>;

  return (
    <div className="divide-y divide-border">
      {entries.map(e => {
        const row = Row ? <Row entry={e} /> : (
          <div className="px-4 py-3 text-xs text-navy/40">{e.id}</div>
        );
        // View-only drill-down: rows become buttons when the page wires a handler
        return onEntryClick ? (
          <button
            key={e.id}
            type="button"
            onClick={() => onEntryClick(e)}
            className="block w-full text-left hover:bg-amber-50/60 transition-colors cursor-pointer"
          >
            {row}
          </button>
        ) : (
          <div key={e.id}>{row}</div>
        );
      })}
    </div>
  );
};

// ─── Branch card ──────────────────────────────────────────────────────────────

const UNIT_LABEL = {
  gold_scheme:       'chits',
  trading_academy:   'enrollments',
  gold_coin_scheme:  'slots',
  lss_scheme:        'slots',
  agila_chit_scheme: 'groups',
  builders_scheme:   'plans',
  land_scheme:       'bookings',
};

// Rank badge colors — podium branches stand out, the rest stay muted
const RANK_STYLES = {
  1: 'bg-amber-100 text-amber-700',
  2: 'bg-slate-200 text-slate-600',
  3: 'bg-orange-100 text-orange-700',
};

const BranchCard = ({ branch, schemeCode, meta, rank, maxCollected, expanded, onToggle, startDate, endDate, onEntryClick }) => {
  const share = maxCollected > 0 ? Math.max(2, (branch.collected / maxCollected) * 100) : 0;
  return (
    <div className={`bg-white rounded-2xl card-shadow border overflow-hidden transition-all ${expanded ? 'border-indigo/20' : 'border-border'}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3.5 flex items-center gap-3 text-left"
      >
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-[11px] font-bold ${RANK_STYLES[rank] || `${meta.bg} ${meta.color}`}`}>
          #{rank}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{branch.branchName}</p>
          <p className="text-[11px] text-navy/40">
            {formatNumber(branch.count)} {UNIT_LABEL[schemeCode] || 'entries'}
            {branch.commission > 0 ? ` · ${formatCurrency(branch.commission)} comm.` : ''}
          </p>
          {/* Relative share of the top branch's collections */}
          <div className="mt-1.5 h-1 bg-navy/5 rounded-full overflow-hidden">
            <div className="h-full bg-indigo/60 rounded-full" style={{ width: `${share}%` }} />
          </div>
        </div>
        <div className="flex-shrink-0 text-right mr-1">
          <p className="text-sm font-bold text-navy">{formatCurrency(branch.collected)}</p>
        </div>
        <ChevronRight
          size={16}
          className={`text-navy/30 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="border-t border-border bg-navy/[0.015]">
          <BranchEntries
            schemeCode={schemeCode}
            branchId={branch.branchId}
            startDate={startDate}
            endDate={endDate}
            onEntryClick={onEntryClick ? (entry) => onEntryClick(entry, branch.branchId) : undefined}
          />
        </div>
      )}
    </div>
  );
};

// ─── Gold search result row (org-wide member search, view-only) ──────────────

const GoldSearchResultRow = ({ member, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-amber-50/60 transition-colors"
  >
    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
      #{member.chit_number}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {member.customer_name || '—'}
        {member.customer_code && <span className="ml-1.5 text-[10px] text-navy/40">{member.customer_code}</span>}
      </p>
      <p className="text-[11px] text-indigo/70 font-semibold truncate flex items-center gap-1">
        <MapPin size={10} className="flex-shrink-0" aria-hidden="true" />
        {member.branch_name}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatCurrency(member.monthly_amount)}/mo · {member.months_paid}/{member.total_months} paid · {formatDate(member.start_date)}
        {member.referrer_user_name ? ` · via ${member.referrer_user_name}` : ''}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-navy">{formatCurrency(parseFloat(member.paid_so_far || 0))}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${GOLD_STATUS_STYLES[member.status] || 'bg-navy/5 text-navy/40'}`}>
        {member.status}
      </span>
    </div>
  </button>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export const SchemeBranchListPage = () => {
  const user       = useSelector(selectCurrentUser);
  const navigate   = useNavigate();
  const { code }   = useParams();

  const [search,           setSearch]           = useState('');
  const [expandedBranchId, setExpandedBranchId] = useState(null);
  const [allTime,          setAllTime]          = useState(false);
  const [period,           setPeriod]           = useState(getCurrentPeriod);
  const [branchFilter,     setBranchFilter]     = useState('');
  const [statusFilter,     setStatusFilter]     = useState('all');
  const [limit,            setLimit]            = useState(50);

  // Gold member search is org-wide — MD/Management only, and only on the gold page
  const isGoldSearch = code === 'gold_scheme' && SEARCH_ROLES.has(user?.role);
  const searchActive = isGoldSearch && (search.trim().length >= 2 || !!branchFilter);

  // Reset pagination whenever a search input changes
  const applySearch       = (v) => { setSearch(v);       setLimit(50); };
  const applyBranchFilter = (v) => { setBranchFilter(v); setLimit(50); };
  const applyStatusFilter = (v) => { setStatusFilter(v); setLimit(50); };

  const dateFilter = allTime ? undefined : { startDate: period.startDate, endDate: period.endDate };
  const { data, isLoading } = useGetSchemesOverviewQuery(dateFilter, { skip: !VIEWER_ROLES.has(user?.role) });

  // Org-wide member search spans all periods — the branch/date breakdown above
  // answers "when"; search answers "where is this customer/referrer".
  const { data: membersResult, isFetching: searchLoading } = useGetGoldMembersQuery({
    search:   search.trim().length >= 2 ? search.trim() : undefined,
    branchId: branchFilter || undefined,
    status:   statusFilter === 'all' ? undefined : statusFilter,
    // Monitoring search also matches the referrer's name (opt-in flag)
    searchReferrers: true,
    limit,
  }, { skip: !searchActive });
  const searchResults = membersResult?.data ?? [];
  const searchTotal   = membersResult?.total ?? 0;

  const scheme = useMemo(
    () => (data?.schemes ?? []).find(s => s.schemeCode === code),
    [data, code]
  );

  // Rank branches by collections (highest first); plain-text search still
  // narrows by branch name when the member search mode is not active.
  const rankedBranches = useMemo(() => {
    const branches = [...(scheme?.byBranch ?? [])]
      .sort((a, b) => b.collected - a.collected)
      .map((b, i) => ({ ...b, rank: i + 1 }));
    if (searchActive || !search.trim()) return branches;
    const q = search.toLowerCase();
    return branches.filter(b => b.branchName.toLowerCase().includes(q));
  }, [scheme, search, searchActive]);

  const maxCollected = rankedBranches.length ? Math.max(...rankedBranches.map(b => b.collected)) : 0;

  // Read-only drill-down into a gold member (branchId travels as a query param
  // because MD/Management have no branch on their JWT)
  const openGoldMember = (memberId, branchId) =>
    navigate(`/money/schemes/gold/${memberId}?branchId=${branchId}&from=schemes`);

  const meta = SOURCE_META[code] ?? SOURCE_META.scheme;

  if (!VIEWER_ROLES.has(user?.role)) {
    return (
      <div className="px-4 pt-10">
        <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
          <ShieldCheck size={32} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-bold text-navy">Access denied</p>
        </div>
      </div>
    );
  }

  const totals = scheme?.totals;

  return (
    <div className="pb-32 pt-4">
      {/* Header */}
      <div className="px-4 mb-5 flex items-center gap-3">
        <button
          onClick={() => navigate('/schemes')}
          className="w-9 h-9 rounded-2xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press flex-shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-navy truncate">{scheme?.schemeName ?? code}</h2>
          <p className="text-[11px] font-medium text-navy/40">Branch breakdown</p>
        </div>
      </div>

      {/* Period picker + all-time toggle — dimmed while a member search is active */}
      <div className={`px-4 mb-5 flex items-center gap-2 transition-opacity ${searchActive ? 'opacity-40 pointer-events-none' : ''}`}>
        <div className={`flex-1 transition-opacity ${allTime ? 'opacity-40 pointer-events-none' : ''}`}>
          <SchemeCalendar compact onPeriodChange={setPeriod} />
        </div>
        <button
          type="button"
          onClick={() => setAllTime(prev => !prev)}
          className={`px-3 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all flex-shrink-0 ${
            allTime ? 'bg-indigo text-white shadow-md' : 'bg-white text-navy/50 border border-navy/10 card-shadow hover:text-navy/70'
          }`}
        >
          All time
        </button>
      </div>

      {/* Totals strip — reflects the selected period; hidden during member search */}
      {totals && !searchActive && (
        <div className="px-4 mb-5">
          <div className={`rounded-3xl p-4 card-shadow border border-border ${meta.bg} grid grid-cols-4 divide-x divide-navy/10`}>
            {[
              { label: 'Collected',  val: formatCurrency(totals.collected),  cls: 'text-navy'        },
              { label: 'Commission', val: formatCurrency(totals.commission), cls: 'text-emerald-700' },
              { label: UNIT_LABEL[code] || 'Entries', val: formatNumber(totals.count), cls: 'text-navy' },
              { label: 'Branches',   val: totals.branchCount,                cls: meta.color         },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center px-2">
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40 capitalize">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${cls}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div className="px-4 mb-4 space-y-3">
        <SchemeSearchBar
          onSearch={applySearch}
          placeholder={isGoldSearch
            ? 'Search customer, phone, chit no, referrer…'
            : `Search ${rankedBranches.length} branches…`}
        />
        {isGoldSearch && (
          <>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <BranchPicker
                  value={branchFilter}
                  onChange={applyBranchFilter}
                  required={false}
                  emptyLabel="All branches"
                />
              </div>
              {searchActive && !searchLoading && (
                <span className="text-[10px] font-medium text-navy/40 flex-shrink-0">
                  {formatNumber(searchTotal)} result{searchTotal === 1 ? '' : 's'}
                </span>
              )}
            </div>
            {searchActive && (
              <div className="p-1 bg-navy/5 rounded-2xl grid grid-cols-4 gap-1">
                {GOLD_STATUS_FILTERS.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyStatusFilter(key)}
                    className={`py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                      statusFilter === key ? 'bg-white shadow-sm text-indigo' : 'text-navy/40 hover:text-navy/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {searchActive ? (
        /* ─── Org-wide member search results (view-only drill-down) ─── */
        <div className="px-4">
          {searchLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
            </div>
          ) : searchResults.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 card-shadow border border-border text-center">
              <Users size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-navy">No members found</p>
              <p className="text-xs text-navy/40 mt-1">Try a different name, phone, chit number or referrer.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl card-shadow border border-border overflow-hidden divide-y divide-border">
                {searchResults.map(m => (
                  <GoldSearchResultRow
                    key={m.id}
                    member={m}
                    onClick={() => openGoldMember(m.id, m.branch_id)}
                  />
                ))}
              </div>
              {searchResults.length < searchTotal && (
                <button
                  type="button"
                  onClick={() => setLimit(prev => prev + 50)}
                  className="w-full mt-3 py-3 rounded-2xl bg-white border border-navy/10 card-shadow text-xs font-bold text-indigo tactile-press"
                >
                  Show more ({formatNumber(searchTotal - searchResults.length)} remaining)
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        /* ─── Ranked branch collections list ─── */
        <div className="px-4 space-y-2">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
            </div>
          ) : rankedBranches.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 card-shadow border border-border text-center">
              <MapPin size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-navy">
                {search ? `No branches match "${search}"` : 'No activity yet'}
              </p>
              <p className="text-xs text-navy/40 mt-1">
                {allTime ? 'No collections recorded for this scheme.' : 'No collections in this period — try “All time”.'}
              </p>
            </div>
          ) : (
            rankedBranches.map(branch => (
              <BranchCard
                key={branch.branchId}
                branch={branch}
                schemeCode={code}
                meta={meta}
                rank={branch.rank}
                maxCollected={maxCollected}
                startDate={allTime ? undefined : period.startDate}
                endDate={allTime ? undefined : period.endDate}
                expanded={expandedBranchId === branch.branchId}
                onToggle={() => setExpandedBranchId(prev => prev === branch.branchId ? null : branch.branchId)}
                onEntryClick={isGoldSearch ? (entry, branchId) => openGoldMember(entry.id, branchId) : undefined}
              />
            ))
          )}
        </div>
      )}

      {/* Footer commission note */}
      {!searchActive && rankedBranches.some(b => b.commission > 0) && (
        <div className="px-4 mt-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-3 flex items-center gap-2">
            <Trophy size={14} className="text-emerald-600 flex-shrink-0" aria-hidden="true" />
            <p className="text-[11px] font-medium text-emerald-700">
              Commission = employee incentives credited for this scheme across all branches.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default SchemeBranchListPage;
