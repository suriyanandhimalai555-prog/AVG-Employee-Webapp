import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Calendar, CheckCircle2, AlertTriangle, XCircle,
  ChevronDown, ChevronUp, Building2, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetReconciliationOverviewQuery,
  useGetBranchReconciliationQuery,
} from '../store/api/apiSlice';
import { formatCurrency } from '../lib/formatters';
import { getISTToday } from '../lib/date';

const VIEWER_ROLES = new Set(['md', 'director', 'management']);

const BRANCH_STATUS = {
  reconciled:    { label: 'Reconciled', cls: 'text-emerald-600 bg-emerald-50 border border-emerald-200', Icon: CheckCircle2, iconCls: 'text-emerald-500' },
  mismatch:      { label: 'Mismatch',   cls: 'text-amber-700 bg-amber-50 border border-amber-200',     Icon: AlertTriangle, iconCls: 'text-amber-500' },
  not_submitted: { label: 'Not Filed',  cls: 'text-navy/50 bg-navy/5 border border-navy/10',            Icon: XCircle,       iconCls: 'text-navy/30' },
};

const SCHEME_STATUS = {
  completed: { label: 'Done',    cls: 'text-emerald-600 bg-emerald-50' },
  exceeded:  { label: 'Over',    cls: 'text-amber-700 bg-amber-50' },
  pending:   { label: 'Pending', cls: 'text-navy/50 bg-navy/5' },
};

// ─── Per-branch scheme breakdown (shown when expanded) ──────────────────────

const BranchSchemeDetail = ({ branchId, businessDate }) => {
  // transformResponse strips the wrapper — data is already ReconciliationLine[]
  const { data, isLoading } = useGetBranchReconciliationQuery({ branchId, businessDate });
  const lines = data ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="animate-spin text-indigo" size={16} aria-hidden="true" />
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <p className="px-4 py-4 text-xs text-navy/40">No declared lines for this date.</p>
    );
  }

  return (
    <div className="px-4 pb-3 space-y-2">
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
              {row.remaining > 0 && (
                <span>Remaining: <b className="text-red-500">{formatCurrency(row.remaining)}</b></span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Branch row with expand / collapse ───────────────────────────────────────

const BranchRow = ({ branch, businessDate }) => {
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
          <BranchSchemeDetail branchId={branch.branchId} businessDate={businessDate} />
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const ReconciliationDashboardPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canView  = VIEWER_ROLES.has(user?.role);

  const [businessDate, setBusinessDate] = useState(getISTToday);

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
  };

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
      <div className="px-6 mb-5">
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

      {/* Summary strip */}
      <div className="px-6 mb-5">
        <div className="bg-gradient-to-br from-indigo/5 to-indigo/[0.02] rounded-3xl p-4 border border-navy/5 card-shadow grid grid-cols-4 gap-2">
          {[
            { label: 'Branches',   value: stats.total,      cls: 'text-navy' },
            { label: 'Filed',      value: stats.submitted,  cls: 'text-navy' },
            { label: 'Reconciled', value: stats.reconciled, cls: 'text-emerald-600' },
            { label: 'Mismatch',   value: stats.mismatch,   cls: 'text-amber-700' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="text-center">
              <p className={`text-xl font-bold ${cls}`}>{value}</p>
              <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Branch list */}
      <div className="px-6 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
          </div>
        ) : branches.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <Building2 size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No branches found</p>
          </div>
        ) : (
          branches.map(branch => (
            <BranchRow key={branch.branchId} branch={branch} businessDate={businessDate} />
          ))
        )}
      </div>
    </div>
  );
};

export default ReconciliationDashboardPage;
