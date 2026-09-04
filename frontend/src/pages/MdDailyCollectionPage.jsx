import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  ArrowLeft, Loader2, Download, CalendarDays, Building2, CircleSlash,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetSchemeDailyCollectionQuery,
  useGetSchemeDailyCollectionBySchemeQuery,
  useGetBranchesQuery,
} from '../store/api/apiSlice';
import { formatCurrency } from '../lib/formatters';
import { getISTToday as getIstToday } from '../lib/date';

// Export the multi-branch summary view as CSV.
const exportSummaryCsv = (rows, date) => {
  const headers = ['Branch', 'Entries', 'Cash', 'Bank', 'GPay', 'Upto Yesterday', 'Today', 'Total'];
  const lines = rows.map(r => [
    r.branchName, r.entries, r.cash, r.bank, r.gpay, r.uptoYesterday, r.today, r.total,
  ].join(','));
  downloadCsv([headers.join(','), ...lines].join('\n'), `daily-collection-${date}.csv`);
};

// Export the per-scheme branch-detail view as CSV.
const exportSchemeCsv = (rows, branchName, date) => {
  const headers = ['S.No', 'Type of Business', 'Until Yesterday', 'Today', 'Total'];
  const lines = rows.map((r, i) => [i + 1, r.schemeLabel, r.uptoYesterday, r.today, r.total].join(','));
  downloadCsv([headers.join(','), ...lines].join('\n'), `daily-collection-${branchName.replace(/\s+/g, '-')}-${date}.csv`);
};

const downloadCsv = (csv, filename) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─── Currency cell — prints ₹0 when zero, formatted otherwise ────────────────
const Amt = ({ value, muted }) => (
  <span className={(muted || value === 0) ? 'text-navy/25' : 'font-medium text-navy'}>
    {formatCurrency(value)}
  </span>
);

