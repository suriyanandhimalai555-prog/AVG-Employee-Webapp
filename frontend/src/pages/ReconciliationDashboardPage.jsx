import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Calendar, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Building2, ArrowLeft, ShieldCheck,
  Pencil, X, Save, AlertCircle, Search,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetReconciliationOverviewQuery,
  useGetBranchReconciliationQuery,
  useUpdateDailyCollectionSummaryMutation,
} from '../store/api/apiSlice';
import { formatCurrency } from '../lib/formatters';
import { getISTToday } from '../lib/date';
import { SOURCE_META, NAVIGABLE_SCHEMES } from '../lib/schemeConstants';

const VIEWER_ROLES    = new Set(['md', 'director', 'management']);
const CAN_EDIT_ROLES  = new Set(['management']);
const SCHEME_CODES    = Object.keys(NAVIGABLE_SCHEMES);

// ─── Status config ────────────────────────────────────────────────────────────

const BRANCH_STATUS = {
  reconciled:    { label: 'Reconciled', cls: 'text-emerald-600 bg-emerald-50 border border-emerald-200', Icon: CheckCircle2, iconCls: 'text-emerald-500' },
  mismatch:      { label: 'Mismatch',   cls: 'text-amber-700  bg-amber-50  border border-amber-200',    Icon: AlertTriangle, iconCls: 'text-amber-500'  },
  not_submitted: { label: 'Not Filed',  cls: 'text-navy/50    bg-navy/5    border border-navy/10',       Icon: XCircle,       iconCls: 'text-navy/30'    },
};

const SCHEME_STATUS = {
  completed: { label: 'Done',    cls: 'text-emerald-600 bg-emerald-50' },
  exceeded:  { label: 'Over',    cls: 'text-amber-700  bg-amber-50'  },
  pending:   { label: 'Pending', cls: 'text-navy/50    bg-navy/5'    },
};

// ─── Inline edit form (management only) ──────────────────────────────────────

