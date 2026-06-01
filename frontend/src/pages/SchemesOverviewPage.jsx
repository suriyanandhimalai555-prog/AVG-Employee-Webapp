// MD / Director Schemes dashboard.
//
// One page, three zoom levels:
//   1. Top: a card per scheme with org-wide totals (count, collected, commission).
//   2. Expand a scheme card → per-branch breakdown rows for that scheme.
//   3. Expand a branch row → inline list of that branch's entries (members /
//      rooms / enrollments — the shape varies by scheme).
//
// Backed by /api/schemes/* which walks the SchemeService registry; this page
// renders whatever schemes the backend reports. Adding a new scheme means
// implementing the two optional contract methods — no frontend edits required.

import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  ChevronRight,
  Layers,
  Wallet,
  Users,
  Sparkles,
  ShieldCheck,
  MapPin,
  Calendar,
  Trophy,
  CircleSlash,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetSchemesOverviewQuery,
  useGetSchemeBranchEntriesQuery,
} from '../store/api/apiSlice';
import { formatCurrency, formatDate, formatNumber } from '../lib/formatters';
import { SOURCE_META, GOLD_STATUS_STYLES } from '../lib/schemeConstants';

const VIEWER_ROLES = new Set(['md', 'director']);

// ─── Small presentational helpers ────────────────────────────────────────────

const StatBlock = ({ label, value, tone = 'navy', icon }) => {
  const toneClass = {
    navy:    'text-navy',
    amber:   'text-amber-700',
    emerald: 'text-emerald-600',
    indigo:  'text-indigo',
  }[tone];
  return (
    <div className="flex-1 min-w-[110px] bg-white/60 rounded-2xl px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-base font-bold ${toneClass}`}>{value}</p>
    </div>
  );
};

const AccessDenied = () => (
  <div className="px-4 pt-10">
    <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
      <ShieldCheck size={32} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
      <p className="text-sm font-bold text-navy">Access denied</p>
      <p className="text-xs text-navy/50 mt-1">Only MD or Director can view the schemes dashboard.</p>
    </div>
  </div>
);

// ─── Per-scheme entry rendering (scheme-aware templates) ────────────────────
// Each scheme returns rows in its own shape. Keep the renderers small and
// scheme-specific rather than forcing a one-size-fits-all row.

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
        {formatCurrency(entry.monthly_amount)}/mo · {entry.months_paid}/{entry.total_months} paid · started {formatDate(entry.start_date)}
        {entry.referrer_name ? ` · via ${entry.referrer_name}` : ''}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-navy">{formatCurrency(entry.paid_so_far)}</p>
      <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${GOLD_STATUS_STYLES[entry.status] || 'bg-navy/5 text-navy/40'}`}>
        {entry.status}
      </span>
    </div>
  </div>
);

const EntryRowTrading = ({ entry }) => (
  <div className="px-4 py-3 flex items-center gap-3">
    <div className="w-8 h-8 rounded-xl bg-indigo/10 text-indigo flex items-center justify-center flex-shrink-0">
      <Users size={14} aria-hidden="true" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {entry.customer_name || '—'}
        {entry.customer_code && <span className="ml-1.5 text-[10px] text-navy/40">{entry.customer_code}</span>}
      </p>
      <p className="text-[11px] text-navy/40 truncate">
        {formatDate(entry.enrollment_date)}
        {entry.enrolled_by_name ? ` · by ${entry.enrolled_by_name} (${(entry.enrolled_by_role || '').replace(/_/g, ' ')})` : ''}
      </p>
    </div>
    <div className="flex-shrink-0 text-right">
      <p className="text-sm font-bold text-indigo">{formatCurrency(entry.amount)}</p>
    </div>
  </div>
);

const GC_STATUS_STYLES = {
  filling:         'bg-blue-50 text-blue-600',
  pending_combine: 'bg-amber-50 text-amber-700',
  combined_into:   'bg-navy/5 text-navy/60',
  expired:         'bg-red-50 text-red-600',
  active:          'bg-emerald-50 text-emerald-700',
  completed:       'bg-indigo/10 text-indigo',
};

const EntryRowGoldCoin = ({ entry }) => {
  const filled = entry.slots_held + entry.slots_won;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-yellow-100 text-yellow-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        R{entry.room_number}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-navy truncate">
          {entry.package_name}
          {entry.is_combined && (
            <span className="ml-1.5 text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full uppercase">combined</span>
          )}
        </p>
        <p className="text-[11px] text-navy/40 truncate">
          {filled + entry.slots_refunded}/16 slots ·
          {entry.slots_won > 0 ? ` ${entry.slots_won} won` : ''}
          {entry.slots_refunded > 0 ? ` ${entry.slots_refunded} refunded` : ''}
          {' · '}{entry.draws_done}/16 draws
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-bold text-amber-700">{formatCurrency(entry.collected)}</p>
        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${GC_STATUS_STYLES[entry.status] || 'bg-navy/5 text-navy/40'}`}>
          {entry.status.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
};

