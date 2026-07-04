import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Calendar, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, ArrowLeft, ShieldCheck,
  Pencil, X, Save, AlertCircle, Search, Building2,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetReconciliationOverviewQuery,
  useGetBranchReconciliationQuery,
  useUpdateDailyCollectionSummaryMutation,
  useSubmitDailyCollectionSummaryMutation,
} from '../store/api/apiSlice';
import { formatCurrency } from '../lib/formatters';
import { getISTToday } from '../lib/date';
import { SOURCE_META, NAVIGABLE_SCHEMES } from '../lib/schemeConstants';

const VIEWER_ROLES   = new Set(['md', 'director', 'management']);
const CAN_EDIT_ROLES = new Set(['management']);
const SCHEME_CODES   = Object.keys(NAVIGABLE_SCHEMES);

// ─── Status config ────────────────────────────────────────────────────────────

const BRANCH_STATUS = {
  reconciled:    { label: 'Reconciled', badge: 'text-emerald-700 bg-emerald-50 border border-emerald-200', Icon: CheckCircle2, iconCls: 'text-emerald-500', dot: 'bg-emerald-400' },
  mismatch:      { label: 'Mismatch',   badge: 'text-amber-700  bg-amber-50  border border-amber-200',    Icon: AlertTriangle, iconCls: 'text-amber-500',  dot: 'bg-amber-400'   },
  not_submitted: { label: 'Not Filed',  badge: 'text-navy/50    bg-navy/5    border border-navy/10',       Icon: XCircle,       iconCls: 'text-navy/30',    dot: 'bg-navy/20'     },
};

const SCHEME_STATUS = {
  completed: { label: 'Done',    cls: 'text-emerald-600 bg-emerald-50' },
  exceeded:  { label: 'Over',    cls: 'text-amber-700  bg-amber-50'   },
  pending:   { label: 'Pending', cls: 'text-navy/50    bg-navy/5'     },
};

const FILTERS = [
  { key: 'all',        label: 'All'        },
  { key: 'mismatch',   label: 'Mismatch'   },
  { key: 'not_filed',  label: 'Not Filed'  },
  { key: 'reconciled', label: 'Reconciled' },
];

// ─── Edit modal (bottom sheet) ────────────────────────────────────────────────
// Opens directly from the branch card header — no need to expand first.