const EditSummaryForm = ({ summaryId, branchId, existingLines, onDone, onCancel }) => {
  const [updateSummary, { isLoading: saving }] = useUpdateDailyCollectionSummaryMutation();

  // Pre-fill from existing declared amounts; unknown codes default to ''
  const [amounts, setAmounts] = useState(() => {
    const map = Object.fromEntries(SCHEME_CODES.map(c => [c, '']));
    for (const line of existingLines) {
      if (line.expected > 0) map[line.schemeCode] = String(line.expected);
    }
    return map;
  });
  const [error, setError] = useState('');

  const handleSave = async () => {
    setError('');
    try {
      const lines = SCHEME_CODES.map(code => ({
        schemeCode:     code,
        expectedAmount: parseFloat(amounts[code]) || 0,
      }));
      await updateSummary({ id: summaryId, branchId, lines }).unwrap();
      onDone();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save. Please try again.');
    }
  };

  return (
    <div className="border-t border-navy/5 bg-navy/[0.01]">
      <div className="px-4 pt-3 pb-1 flex items-center justify-between">
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest">Edit Expected Amounts</p>
        <button type="button" onClick={onCancel} className="text-navy/30 tactile-press">
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 pb-3 space-y-2">
        {SCHEME_CODES.map(code => {
          const meta = SOURCE_META[code] ?? SOURCE_META.scheme;
          const Icon = meta.Icon;
          return (
            <div key={code} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={13} className={meta.color} aria-hidden="true" />
              </div>
              <p className="text-[11px] font-bold text-navy flex-1 truncate">{meta.label}</p>
              <div className="relative w-32 flex-shrink-0">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-navy/40 pointer-events-none">₹</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                  value={amounts[code]}
                  onChange={e => setAmounts(p => ({ ...p, [code]: e.target.value }))}
                  className="w-full pl-6 pr-2 py-1.5 bg-white rounded-xl border border-navy/10 text-xs font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30"
                />
              </div>
            </div>
          );
        })}
      </div>

      {error && (
        <div className="px-4 mb-2 flex items-center gap-2 text-red-600">
          <AlertCircle size={12} aria-hidden="true" />
          <p className="text-[11px] font-medium">{error}</p>
        </div>
      )}

      <div className="px-4 pb-4 flex gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-indigo text-white text-xs font-bold tactile-press disabled:opacity-60 flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Save size={13} aria-hidden="true" />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ─── Per-branch scheme breakdown ─────────────────────────────────────────────

const BranchSchemeDetail = ({ branchId, businessDate, summaryId, canEdit }) => {
  const [editing, setEditing] = useState(false);
  // transformResponse strips wrapper — data is already ReconciliationLine[]
  const { data, isLoading, refetch } = useGetBranchReconciliationQuery({ branchId, businessDate });
  const lines = data ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="animate-spin text-indigo" size={16} aria-hidden="true" />
      </div>
    );
  }

  if (editing && summaryId) {
    return (
      <EditSummaryForm
        summaryId={summaryId}
        branchId={branchId}
        existingLines={lines}
        onDone={() => { setEditing(false); refetch(); }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <>
      {lines.length === 0 ? (
        <p className="px-4 py-4 text-xs text-navy/40">No declared lines for this date.</p>
      ) : (
        <div className="px-4 pb-2 space-y-2 pt-2">
          {lines.map(row => {
            const chip = SCHEME_STATUS[row.status] ?? SCHEME_STATUS.pending;
            const pct  = Math.min(row.percent ?? 0, 100);
            return (
              <div key={row.schemeCode} className="bg-navy/[0.02] rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <p className="text-[11px] font-bold text-navy truncate flex-1">{row.schemeName}</p>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>
                    {chip.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="flex-1 h-1 bg-navy/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${row.status === 'exceeded' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-medium text-navy/40 w-7 text-right">{Math.round(row.percent ?? 0)}%</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-medium text-navy/60">
                  <span>Expected: <b className="text-navy">{formatCurrency(row.expected)}</b></span>
                  <span>Collected: <b className="text-navy">{formatCurrency(row.collected)}</b></span>
                  {row.remaining > 0 && <span>Remaining: <b className="text-red-500">{formatCurrency(row.remaining)}</b></span>}
                  {row.status === 'exceeded' && <span>Excess: <b className="text-amber-600">{formatCurrency(row.collected - row.expected)}</b></span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit button — management only, only when a summary was filed */}
      {canEdit && summaryId && (
        <div className="px-4 pb-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-indigo/20 text-indigo text-xs font-bold tactile-press bg-indigo/5"
          >
            <Pencil size={12} aria-hidden="true" />
            Edit Expected Amounts
          </button>
        </div>
      )}
    </>
  );
};

// ─── Branch row ───────────────────────────────────────────────────────────────

const BranchRow = ({ branch, businessDate, canEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const style = BRANCH_STATUS[branch.status] ?? BRANCH_STATUS.not_submitted;
  const Icon  = style.Icon;

  const diffLabel = branch.summarySubmitted
    ? `${branch.totalDifference >= 0 ? '+' : ''}${formatCurrency(branch.totalDifference)}`
    : null;

  return (
    <div className="bg-white rounded-2xl border border-navy/8 card-shadow overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(x => !x)}
        className="w-full flex items-center gap-3 p-4 text-left tactile-press"
      >
        <div className="w-9 h-9 rounded-xl bg-navy/5 flex items-center justify-center flex-shrink-0">
          <Icon size={18} className={style.iconCls} aria-hidden="true" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{branch.branchName}</p>
          <p className="text-[11px] font-medium text-navy/50 mt-0.5">
            {!branch.summarySubmitted
              ? 'No summary filed'
              : branch.mismatchedSchemes > 0
                ? `${branch.mismatchedSchemes} scheme${branch.mismatchedSchemes > 1 ? 's' : ''} off`
                : 'All balanced'}
            {diffLabel && ` · ${diffLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${style.cls}`}>
            {style.label}
          </span>
          {expanded
            ? <ChevronUp  size={14} className="text-navy/40" aria-hidden="true" />
            : <ChevronDown size={14} className="text-navy/40" aria-hidden="true" />}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-navy/5">
          <BranchSchemeDetail
            branchId={branch.branchId}
            businessDate={businessDate}
            summaryId={branch.summaryId}
            canEdit={canEdit}
          />
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const FILTERS = [
  { key: 'all',          label: 'All' },
  { key: 'mismatch',     label: 'Mismatch' },
  { key: 'not_filed',    label: 'Not Filed' },
  { key: 'reconciled',   label: 'Reconciled' },
];

export const ReconciliationDashboardPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canView  = VIEWER_ROLES.has(user?.role);
  const canEdit  = CAN_EDIT_ROLES.has(user?.role);

  const [businessDate, setBusinessDate] = useState(getISTToday);
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');

  // transformResponse strips the wrapper — data is already BranchOverview[]
  const { data, isLoading, isFetching } = useGetReconciliationOverviewQuery(
    businessDate,
    { skip: !canView }
  );
  const branches = data ?? [];

  const stats = {
    total:      branches.length,
    submitted:  branches.filter(b => b.summarySubmitted).length,
    reconciled: branches.filter(b => b.status === 'reconciled').length,
    mismatch:   branches.filter(b => b.status === 'mismatch').length,
    notFiled:   branches.filter(b => b.status === 'not_submitted').length,
  };

  const searchTerm = search.trim().toLowerCase();
  const visibleBranches = branches.filter(b => {
    if (filter === 'mismatch')   { if (b.status !== 'mismatch')     return false; }
    if (filter === 'not_filed')  { if (b.status !== 'not_submitted') return false; }
    if (filter === 'reconciled') { if (b.status !== 'reconciled')    return false; }
    if (searchTerm) return b.branchName.toLowerCase().includes(searchTerm);
    return true;
  });

  if (!canView) {
    return (
      <div className="px-6 pt-16 text-center">
        <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow">
          <ShieldCheck size={32} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-bold text-navy">Access denied</p>
          <p className="text-xs text-navy/40 mt-1">Only MD, Director, or Management can view this dashboard.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4">

      {/* Header */}
      <div className="px-6 mb-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press"
          aria-label="Go back"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-navy tracking-tight">Collection Reconciliation</h2>
          <p className="text-xs font-medium text-navy/40 mt-0.5">Daily declared-vs-actual per branch</p>
        </div>
        {isFetching && !isLoading && (
          <Loader2 size={16} className="animate-spin text-indigo flex-shrink-0" aria-hidden="true" />
        )}
      </div>

      {/* Date picker */}
      <div className="px-6 mb-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-navy/8 card-shadow px-4 py-3">
          <Calendar size={16} className="text-navy/40 flex-shrink-0" aria-hidden="true" />
          <input
            type="date"
            value={businessDate}
            onChange={e => setBusinessDate(e.target.value)}
            className="flex-1 text-sm font-bold text-navy bg-transparent outline-none"
          />
        </div>
      </div>

      {/* Search bar */}
      <div className="px-6 mb-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl border border-navy/8 card-shadow px-4 py-3">
          <Search size={16} className="text-navy/30 flex-shrink-0" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm font-medium text-navy bg-transparent outline-none placeholder:text-navy/30"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-navy/30 tactile-press">
              <X size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-6 mb-4">
        <div className="bg-gradient-to-br from-indigo/5 to-indigo/[0.02] rounded-3xl p-4 border border-navy/5 card-shadow grid grid-cols-4 gap-2">
          {[
            { label: 'Branches',   value: stats.total,      cls: 'text-navy' },
            { label: 'Filed',      value: stats.submitted,  cls: 'text-navy' },
            { label: 'OK',         value: stats.reconciled, cls: 'text-emerald-600' },
            { label: 'Issues',     value: stats.mismatch + stats.notFiled, cls: 'text-amber-700' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="text-center">
              <p className={`text-xl font-bold ${cls}`}>{value}</p>
              <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="px-6 mb-4 flex gap-2 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => {
          const counts = {
            all:        stats.total,
            mismatch:   stats.mismatch,
            not_filed:  stats.notFiled,
            reconciled: stats.reconciled,
          };
          const count = counts[f.key];
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold tactile-press transition-colors whitespace-nowrap ${
                active ? 'bg-navy text-white' : 'bg-white text-navy/50 border border-navy/8 card-shadow'
              }`}
            >
              {f.label}
              {count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold ${
                  active ? 'bg-white/20 text-white' : 'bg-navy/8 text-navy/50'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Branch list */}
      <div className="px-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
          </div>
        ) : visibleBranches.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <Building2 size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">
              {filter === 'mismatch'  ? 'No mismatches — all filed branches are reconciled' :
               filter === 'not_filed' ? 'All branches have filed their summary' :
               filter === 'reconciled'? 'No reconciled branches yet for this date' :
               'No branches found'}
            </p>
          </div>
        ) : (
          visibleBranches.map(branch => (
            <BranchRow
              key={branch.branchId}
              branch={branch}
              businessDate={businessDate}
              canEdit={canEdit}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default ReconciliationDashboardPage;