const LSS_STATUS_STYLES = {
  filling:         'bg-blue-50 text-blue-600',
  pending_combine: 'bg-amber-50 text-amber-700',
  combined_into:   'bg-navy/5 text-navy/60',
  expired:         'bg-red-50 text-red-600',
  active:          'bg-emerald-50 text-emerald-700',
  completed:       'bg-indigo/10 text-indigo',
};

const EntryRowLss = ({ entry }) => {
  const filled = entry.slots_held + entry.slots_won;
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
        R{entry.room_number}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-navy truncate">
          {entry.plan_name}
          {entry.is_combined && (
            <span className="ml-1.5 text-[9px] font-bold text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full uppercase">combined</span>
          )}
        </p>
        <p className="text-[11px] text-navy/40 truncate">
          {filled + entry.slots_refunded}/20 slots
          {entry.slots_won > 0 ? ` · ${entry.slots_won} won` : ''}
          {entry.slots_refunded > 0 ? ` · ${entry.slots_refunded} refunded` : ''}
          {' · '}{entry.draws_done}/20 draws
        </p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-bold text-violet-700">{formatCurrency(parseFloat(entry.collected))}</p>
        <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${LSS_STATUS_STYLES[entry.status] || 'bg-navy/5 text-navy/40'}`}>
          {entry.status.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
};

const EntryRowGeneric = ({ entry }) => (
  <div className="px-4 py-3 flex items-center justify-between">
    <p className="text-xs font-medium text-navy/60 truncate">{entry.id}</p>
    <p className="text-[10px] text-navy/30">unknown shape</p>
  </div>
);

const ENTRY_ROW_BY_CODE = {
  gold_scheme:      EntryRowGold,
  trading_academy:  EntryRowTrading,
  gold_coin_scheme: EntryRowGoldCoin,
  lss_scheme:       EntryRowLss,
};

// ─── Inline entries list (drill-down level 3) ───────────────────────────────

const BranchEntriesList = ({ schemeCode, branchId }) => {
  const { data, isLoading, error } = useGetSchemeBranchEntriesQuery(
    { code: schemeCode, branchId },
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="animate-spin text-indigo/40" size={20} aria-hidden="true" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="px-4 py-4 text-center text-xs text-red-600">
        Failed to load entries.
      </div>
    );
  }
  const entries = data?.entries ?? [];
  if (entries.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-navy/40">
        No entries in this branch for the selected period.
      </div>
    );
  }
  const Row = ENTRY_ROW_BY_CODE[schemeCode] || EntryRowGeneric;
  return (
    <div className="divide-y divide-navy/5">
      {entries.map((entry) => (
        <Row key={entry.id} entry={entry} />
      ))}
      {entries.length >= 500 && (
        <p className="px-4 py-3 text-[11px] text-navy/40 text-center">
          Showing the first 500 entries. Narrow by date to see more.
        </p>
      )}
    </div>
  );
};

// ─── Branch row inside a scheme card (drill-down level 2) ───────────────────

const BranchRow = ({ branch, schemeCode, expanded, onToggle, schemeMeta }) => {
  return (
    <div className="bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-navy/[0.02] text-left"
      >
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${schemeMeta.bg} ${schemeMeta.color}`}>
          <MapPin size={14} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{branch.branchName}</p>
          <p className="text-[11px] text-navy/40">
            {formatNumber(branch.count)} {schemeCode === 'gold_coin_scheme' || schemeCode === 'lss_scheme' ? 'slots' : schemeCode === 'gold_scheme' ? 'chits' : 'enrollments'}
            {' · '}
            commission {formatCurrency(branch.commission)}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-sm font-bold text-navy">{formatCurrency(branch.collected)}</p>
        </div>
        <ChevronRight
          size={16}
          className={`text-navy/30 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>
      {expanded && (
        <div className="border-t border-navy/5 bg-navy/[0.015]">
          <BranchEntriesList schemeCode={schemeCode} branchId={branch.branchId} />
        </div>
      )}
    </div>
  );
};

// ─── Scheme card (drill-down level 1) ───────────────────────────────────────

const SchemeCard = ({ scheme, expanded, onToggle, expandedBranchId, onToggleBranch }) => {
  const meta = SOURCE_META[scheme.schemeCode] ?? SOURCE_META.scheme;
  const Icon = meta.Icon;
  const { totals, byBranch } = scheme;

  return (
    <div className="rounded-3xl overflow-hidden card-shadow border border-navy/5 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className={`w-full px-4 py-4 flex items-center gap-3 text-left ${meta.bg}`}
      >
        <div className={`w-11 h-11 rounded-2xl bg-white/60 flex items-center justify-center flex-shrink-0 ${meta.color}`}>
          <Icon size={20} aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${meta.color} truncate`}>{scheme.schemeName}</p>
          <p className="text-[11px] font-medium text-navy/50">
            {formatNumber(totals.count)} entries · {formatNumber(totals.branchCount)} branch{totals.branchCount === 1 ? '' : 'es'}
          </p>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-base font-bold text-navy">{formatCurrency(totals.collected)}</p>
          <p className="text-[10px] font-semibold text-emerald-700">+{formatCurrency(totals.commission)} comm.</p>
        </div>
        <ChevronRight
          size={18}
          className={`${meta.color} flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="border-t border-navy/5">
          {byBranch.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-navy/40">
              No activity in any branch yet.
            </div>
          ) : (
            <div className="divide-y divide-navy/5">
              {byBranch.map((branch) => (
                <BranchRow
                  key={branch.branchId}
                  schemeCode={scheme.schemeCode}
                  schemeMeta={meta}
                  branch={branch}
                  expanded={expandedBranchId === branch.branchId}
                  onToggle={() => onToggleBranch(branch.branchId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Page ───────────────────────────────────────────────────────────────────

export const SchemesOverviewPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canView = VIEWER_ROLES.has(user?.role);

  const [expandedScheme, setExpandedScheme] = useState(null);
  const [expandedBranch, setExpandedBranch] = useState(null);

  const { data, isLoading, isFetching } = useGetSchemesOverviewQuery(
    undefined,
    { skip: !canView },
  );

  // Memoise so the [] literal doesn't churn dependencies on every render.
  const schemes = useMemo(() => data?.schemes ?? [], [data]);

  const headlineTotals = useMemo(() => {
    let collected = 0, commission = 0, entries = 0;
    for (const s of schemes) {
      collected += s.totals.collected;
      commission += s.totals.commission;
      entries += s.totals.count;
    }
    return { collected, commission, entries };
  }, [schemes]);

  const toggleScheme = (code) => {
    setExpandedScheme((prev) => (prev === code ? null : code));
    setExpandedBranch(null);
  };
  const toggleBranch = (branchId) => {
    setExpandedBranch((prev) => (prev === branchId ? null : branchId));
  };

  if (!canView) return <AccessDenied />;

  return (
    <div className="pb-32 pt-4">
      <div className="px-6 mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-navy tracking-tight">Schemes</h2>
          <p className="text-xs font-medium text-navy/40 mt-1">
            Collections across every branch and scheme
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/money/incentives')}
          className="px-3 py-2 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-[11px] font-bold tactile-press flex items-center gap-1.5"
        >
          <Sparkles size={14} aria-hidden="true" />
          Wallet
        </button>
      </div>

      {/* Headline totals strip */}
      <div className="px-4 mb-6">
        <div className="rounded-3xl p-4 card-shadow border border-navy/5 bg-gradient-to-br from-indigo/5 to-indigo/[0.02] flex items-center gap-2 overflow-x-auto scrollbar-none">
          <StatBlock
            label="Collected"
            value={formatCurrency(headlineTotals.collected)}
            tone="navy"
            icon={<Wallet size={11} className="text-navy/40" aria-hidden="true" />}
          />
          <StatBlock
            label="Commission"
            value={formatCurrency(headlineTotals.commission)}
            tone="emerald"
            icon={<Trophy size={11} className="text-emerald-600" aria-hidden="true" />}
          />
          <StatBlock
            label="Entries"
            value={formatNumber(headlineTotals.entries)}
            tone="indigo"
            icon={<Layers size={11} className="text-indigo" aria-hidden="true" />}
          />
        </div>
      </div>

      {/* Schemes list */}
      <div className="px-4 mb-10">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
          </div>
        ) : schemes.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 card-shadow border border-navy/5 text-center">
            <CircleSlash size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No scheme activity</p>
            <p className="text-xs text-navy/40 mt-1">No collected money or commissions across any scheme yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {isFetching && (
              <p className="text-[11px] font-medium text-navy/40 flex items-center gap-1.5">
                <Loader2 className="animate-spin" size={10} aria-hidden="true" />
                Refreshing…
              </p>
            )}
            {schemes.map((scheme) => (
              <SchemeCard
                key={scheme.schemeCode}
                scheme={scheme}
                expanded={expandedScheme === scheme.schemeCode}
                onToggle={() => toggleScheme(scheme.schemeCode)}
                expandedBranchId={expandedScheme === scheme.schemeCode ? expandedBranch : null}
                onToggleBranch={toggleBranch}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint — links to per-scheme drill pages */}
      <div className="px-4 mb-8">
        <div className="bg-white rounded-2xl p-4 border border-navy/5 card-shadow flex items-start gap-3">
          <Calendar size={16} className="text-navy/40 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-bold text-navy">Need scheme-specific tools?</p>
            <p className="text-[11px] text-navy/50 mt-0.5">
              Open the individual scheme pages from <button type="button" onClick={() => navigate('/money/schemes')} className="text-indigo font-semibold underline-offset-2 hover:underline">Money → Schemes</button> to sell slots, mark payments, or run draws.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemesOverviewPage;
