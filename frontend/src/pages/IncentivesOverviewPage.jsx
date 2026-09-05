import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  Loader2, ChevronRight, ChevronLeft, Building2, Users, Award,
  IndianRupee, CircleSlash, Download, TrendingUp,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetBranchIncentiveRollupQuery,
  useGetBranchPeopleIncentivesQuery,
  useGetEmployeeIncentiveDetailQuery,
  useGetBranchesQuery,
} from '../store/api/apiSlice';
import { SchemeCalendar } from '../components/SchemeCalendar';
import { getCurrentPeriod, getPeriodForDate } from '../lib/schemePeriod';
import { formatCurrency } from '../lib/formatters';

// Friendly label per backend role string.
const ROLE_LABEL = {
  sales_officer:  'Sales Officer',
  abm:            'ABM',
  branch_manager: 'Branch Manager',
  gm:             'GM',
  branch_admin:   'Branch Admin',
  director:       'Director',
  md:             'MD',
  management:     'Management',
};

// Friendly label for source_type / payment_event combinations.
const eventLabel = (row) => {
  if (row.payment_event === 'enrollment') return 'Enrollment';
  if (row.payment_event === 'renewal')    return 'Renewal';
  if (row.payment_event === 'monthly')    return 'Monthly';
  return row.source_type ?? '—';
};

// Muted currency — renders ₹0 dimmed, positive amounts normally.
const Amt = ({ value }) => (
  <span className={value === 0 ? 'text-navy/25 font-medium' : 'font-semibold text-navy tabular-nums'}>
    {formatCurrency(value)}
  </span>
);