export const MdDailyCollectionPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [date, setDate]           = useState(getIstToday);
  const [branchFilter, setBranch] = useState('');   // '' = all branches

  // All-branch summary (always fetched for the summary view).
  const { data: summaryData, isLoading: isSummaryLoading, isFetching: isSummaryFetching } =
    useGetSchemeDailyCollectionQuery({ date });

  // Per-scheme breakdown — only fetched when a branch is selected.
  const { data: schemeData, isLoading: isSchemeLoading, isFetching: isSchemeFetching } =
    useGetSchemeDailyCollectionBySchemeQuery(
      { date, branchId: branchFilter },
      { skip: !branchFilter },
    );

  // Branch list for the filter dropdown.
  const { data: allBranches = [] } = useGetBranchesQuery();

  const summaryRows    = summaryData?.rows ?? [];
  const periodStart    = summaryData?.periodStart ?? schemeData?.periodStart ?? '';
  const schemeRows     = schemeData?.rows ?? [];
  const branchName     = schemeData?.branchName ?? '';

  // Apply branch filter client-side on the summary table.
  const visibleSummary = useMemo(() =>
    branchFilter ? summaryRows.filter(r => r.branchId === branchFilter) : summaryRows,
    [summaryRows, branchFilter]
  );

  // Footer totals for the summary table.
  const summaryTotals = useMemo(() =>
    visibleSummary.reduce((acc, r) => ({
      entries:       acc.entries       + r.entries,
      cash:          acc.cash          + r.cash,
      bank:          acc.bank          + r.bank,
      gpay:          acc.gpay          + r.gpay,
      uptoYesterday: acc.uptoYesterday + r.uptoYesterday,
      today:         acc.today         + r.today,
      total:         acc.total         + r.total,
    }), { entries: 0, cash: 0, bank: 0, gpay: 0, uptoYesterday: 0, today: 0, total: 0 }),
    [visibleSummary]
  );

  // Footer totals for the scheme-detail table.
  const schemeTotals = useMemo(() =>
    schemeRows.reduce((acc, r) => ({
      uptoYesterday: acc.uptoYesterday + r.uptoYesterday,
      today:         acc.today         + r.today,
      total:         acc.total         + r.total,
    }), { uptoYesterday: 0, today: 0, total: 0 }),
    [schemeRows]
  );

  const isBranchSelected = !!branchFilter;
  const isLoading        = isBranchSelected ? isSchemeLoading : isSummaryLoading;
  const isFetching       = isBranchSelected ? isSchemeFetching : isSummaryFetching;

  // Only MD / director / management can reach this page.
  if (!['md', 'director', 'management'].includes(user?.role)) {
    return <div className="p-8 text-center text-navy/40 text-sm">Access denied.</div>;
  }

  return (
    <div className="min-h-screen bg-[#f7f8fc] pb-20">

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-10 bg-white border-b border-border shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate('/money')}
            className="p-2 rounded-full hover:bg-navy/5 text-navy shrink-0 tactile-press"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold text-navy">Daily Collection</h1>
              {isBranchSelected && branchName && (
                <span className="text-[10px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full uppercase tracking-wide">
                  {branchName}
                </span>
              )}
              {!isBranchSelected && summaryRows.length > 0 && (
                <span className="text-[10px] font-bold text-indigo bg-indigo/10 px-2 py-0.5 rounded-full">
                  {summaryRows.length} branches
                </span>
              )}
            </div>
            {periodStart && (
              <p className="text-[10px] font-medium text-navy/40 mt-0.5">
                {isBranchSelected && branchName
                  ? `Scheme-wise cycle-to-date breakdown for ${branchName}`
                  : `Per-branch scheme collection — cash / bank / GPay for selected day; total from the ${periodStart.slice(8)}th`}
              </p>
            )}
          </div>
        </div>

        {/* ── Filter bar ── */}
        <div className="max-w-screen-xl mx-auto px-4 pb-3 flex items-center gap-3 flex-wrap">
          {/* Date */}
          <div className="flex items-center gap-2 bg-navy/5 rounded-xl px-3 py-2">
            <CalendarDays size={14} className="text-navy/40 shrink-0" />
            <input
              type="date"
              value={date}
              max={getIstToday()}
              onChange={e => setDate(e.target.value)}
              className="bg-transparent text-[13px] font-semibold text-navy outline-none cursor-pointer"
            />
          </div>

          {/* Branch */}
          <div className="flex items-center gap-2 bg-navy/5 rounded-xl px-3 py-2">
            <Building2 size={14} className="text-navy/40 shrink-0" />
            <select
              value={branchFilter}
              onChange={e => setBranch(e.target.value)}
              className="bg-transparent text-[13px] font-semibold text-navy outline-none cursor-pointer pr-2"
            >
              <option value="">All Branches</option>
              {allBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Export */}
          <button
            onClick={() =>
              isBranchSelected
                ? exportSchemeCsv(schemeRows, branchName, date)
                : exportSummaryCsv(visibleSummary, date)
            }
            disabled={(isBranchSelected ? schemeRows.length : visibleSummary.length) === 0}
            className="ml-auto flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[12px] font-bold px-4 py-2.5 rounded-xl tactile-press transition-colors"
          >
            <Download size={14} />
            Export CSV
          </button>

          {isFetching && !isLoading && (
            <Loader2 size={14} className="animate-spin text-navy/30" />
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-screen-xl mx-auto px-4 pt-4">
        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="animate-spin text-indigo" size={32} />
          </div>

        ) : isBranchSelected ? (
          /* ── Branch-detail view: per-scheme table ── */
          <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
            {/* Green branch header bar */}
            <div className="bg-emerald-700 px-5 py-3 flex items-center justify-between">
              <span className="text-sm font-black text-white uppercase tracking-wider">
                {branchName} Branch
              </span>
              <span className="text-sm font-bold text-white/80">{date.split('-').reverse().join('/')}</span>
            </div>

            {schemeRows.length === 0 ? (
              <div className="p-12 text-center">
                <CircleSlash size={30} className="text-navy/20 mx-auto mb-3" />
                <p className="text-sm font-bold text-navy">No data for this date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-5 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] w-12">S.No</th>
                      <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em]">Type of Business</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Until Yesterday</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Today Business</th>
                      <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Total Business</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-border">
                    {schemeRows.map((r, i) => (
                      <tr key={r.schemeLabel} className="hover:bg-navy/[0.015] transition-colors">
                        <td className="px-5 py-3 text-navy/30 font-medium tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-semibold text-navy uppercase tracking-wide text-[12px]">{r.schemeLabel}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Amt value={r.uptoYesterday} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          <Amt value={r.today} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-bold text-navy">
                          {r.total === 0
                            ? <span className="text-navy/25 font-medium">{formatCurrency(0)}</span>
                            : formatCurrency(r.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t-2 border-navy/15 bg-navy/[0.03]">
                      <td className="px-5 py-3" />
                      <td className="px-4 py-3 text-[11px] font-black text-navy uppercase tracking-wider">Total</td>
                      <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(schemeTotals.uptoYesterday)}</td>
                      <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(schemeTotals.today)}</td>
                      <td className="px-4 py-3 text-right font-black text-indigo tabular-nums text-base">{formatCurrency(schemeTotals.total)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

        ) : visibleSummary.length === 0 ? (
          /* ── All-branches: empty state ── */
          <div className="bg-white rounded-2xl p-12 border border-border card-shadow text-center mt-6">
            <CircleSlash size={30} className="text-navy/20 mx-auto mb-3" />
            <p className="text-sm font-bold text-navy">No scheme collections for this date</p>
            <p className="text-[11px] text-navy/40 mt-1">Try a different date or check back later.</p>
          </div>

        ) : (
          /* ── All-branches summary table ── */
          <div className="bg-white rounded-2xl border border-border card-shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-navy/[0.04] border-b border-border">
                    <th className="text-left px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Branch</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Entries</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Cash</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Bank</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">GPay</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Upto Yesterday</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Today</th>
                    <th className="text-right px-4 py-3 text-[10px] font-black text-navy/40 uppercase tracking-[0.15em] whitespace-nowrap">Total</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-border">
                  {visibleSummary.map(r => (
                    <tr key={r.branchId} className="hover:bg-navy/[0.015] transition-colors">
                      <td className="px-4 py-3 font-bold text-navy whitespace-nowrap">{r.branchName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span className={r.entries === 0 ? 'text-navy/25' : 'font-medium text-navy'}>{r.entries}</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums"><Amt value={r.cash} /></td>
                      <td className="px-4 py-3 text-right tabular-nums"><Amt value={r.bank} /></td>
                      <td className="px-4 py-3 text-right tabular-nums"><Amt value={r.gpay} /></td>
                      <td className="px-4 py-3 text-right tabular-nums text-navy/60">{formatCurrency(r.uptoYesterday)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-navy">{formatCurrency(r.today)}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-black text-navy">{formatCurrency(r.total)}</td>
                    </tr>
                  ))}
                </tbody>

                <tfoot>
                  <tr className="bg-navy/[0.04] border-t-2 border-navy/10">
                    <td className="px-4 py-3 text-[10px] font-black text-navy/50 uppercase tracking-wider">
                      {visibleSummary.length} Branches
                    </td>
                    <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{summaryTotals.entries}</td>
                    <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(summaryTotals.cash)}</td>
                    <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(summaryTotals.bank)}</td>
                    <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(summaryTotals.gpay)}</td>
                    <td className="px-4 py-3 text-right font-black text-navy/60 tabular-nums">{formatCurrency(summaryTotals.uptoYesterday)}</td>
                    <td className="px-4 py-3 text-right font-black text-navy tabular-nums">{formatCurrency(summaryTotals.today)}</td>
                    <td className="px-4 py-3 text-right font-black text-indigo tabular-nums text-base">{formatCurrency(summaryTotals.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