const EditBranchModal = ({ branch, businessDate, onClose }) => {
  const [updateSummary, { isLoading: savingUpdate }] = useUpdateDailyCollectionSummaryMutation();
  const [submitSummary, { isLoading: savingSubmit }] = useSubmitDailyCollectionSummaryMutation();
  const saving = savingUpdate || savingSubmit;
  const isNew  = !branch.summaryId; // no summary filed yet — management will create one

  // Fetch current declared lines for pre-fill (empty array when not yet filed)
  const { data: lines = [], isLoading: loadingLines } = useGetBranchReconciliationQuery({
    branchId: branch.branchId,
    businessDate,
  });

  const [amounts, setAmounts] = useState(null); // null = waiting for lines to load
  const [error, setError] = useState('');

  // Initialise amounts once lines have loaded (only once)
  if (amounts === null && !loadingLines) {
    const init = Object.fromEntries(SCHEME_CODES.map(c => [c, '']));
    for (const line of lines) {
      if (line.expected > 0) init[line.schemeCode] = String(line.expected);
    }
    setAmounts(init);
  }

  const handleSave = async () => {
    setError('');
    try {
      const payload = SCHEME_CODES.map(code => ({
        schemeCode:     code,
        expectedAmount: parseFloat(amounts?.[code]) || 0,
      }));
      if (isNew) {
        // Management filing on behalf of a branch that hasn't submitted yet
        await submitSummary({ branchId: branch.branchId, lines: payload }).unwrap();
      } else {
        await updateSummary({ id: branch.summaryId, branchId: branch.branchId, lines: payload }).unwrap();
      }
      onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save. Please try again.');
    }
  };

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(11,28,48,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Sheet */}
      <div className="bg-white rounded-t-3xl w-full max-h-[88vh] flex flex-col">
        {/* Handle + header */}
        <div className="px-6 pt-4 pb-3 border-b border-border flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-navy/15 mx-auto mb-4" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo/10 flex items-center justify-center flex-shrink-0">
                <Pencil size={16} className="text-indigo" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-bold text-navy">
                  {isNew ? 'Set Expected Amounts' : 'Edit Expected Amounts'}
                </p>
                <p className="text-[11px] font-medium text-navy/40 truncate max-w-[200px]">{branch.branchName}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-navy/5 flex items-center justify-center text-navy/40 tactile-press"
              aria-label="Close"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Scheme inputs */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {loadingLines || amounts === null ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin text-indigo" size={22} aria-hidden="true" />
            </div>
          ) : (
            SCHEME_CODES.map(code => {
              const meta = SOURCE_META[code] ?? SOURCE_META.scheme;
              const Icon = meta.Icon;
              const current = lines.find(l => l.schemeCode === code);
              return (
                <div
                  key={code}
                  className="flex items-center gap-3 bg-navy/[0.02] rounded-2xl px-4 py-3 border border-border"
                >
                  <div className={`w-9 h-9 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} className={meta.color} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-navy truncate">{meta.label}</p>
                    {current?.collected > 0 && (
                      <p className="text-[10px] font-medium text-navy/40 mt-0.5">
                        Collected so far: {formatCurrency(current.collected)}
                      </p>
                    )}
                  </div>
                  <div className="relative w-32 flex-shrink-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-navy/30 pointer-events-none">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0"
                      value={amounts[code]}
                      onChange={e => setAmounts(p => ({ ...p, [code]: e.target.value }))}
                      className="w-full pl-7 pr-3 py-2.5 bg-white rounded-xl border border-navy/10 text-sm font-bold text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/20"
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-8 pt-3 border-t border-border flex-shrink-0">
          {error && (
            <div className="flex items-center gap-2 text-red-600 mb-3">
              <AlertCircle size={13} aria-hidden="true" />
              <p className="text-xs font-medium">{error}</p>
            </div>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || amounts === null}
              className="flex-1 py-3.5 rounded-2xl bg-indigo text-white text-sm font-bold tactile-press disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving
                ? <><Loader2 size={15} className="animate-spin" aria-hidden="true" />Saving…</>
                : <><Save size={15} aria-hidden="true" />Save Changes</>}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3.5 rounded-2xl bg-navy/5 text-navy/60 text-sm font-bold tactile-press"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Per-branch scheme breakdown (expanded view) ──────────────────────────────

const BranchSchemeDetail = ({ branchId, businessDate }) => {
  const { data, isLoading } = useGetBranchReconciliationQuery({ branchId, businessDate });
  const lines = data ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-5">
        <Loader2 className="animate-spin text-indigo" size={16} aria-hidden="true" />
      </div>
    );
  }
  if (lines.length === 0) {
    return <p className="px-4 py-4 text-xs text-navy/40 text-center">No declared lines for this date.</p>;
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {lines.map(row => {
        const chip = SCHEME_STATUS[row.status] ?? SCHEME_STATUS.pending;
        const pct  = Math.min(row.percent ?? 0, 100);
        return (
          <div key={row.schemeCode} className="bg-navy/[0.025] rounded-xl p-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <p className="text-[11px] font-bold text-navy truncate flex-1">{row.schemeName}</p>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>
                {chip.label}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1 bg-navy/8 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${row.status === 'exceeded' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[9px] font-medium text-navy/40 w-7 text-right tabular-nums">{Math.round(pct)}%</span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] font-medium text-navy/50">
              <span>Exp <b className="text-navy tabular-nums">{formatCurrency(row.expected)}</b></span>
              <span>Got <b className="text-navy tabular-nums">{formatCurrency(row.collected)}</b></span>
              {row.remaining > 0 && <span>Left <b className="text-red-500 tabular-nums">{formatCurrency(row.remaining)}</b></span>}
              {row.status === 'exceeded' && <span>Over <b className="text-amber-600 tabular-nums">{formatCurrency(row.collected - row.expected)}</b></span>}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Branch card ──────────────────────────────────────────────────────────────

const BranchCard = ({ branch, businessDate, canEdit, onEdit }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg  = BRANCH_STATUS[branch.status] ?? BRANCH_STATUS.not_submitted;
  const Icon = cfg.Icon;

  const diff = branch.totalDifference;
  const diffText = branch.summarySubmitted
    ? (Math.abs(diff) < 0.005 ? 'Balanced' : `${diff > 0 ? '+' : ''}${formatCurrency(diff)}`)
    : null;
  const diffCls = diff > 0.005 ? 'text-amber-600' : diff < -0.005 ? 'text-red-500' : 'text-emerald-600';

  return (
    <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
      {/* Top accent */}
      <div className={`h-0.5 ${cfg.dot}`} />

      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Status icon */}
        <div className="w-9 h-9 rounded-xl bg-navy/5 flex items-center justify-center flex-shrink-0">
          <Icon size={17} className={cfg.iconCls} aria-hidden="true" />
        </div>

        {/* Branch info — tappable to expand detail */}
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-sm font-bold text-navy truncate">{branch.branchName}</p>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">
            {!branch.summarySubmitted
              ? 'No summary filed'
              : branch.mismatchedSchemes > 0
                ? `${branch.mismatchedSchemes} scheme${branch.mismatchedSchemes > 1 ? 's' : ''} off`
                : 'All schemes balanced'}
            {diffText && (
              <span className={`ml-1 font-bold ${diffCls}`}> · {diffText}</span>
            )}
          </p>
        </button>

        {/* Right: status badge + edit button (management) + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap ${cfg.badge}`}>
            {cfg.label}
          </span>

          {/* One-tap edit — management can set or edit expected amounts on any branch */}
          {canEdit && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onEdit(branch); }}
              className="w-7 h-7 rounded-lg bg-indigo/8 flex items-center justify-center text-indigo tactile-press"
              aria-label={`Edit expected amounts for ${branch.branchName}`}
            >
              <Pencil size={12} aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setExpanded(x => !x)}
            className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center tactile-press"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded
              ? <ChevronUp  size={13} className="text-navy/40" aria-hidden="true" />
              : <ChevronDown size={13} className="text-navy/40" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-navy/[0.005]">
          <BranchSchemeDetail
            branchId={branch.branchId}
            businessDate={businessDate}
          />
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ReconciliationDashboardPage = () => {
  const user    = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canView  = VIEWER_ROLES.has(user?.role);
  const canEdit  = CAN_EDIT_ROLES.has(user?.role);

  const [businessDate, setBusinessDate] = useState(getISTToday);
  const [filter, setFilter]             = useState('all');
  const [search, setSearch]             = useState('');
  const [editingBranch, setEditingBranch] = useState(null); // branch object or null

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
    if (filter === 'mismatch'   && b.status !== 'mismatch')      return false;
    if (filter === 'not_filed'  && b.status !== 'not_submitted') return false;
    if (filter === 'reconciled' && b.status !== 'reconciled')    return false;
    if (searchTerm) return b.branchName.toLowerCase().includes(searchTerm);
    return true;
  });

  const filterCounts = {
    all:        stats.total,
    mismatch:   stats.mismatch,
    not_filed:  stats.notFiled,
    reconciled: stats.reconciled,
  };

  if (!canView) {
    return (
      <div className="px-6 pt-16 text-center">
        <div className="bg-white rounded-2xl p-8 border border-border card-shadow">
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
          className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press flex-shrink-0"
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

      {/* Date + search in one row */}
      <div className="px-6 mb-4 flex gap-3">
        <div className="flex items-center gap-2 bg-white rounded-2xl border border-border card-shadow px-4 py-3 flex-shrink-0">
          <Calendar size={14} className="text-navy/40 flex-shrink-0" aria-hidden="true" />
          <input
            type="date"
            value={businessDate}
            onChange={e => setBusinessDate(e.target.value)}
            className="text-sm font-bold text-navy bg-transparent outline-none w-[130px]"
          />
        </div>
        <div className="flex-1 flex items-center gap-2 bg-white rounded-2xl border border-border card-shadow px-4 py-3">
          <Search size={14} className="text-navy/30 flex-shrink-0" aria-hidden="true" />
          <input
            type="text"
            placeholder="Search branch…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 text-sm font-medium text-navy bg-transparent outline-none placeholder:text-navy/25"
          />
          {search && (
            <button type="button" onClick={() => setSearch('')} className="text-navy/30 tactile-press">
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="px-6 mb-4">
        <div className="bg-gradient-to-br from-indigo/5 to-indigo/[0.02] rounded-3xl p-4 border border-border card-shadow grid grid-cols-4 gap-2">
          {[
            { label: 'Branches',   value: stats.total,      cls: 'text-navy'        },
            { label: 'Filed',      value: stats.submitted,  cls: 'text-navy'        },
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
      <div className="px-6 mb-5 flex gap-2 overflow-x-auto scrollbar-none">
        {FILTERS.map(f => {
          const count  = filterCounts[f.key];
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold tactile-press whitespace-nowrap transition-all ${
                active ? 'bg-navy text-white shadow-sm' : 'bg-white text-navy/50 border border-border card-shadow'
              }`}
            >
              {f.label}
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
                active ? 'bg-white/20 text-white' : 'bg-navy/8 text-navy/40'
              }`}>
                {count}
              </span>
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
          <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
            <Building2 size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">
              {filter === 'mismatch'   ? 'No mismatches — all filed branches are reconciled'  :
               filter === 'not_filed'  ? 'All branches have filed their summary'               :
               filter === 'reconciled' ? 'No reconciled branches yet for this date'            :
               'No branches found'}
            </p>
          </div>
        ) : (
          visibleBranches.map(branch => (
            <BranchCard
              key={branch.branchId}
              branch={branch}
              businessDate={businessDate}
              canEdit={canEdit}
              onEdit={setEditingBranch}
            />
          ))
        )}
      </div>

      {/* Edit bottom sheet */}
      {editingBranch && (
        <EditBranchModal
          branch={editingBranch}
          businessDate={businessDate}
          onClose={() => setEditingBranch(null)}
        />
      )}
    </div>
  );
};

export default ReconciliationDashboardPage;