// Download a 2-D array as a CSV file in the browser.
const downloadCsv = (rows, filename) => {
  const csv = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─── Skeleton shimmer primitives ─────────────────────────────────────────────

// Single pulsing placeholder block — base building block for all skeleton UIs.
const Shimmer = ({ width = '100%', height = 14, className = '' }) => (
  <div
    className={`bg-navy/[0.06] rounded-md animate-pulse ${className}`}
    style={{ width, height }}
  />
);

// A table-shaped skeleton that matches the exact wrapper used by the real tables
// (white card, muted header row, N body rows with varying-width shimmer cells).
// cols — number of columns; last column is right-aligned to mirror amount columns.
const SkeletonTable = ({ cols = 4 }) => {
  // Varying widths per column position so it reads like real data, not uniform blocks.
  const cellWidths = ['60%', '30%', '25%', '20%', '15%'];
  const bodyRows = [90, 75, 85, 60, 80, 70]; // % widths for the primary (first) cell

  return (
    <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
      {/* Header row */}
      <div className="bg-navy/[0.04] border-b border-border px-4 py-3 flex items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <div
            key={i}
            className={`flex-1 ${i === cols - 1 ? 'flex justify-end' : ''}`}
          >
            <Shimmer width={cellWidths[i] ?? '20%'} height={10} />
          </div>
        ))}
      </div>

      {/* Body rows */}
      <div className="divide-y divide-border">
        {bodyRows.map((primaryWidth, rowIdx) => (
          <div key={rowIdx} className="px-4 py-3 flex items-center gap-4">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <div
                key={colIdx}
                className={`flex-1 ${colIdx === cols - 1 ? 'flex justify-end' : ''}`}
              >
                {colIdx === 0
                  ? <Shimmer width={`${primaryWidth}%`} height={13} />
                  : colIdx === cols - 1
                  ? <Shimmer width="55%" height={13} />
                  : <Shimmer width={cellWidths[colIdx] ?? '30%'} height={11} />
                }
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Period helpers ───────────────────────────────────────────────────────────

// Read the period and all-time flag from URL search params.
// Falls back to the current 7-to-7 period when no params are present.
const usePeriodParams = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const allTime = searchParams.get('all') === '1';

  const period = useMemo(() => {
    const start = searchParams.get('start');
    const end   = searchParams.get('end');
    // When both are present use them; otherwise derive from the start date (or current).
    if (start && end) return getPeriodForDate(start);
    return getCurrentPeriod();
  }, [searchParams]);

  // The API date params: empty object means "all time", otherwise include start + end.
  const dateParams = allTime
    ? {}
    : { startDate: period.startDate, endDate: period.endDate };

  // Build the canonical query string for the current period/all-time state.
  const periodQs = () => {
    if (allTime) return 'all=1';
    return `start=${period.startDate}&end=${period.endDate}`;
  };

  const setPeriod = (p) => {
    setSearchParams({ start: p.startDate, end: p.endDate });
  };

  const setAllTime = (on) => {
    if (on) {
      setSearchParams({ all: '1' });
    } else {
      const p = getCurrentPeriod();
      setSearchParams({ start: p.startDate, end: p.endDate });
    }
  };

  return { period, allTime, dateParams, periodQs, setPeriod, setAllTime };
};

// ─── Level 3 — Individual incentive rows for one employee ────────────────────

const PersonDetail = ({ branchId, userId, dateParams }) => {
  const location = useLocation();
  // Display name/role from navigation state (instant), with fallback to endpoint data.
  const statePersonName = location.state?.personName;
  const statePersonRole = location.state?.personRole;

  const { data, isLoading } = useGetEmployeeIncentiveDetailQuery(
    { branchId, userId, ...dateParams },
    { skip: !branchId || !userId },
  );

  const rows = useMemo(() => data?.rows ?? [], [data]);
  const user = data?.user ?? {};

  const personName = statePersonName || user.name || '—';
  const personRole = statePersonRole || user.role || '';

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const handleExport = () => {
    downloadCsv(
      [
        ['Date', 'Scheme', 'Event', 'Description', 'Amount'],
        ...rows.map(r => [
          new Date(r.created_at).toLocaleDateString('en-IN'),
          r.scheme_code ?? r.source_type,
          eventLabel(r),
          r.source_description ?? '',
          r.amount,
        ]),
      ],
      `incentives-${personName.replace(/\s+/g, '-')}.csv`
    );
  };

  // Skeleton: summary-card placeholder + 5-column table skeleton.
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Summary card skeleton */}
        <div className="bg-white rounded-2xl border border-border card-shadow p-5 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-navy/[0.06] animate-pulse shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Shimmer width="55%" height={16} />
            <Shimmer width="30%" height={10} />
          </div>
          <div className="text-right shrink-0 space-y-2 flex flex-col items-end">
            <Shimmer width={80} height={20} />
            <Shimmer width={55} height={10} />
          </div>
        </div>
        {/* Table skeleton — 5 columns (Date, Scheme, Event, Description, Amount) */}
        <SkeletonTable cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-border card-shadow p-5 flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center shrink-0">
          <Award size={22} className="text-indigo" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-navy truncate">{personName}</p>
          <p className="text-[11px] font-semibold text-navy/40 uppercase tracking-wide mt-0.5">
            {ROLE_LABEL[personRole] ?? personRole}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-black text-indigo tabular-nums">{formatCurrency(total)}</p>
          <p className="text-[11px] text-navy/40 font-medium">{rows.length} entries</p>
        </div>
      </div>

      {/* Export */}
      {rows.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleExport}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold px-4 py-2.5 rounded-xl tactile-press transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      )}

      {/* Rows table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border card-shadow text-center">
          <CircleSlash size={28} className="text-navy/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-navy">No incentives in this period</p>
          <p className="text-[11px] text-navy/40 mt-1">Try switching to All time to see historical data.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-navy/[0.04] border-b border-border">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Date</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Scheme</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Event</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em]">Description</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-navy/[0.015] transition-colors">
                    <td className="px-4 py-3 text-navy/50 whitespace-nowrap font-medium tabular-nums">
                      {new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                        {r.scheme_code ?? r.source_type}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-navy/60">{eventLabel(r)}</td>
                    <td className="px-4 py-3 text-navy/50 max-w-[220px] truncate">{r.source_description || '—'}</td>
                    <td className="px-4 py-3 text-right font-bold text-navy tabular-nums">{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy/[0.04] border-t-2 border-navy/10">
                  <td colSpan={4} className="px-4 py-3 text-[10px] font-black text-navy/50 uppercase tracking-wider">Total</td>
                  <td className="px-4 py-3 text-right font-black text-indigo tabular-nums text-base">{formatCurrency(total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Level 2 — Employees inside one branch ────────────────────────────────────

const BranchPeople = ({ branchId, dateParams, onSelectPerson }) => {
  const location = useLocation();
  // Branch name from navigation state (instant); fall back to the branches query.
  const stateBranchName = location.state?.branchName;
  const { data: allBranches = [] } = useGetBranchesQuery();
  const resolvedBranchName = stateBranchName
    || allBranches.find(b => b.id === branchId)?.name
    || branchId;

  const [searchParams, setSearchParams] = useSearchParams();
  const onlyWithIncentives = searchParams.get('earners') === '1';
  const setOnlyWithIncentives = (on) => {
    // Preserve all existing params and just flip 'earners'.
    const next = new URLSearchParams(searchParams);
    if (on) next.set('earners', '1');
    else next.delete('earners');
    setSearchParams(next);
  };

  const { data = [], isLoading, isFetching } = useGetBranchPeopleIncentivesQuery(
    { branchId, onlyWithIncentives, ...dateParams },
    { skip: !branchId },
  );

  const total = useMemo(() => data.reduce((s, r) => s + r.total, 0), [data]);

  const handleExport = () => {
    downloadCsv(
      [
        ['Name', 'Role', 'Total (₹)', 'Entries'],
        ...data.map(r => [r.name, ROLE_LABEL[r.role] ?? r.role, r.total, r.entryCount]),
      ],
      `incentives-${resolvedBranchName.replace(/\s+/g, '-')}-people.csv`
    );
  };

  return (
    <div className="space-y-4">
      {/* Branch header */}
      <div className="bg-white rounded-2xl border border-border card-shadow p-5 flex items-center gap-4">
        <div className="w-11 h-11 rounded-2xl bg-stone-100 flex items-center justify-center shrink-0">
          <Building2 size={20} className="text-stone-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-black text-navy truncate">{resolvedBranchName}</p>
          <p className="text-[11px] font-semibold text-navy/40 uppercase tracking-wide mt-0.5">Branch</p>
        </div>
        <div className="text-right shrink-0">
          {isLoading ? (
            <div className="space-y-1.5 flex flex-col items-end">
              <Shimmer width={72} height={20} />
              <Shimmer width={50} height={10} />
            </div>
          ) : (
            <>
              <p className="text-xl font-black text-indigo tabular-nums">{formatCurrency(total)}</p>
              <p className="text-[11px] text-navy/40 font-medium">{data.length} employees</p>
            </>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white rounded-xl border border-border card-shadow px-4 py-2.5">
          <button
            type="button"
            onClick={() => setOnlyWithIncentives(false)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              !onlyWithIncentives ? 'bg-navy text-white shadow-sm' : 'text-navy/50 hover:text-navy/70'
            }`}
          >
            All employees
          </button>
          <button
            type="button"
            onClick={() => setOnlyWithIncentives(true)}
            className={`text-[12px] font-bold px-3 py-1.5 rounded-lg transition-all ${
              onlyWithIncentives ? 'bg-indigo text-white shadow-sm' : 'text-navy/50 hover:text-navy/70'
            }`}
          >
            Earners only
          </button>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-navy/30" />}
          {data.length > 0 && (
            <button
              type="button"
              onClick={handleExport}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold px-4 py-2.5 rounded-xl tactile-press transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* People table — skeleton while loading, empty-state or real table after */}
      {isLoading ? (
        <SkeletonTable cols={4} />
      ) : data.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border card-shadow text-center">
          <CircleSlash size={28} className="text-navy/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-navy">
            {onlyWithIncentives ? 'No earners in this period' : 'No employees found'}
          </p>
          <p className="text-[11px] text-navy/40 mt-1">
            {onlyWithIncentives ? 'Switch to "All employees" to see everyone.' : 'This branch has no staff records.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-navy/[0.04] border-b border-border">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em]">Employee</th>
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Role</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Entries</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Total Earned</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((person) => (
                  <tr
                    key={person.userId}
                    onClick={() => onSelectPerson(person)}
                    className="hover:bg-indigo/[0.03] cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-bold text-navy">{person.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-[11px] font-semibold text-navy/50 bg-navy/5 px-2 py-0.5 rounded-full">
                        {ROLE_LABEL[person.role] ?? person.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={person.entryCount === 0 ? 'text-navy/25 font-medium' : 'font-medium text-navy'}>
                        {person.entryCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Amt value={person.total} />
                    </td>
                    <td className="px-3 py-3 text-navy/20 group-hover:text-indigo transition-colors">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy/[0.04] border-t-2 border-navy/10">
                  <td className="px-4 py-3 text-[10px] font-black text-navy/50 uppercase tracking-wider" colSpan={3}>
                    {data.length} employees
                  </td>
                  <td className="px-4 py-3 text-right font-black text-indigo tabular-nums text-base">{formatCurrency(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Level 1 — All branches ───────────────────────────────────────────────────

const BranchesRollup = ({ dateParams, onSelectBranch }) => {
  const { data = [], isLoading, isFetching } = useGetBranchIncentiveRollupQuery(dateParams);

  const grand        = useMemo(() => data.reduce((s, r) => s + r.total, 0), [data]);
  const totalEarners = useMemo(() => data.reduce((s, r) => s + r.employeeCount, 0), [data]);

  const handleExport = () => {
    downloadCsv(
      [
        ['Branch', 'Earners', 'Total (₹)'],
        ...data.map(r => [r.branchName, r.employeeCount, r.total]),
      ],
      'incentives-branches.csv'
    );
  };

  // Skeleton: 3-card summary grid + 4-column table skeleton.
  if (isLoading) {
    return (
      <div className="space-y-4">
        {/* Summary cards skeleton */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Branches card */}
          <div className="bg-white rounded-2xl border border-border card-shadow p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Shimmer width={14} height={14} className="rounded-full" />
              <Shimmer width="50%" height={10} />
            </div>
            <Shimmer width="40%" height={24} />
          </div>
          {/* Earners card */}
          <div className="bg-white rounded-2xl border border-border card-shadow p-4 space-y-2">
            <div className="flex items-center gap-2 mb-1">
              <Shimmer width={14} height={14} className="rounded-full" />
              <Shimmer width="45%" height={10} />
            </div>
            <Shimmer width="35%" height={24} />
          </div>
          {/* Total incentives card — indigo gradient with white/20 shimmer */}
          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-indigo to-indigo/80 rounded-2xl p-4 relative overflow-hidden">
            <div className="absolute inset-0 bg-white/[0.08] animate-pulse rounded-2xl" />
            <div className="relative space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <Shimmer width={14} height={14} className="rounded-full bg-white/20" />
                <Shimmer width="55%" height={10} className="bg-white/20" />
              </div>
              <Shimmer width="60%" height={24} className="bg-white/20" />
            </div>
          </div>
        </div>

        {/* Table skeleton — 4 columns (Branch, Earners, Total Earned, arrow) */}
        <SkeletonTable cols={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Org-wide summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="bg-white rounded-2xl border border-border card-shadow p-4">
          <div className="flex items-center gap-2 mb-1">
            <Building2 size={14} className="text-navy/30" />
            <span className="text-[10px] font-black text-navy/40 uppercase tracking-wider">Branches</span>
          </div>
          <p className="text-2xl font-black text-navy">{data.length}</p>
        </div>
        <div className="bg-white rounded-2xl border border-border card-shadow p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users size={14} className="text-navy/30" />
            <span className="text-[10px] font-black text-navy/40 uppercase tracking-wider">Earners</span>
          </div>
          <p className="text-2xl font-black text-navy">{totalEarners}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-indigo to-indigo/80 rounded-2xl p-4 relative overflow-hidden">
          <div className="absolute right-3 top-3 opacity-10">
            <TrendingUp size={40} className="text-white" />
          </div>
          <div className="flex items-center gap-2 mb-1">
            <IndianRupee size={14} className="text-white/60" />
            <span className="text-[10px] font-black text-white/60 uppercase tracking-wider">Total Incentives</span>
          </div>
          <p className="text-2xl font-black text-white tabular-nums">{formatCurrency(grand)}</p>
        </div>
      </div>

      {/* Export */}
      {data.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          {isFetching && <Loader2 size={14} className="animate-spin text-navy/30" />}
          <button
            type="button"
            onClick={handleExport}
            className="ml-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold px-4 py-2.5 rounded-xl tactile-press transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      )}

      {/* Branch table */}
      {data.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 border border-border card-shadow text-center">
          <CircleSlash size={28} className="text-navy/20 mx-auto mb-3" />
          <p className="text-sm font-bold text-navy">No data for this period</p>
          <p className="text-[11px] text-navy/40 mt-1">Try switching to All time.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-navy/[0.04] border-b border-border">
                  <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em]">Branch</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Earners</th>
                  <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Total Earned</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.map((branch) => (
                  <tr
                    key={branch.branchId}
                    onClick={() => onSelectBranch(branch)}
                    className="hover:bg-indigo/[0.03] cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3 font-bold text-navy">{branch.branchName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span className={branch.employeeCount === 0 ? 'text-navy/25 font-medium' : 'font-medium text-navy'}>
                        {branch.employeeCount}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <Amt value={branch.total} />
                    </td>
                    <td className="px-3 py-3 text-navy/20 group-hover:text-indigo transition-colors">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-navy/[0.04] border-t-2 border-navy/10">
                  <td className="px-4 py-3 text-[10px] font-black text-navy/50 uppercase tracking-wider" colSpan={2}>
                    {data.length} Branches
                  </td>
                  <td className="px-4 py-3 text-right font-black text-indigo tabular-nums text-base">{formatCurrency(grand)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Root page ────────────────────────────────────────────────────────────────

export const IncentivesOverviewPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const location = useLocation();

  // URL params determine which drill level we are on.
  // Level 0: /incentives-overview
  // Level 1: /incentives-overview/branch/:branchId
  // Level 2: /incentives-overview/branch/:branchId/person/:userId
  const { branchId, userId } = useParams();
  const level = userId ? 2 : branchId ? 1 : 0;

  // Period and all-time state lives in the URL query string so it survives
  // navigation between levels (the component remounts on each route change).
  const { period, allTime, dateParams, periodQs, setPeriod, setAllTime } = usePeriodParams();

  // Role gate — only MD and Management reach this page.
  if (!['md', 'management'].includes(user?.role)) {
    return <div className="p-8 text-center text-navy/40 text-sm">Access denied.</div>;
  }

  // ── Branch row click — navigate to Level 1, carry period, pass display name in state.
  const handleSelectBranch = (branch) => {
    navigate(
      `/incentives-overview/branch/${branch.branchId}?${periodQs()}`,
      { state: { branchName: branch.branchName } }
    );
  };

  // ── Person row click — navigate to Level 2, carry period, pass display info in state.
  const handleSelectPerson = (person) => {
    navigate(
      `/incentives-overview/branch/${branchId}/person/${person.userId}?${periodQs()}`,
      { state: { personName: person.name, personRole: person.role } }
    );
  };

  // ── Back button — step exactly one level up, carrying the period query string.
  const handleBack = () => {
    if (level === 2) {
      navigate(`/incentives-overview/branch/${branchId}?${periodQs()}`, { state: location.state });
    } else if (level === 1) {
      navigate(`/incentives-overview?${periodQs()}`);
    }
  };

  // Display strings for the header.
  const branchName = location.state?.branchName ?? '';
  const personName = location.state?.personName ?? '';
  const personRole = location.state?.personRole ?? '';

  return (
    <div className="min-h-screen bg-[#f7f8fc] pb-24">

      {/* ── Sticky top bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-border shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3">

          {/* Back button — shown at Level 1 and 2 only. Level 0 has none (tab root). */}
          {level > 0 && (
            <button
              type="button"
              onClick={handleBack}
              className="p-2 rounded-full hover:bg-navy/5 text-navy shrink-0 tactile-press"
              aria-label="Back"
            >
              <ChevronLeft size={18} />
            </button>
          )}

          {/* Breadcrumb heading */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-navy">
                {level === 0 && 'Incentive Overview'}
                {level === 1 && (branchName || 'Branch')}
                {level === 2 && (personName || 'Employee')}
              </h1>
              {level === 0 && (
                <span className="text-[10px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  All Branches
                </span>
              )}
              {level === 1 && (
                <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  Branch
                </span>
              )}
              {level === 2 && personRole && (
                <span className="text-[10px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {ROLE_LABEL[personRole] ?? personRole}
                </span>
              )}
            </div>
            <p className="text-[10px] font-medium text-navy/40 mt-0.5">
              {allTime ? 'All-time incentive breakdown' : `Period: ${period.label}`}
            </p>
          </div>
        </div>

        {/* Period controls — shown at Level 0 and 1; hidden at Level 2 (person detail) */}
        {level < 2 && (
          <div className="max-w-screen-xl mx-auto px-4 pb-3 flex items-center gap-3 flex-wrap">
            {/* Period calendar — disabled when All time is on */}
            <div className={allTime ? 'opacity-30 pointer-events-none' : ''}>
              <SchemeCalendar
                compact
                initialDate={period.startDate}
                onPeriodChange={setPeriod}
              />
            </div>

            {/* All time toggle chip */}
            <button
              type="button"
              onClick={() => setAllTime(!allTime)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-bold border transition-all tactile-press ${
                allTime
                  ? 'bg-navy text-white border-navy shadow-sm'
                  : 'bg-white text-navy/50 border-border hover:text-navy/70'
              }`}
            >
              <Award size={13} />
              All time
            </button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div className="max-w-screen-xl mx-auto px-4 pt-5">
        {level === 0 && (
          <BranchesRollup
            dateParams={dateParams}
            onSelectBranch={handleSelectBranch}
          />
        )}
        {level === 1 && branchId && (
          <BranchPeople
            branchId={branchId}
            dateParams={dateParams}
            onSelectPerson={handleSelectPerson}
          />
        )}
        {level === 2 && branchId && userId && (
          <PersonDetail
            branchId={branchId}
            userId={userId}
            dateParams={dateParams}
          />
        )}
      </div>
    </div>
  );
};
