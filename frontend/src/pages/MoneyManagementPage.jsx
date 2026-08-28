import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import {
  ChevronRight, ChevronLeft, ArrowRight,
  Loader2,
  Briefcase, Trophy, Medal, Layers, Banknote, Sparkles,
  CircleSlash, CalendarDays
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyCollectionsQuery,
  useGetMoneyWalletQuery,
  useGetSchemesOverviewQuery,
} from '../store/api/apiSlice';
import { useNavigate } from 'react-router-dom';
import { formatCurrency, formatNumber } from '../lib/formatters';
import { SOURCE_META } from '../lib/schemeConstants';
import { getCurrentPeriod, getPrevPeriod, getNextPeriod } from '../lib/schemePeriod';

// IST-aware "today" string — mirrors server getCompanyToday().
const getIstToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

// ─── RANK BADGE — used in MD branch rankings section ─────────────────────────
const RankBadge = ({ rank }) => {
  if (rank === 1) return (
    <div className="flex flex-col items-center gap-0.5">
      <Trophy size={18} className="text-yellow-500" />
      <span className="text-[9px] font-black text-yellow-600 uppercase tracking-widest">1st</span>
    </div>
  );
  if (rank === 2) return (
    <div className="flex flex-col items-center gap-0.5">
      <Trophy size={18} className="text-slate-400" />
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">2nd</span>
    </div>
  );
  if (rank === 3) return (
    <div className="flex flex-col items-center gap-0.5">
      <Medal size={18} className="text-amber-700" />
      <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest">3rd</span>
    </div>
  );
  return <span className="text-[9px] font-bold text-navy/30 uppercase tracking-widest whitespace-nowrap">{rank}th</span>;
};

// ─── Period picker — prev/next arrows + label, mirrors SalaryManagementPage ──
const PeriodPicker = ({ period, onChange }) => (
  <div className="flex items-center gap-2 w-full px-4 py-2.5 rounded-2xl border border-navy/10 bg-white/60">
    <button
      type="button"
      onClick={() => onChange(getPrevPeriod(period.periodMonth, period.periodYear))}
      className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press shrink-0"
      aria-label="Previous period"
    >
      <ChevronLeft size={14} />
    </button>
    <span className="flex-1 text-center text-sm font-semibold text-navy">{period.label}</span>
    <button
      type="button"
      onClick={() => onChange(getNextPeriod(period.periodMonth, period.periodYear))}
      className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press shrink-0"
      aria-label="Next period"
    >
      <ChevronRight size={14} />
    </button>
  </div>
);

export const MoneyManagementPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  // Which branch row is expanded in the scheme-rankings list (MD only)
  const [expandedBranchId, setExpandedBranchId] = useState(null);

  const isMd = user?.role === 'md';

  // ─── Period filter state (MD only) ───────────────────────────────────────────
  // mode: 'month' (7-to-7 period) | 'date' (single day) | 'all' (no filter)
  const [mode, setMode]     = useState('month');
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [day, setDay]       = useState(getIstToday);

  // Derive the startDate/endDate arg for the overview hook from the active mode.
  const overviewArg = useMemo(() => {
    if (!isMd) return undefined;
    if (mode === 'month') return { startDate: period.startDate, endDate: period.endDate };
    if (mode === 'date')  return { startDate: day, endDate: day };
    return undefined; // all-time: no filter
  }, [isMd, mode, period, day]);

  // Scheme collections — MD only; single source for both grand-total and rankings
  const { data: schemesData, isLoading: isSchemesLoading, isFetching: isSchemesFetching } =
    useGetSchemesOverviewQuery(overviewArg, { skip: !isMd });
  const schemes = schemesData?.schemes ?? [];

  // Aggregate schemes[].byBranch[] into a branch-ranking sorted by ₹ collected desc.
  // Each byBranch row has: branchId, branchName, count, collected, commission.
  const { branchRanking, grandTotal } = useMemo(() => {
    const map = new Map();
    for (const scheme of schemes) {
      for (const row of (scheme.byBranch ?? [])) {
        if (!map.has(row.branchId)) {
          map.set(row.branchId, {
            branchId:   row.branchId,
            branchName: row.branchName,
            collected:  0,
            count:      0,
            commission: 0,
            perScheme:  [],
          });
        }
        const acc = map.get(row.branchId);
        acc.collected  += row.collected;
        acc.count      += row.count;
        acc.commission += row.commission;
        // Only include schemes where this branch had actual activity
        if (row.collected > 0 || row.count > 0) {
          acc.perScheme.push({
            schemeCode:  scheme.schemeCode,
            schemeName:  scheme.schemeName,
            collected:   row.collected,
            count:       row.count,
          });
        }
      }
    }
    const sorted = Array.from(map.values())
      .sort((a, b) => b.collected - a.collected)
      .map((b, i) => ({ ...b, rank: i + 1 }));
    const grandTotal = sorted.reduce((s, b) => s + b.collected, 0);
    return { branchRanking: sorted, grandTotal };
  }, [schemes]);

  // Collections — pending approvals indicator for non-MD roles
  const { data: collectionsResult } = useGetMoneyCollectionsQuery(undefined, { skip: isMd });
  const collections = collectionsResult?.data || [];
  const pendingToVerify = collections.filter(c => c.status === 'pending' && c.assigned_verifier_id === user?.id && c.mode !== 'cash_transfer');

  // Wallet — available total shown on non-MD money home
  const { data: walletItems = [] } = useGetMoneyWalletQuery(undefined, { skip: isMd });

// ─── MD MONEY VIEW ───
  if (isMd) {
    return (
      <div className="flex flex-col">
        <motion.div key="md_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-16 pt-4">

          {/* Header */}
          <div className="px-6 mb-4">
            <h2 className="text-3xl font-bold text-navy tracking-tight">Money</h2>
            <p className="text-xs font-medium text-navy/40 mt-1">
              Branch rankings · by scheme collections ·{' '}
              {mode === 'month' ? period.label : mode === 'date' ? day : 'All time'}
              {isSchemesFetching && !isSchemesLoading && (
                <Loader2 size={10} className="inline ml-1.5 animate-spin text-navy/30" />
              )}
            </p>
          </div>

          {/* ── Period filter ── */}
          <div className="px-4 mb-5 space-y-2">
            {/* 3-way segmented toggle */}
            <div className="flex rounded-2xl bg-navy/5 p-1 gap-1">
              {[['month', 'Month'], ['date', 'Date'], ['all', 'All time']].map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setMode(val)}
                  className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all tactile-press ${
                    mode === val
                      ? 'bg-white text-navy shadow-sm'
                      : 'text-navy/40 hover:text-navy/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Contextual sub-control */}
            {mode === 'month' && (
              <PeriodPicker period={period} onChange={setPeriod} />
            )}
            {mode === 'date' && (
              <div className="flex items-center gap-2 bg-white/60 border border-navy/10 rounded-2xl px-4 py-2.5">
                <CalendarDays size={14} className="text-navy/40 shrink-0" />
                <input
                  type="date"
                  value={day}
                  max={getIstToday()}
                  onChange={e => setDay(e.target.value)}
                  className="bg-transparent text-sm font-semibold text-navy outline-none cursor-pointer w-full"
                />
              </div>
            )}
            {mode === 'all' && (
              <p className="text-[11px] text-navy/30 text-center py-1">Showing all-time collections across every period</p>
            )}
          </div>

          {/* Daily Collection entry card */}
          <div className="px-4 mb-5">
            <button
              type="button"
              onClick={() => navigate('/money/daily-collection')}
              className="w-full bg-gradient-to-br from-indigo to-indigo/80 rounded-2xl p-5 flex items-center justify-between card-shadow tactile-press group"
            >
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center">
                  <CalendarDays size={20} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-white">Daily Collection</p>
                  <p className="text-[10px] font-medium text-white/60">Per-branch breakdown · cash / bank / GPay</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-white/50 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          </div>

          {/* Grand-total strip */}
          <div className="px-4 mb-5">
            <div className="bg-navy rounded-2xl p-5 flex items-center justify-between">
              <div>
                <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">
                  {mode === 'month' ? period.label : mode === 'date' ? day : 'All time'} · all branches
                </p>
                <p className="text-2xl font-black text-white">{formatCurrency(grandTotal)}</p>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
                <Trophy size={22} className="text-white/70" />
              </div>
            </div>
          </div>

          {/* Ranked branch list */}
          <div className="px-4 space-y-3">
            {isSchemesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="animate-spin text-navy/20" size={28} />
              </div>
            ) : branchRanking.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 card-shadow border border-border text-center">
                <CircleSlash size={26} className="text-navy/20 mx-auto mb-2" />
                <p className="text-sm font-bold text-navy">No scheme activity yet</p>
              </div>
            ) : (
              branchRanking.map(b => {
                const isExpanded = expandedBranchId === b.branchId;
                return (
                  <div key={b.branchId} className="bg-white rounded-2xl card-shadow border border-border overflow-hidden">

                    {/* Row — tap to toggle per-scheme breakdown */}
                    <button
                      type="button"
                      onClick={() => setExpandedBranchId(isExpanded ? null : b.branchId)}
                      className="w-full p-4 flex items-center gap-3 text-left tactile-press"
                    >
                      {/* Rank number */}
                      <div className="w-8 h-8 rounded-xl bg-navy/5 flex items-center justify-center shrink-0">
                        <span className="text-xs font-black text-navy/40">{b.rank}</span>
                      </div>

                      {/* Branch name + entry count */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-navy truncate">{b.branchName}</p>
                        <p className="text-[10px] font-medium text-navy/40">{formatNumber(b.count)} entries</p>
                      </div>

                      {/* Collected amount */}
                      <div className="text-right shrink-0 mr-2">
                        <p className="text-base font-black text-navy">{formatCurrency(b.collected)}</p>
                        <p className="text-[9px] text-navy/30">via schemes</p>
                      </div>

                      {/* Rank badge */}
                      <div className="shrink-0 w-10 flex flex-col items-center">
                        <RankBadge rank={b.rank} />
                      </div>

                      {/* Expand chevron */}
                      <ChevronRight
                        size={16}
                        className={`shrink-0 text-navy/30 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {/* Expanded: per-scheme breakdown */}
                    {isExpanded && (
                      <div className="border-t border-border px-4 py-3 space-y-2 bg-navy/[0.02]">
                        {b.perScheme.length === 0 ? (
                          <p className="text-[11px] text-navy/30 py-1">No detailed scheme data for this branch.</p>
                        ) : (
                          b.perScheme.map(s => {
                            const meta = SOURCE_META[s.schemeCode] ?? SOURCE_META.scheme;
                            const Icon = meta.Icon;
                            return (
                              <div key={s.schemeCode} className="flex items-center gap-3 py-1">
                                <div className={`w-8 h-8 rounded-xl bg-white flex items-center justify-center shrink-0 border border-border ${meta.color}`}>
                                  <Icon size={14} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-navy truncate">{s.schemeName}</p>
                                  <p className="text-[10px] text-navy/40">{formatNumber(s.count)} entries</p>
                                </div>
                                <p className="text-sm font-bold text-navy shrink-0">{formatCurrency(s.collected)}</p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

        </motion.div>
      </div>
    );
  }

  // ─── NON-MD WORKFORCE HOME VIEW ───
  return (
    <div className="relative">
      <motion.div key="worker_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-10 pt-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="px-6 mb-8">
            <h2 className="text-3xl font-bold text-navy tracking-tight">Money</h2>
            <p className="text-xs font-medium text-navy/40 mt-1">Submit &amp; track collections</p>
          </div>

          <div className="px-6 grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">

            {/* ── SCHEMES (pinned to top, full-width featured) ── */}
            <button onClick={() => navigate('/money/schemes')} className="md:col-span-2 bg-gradient-to-br from-amber-400 to-amber-500 p-6 rounded-2xl card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left">
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                  <Layers size={24} />
                </div>
                <p className="text-xl font-bold text-white mb-1">Schemes</p>
                <p className="text-xs font-medium text-white/70">Savings &amp; investment plans</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
                <ArrowRight size={20} className="text-white" />
              </div>
            </button>

            {/* ── INCENTIVE WALLET (below Schemes, full-width featured) ── */}
            <button onClick={() => navigate('/money/incentives')} className="md:col-span-2 bg-gradient-to-br from-emerald-500 to-emerald-600 p-6 rounded-2xl card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left">
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center text-white mb-4">
                  <Sparkles size={24} />
                </div>
                <p className="text-xl font-bold text-white mb-1">Incentive Wallet</p>
                <p className="text-xs font-medium text-white/70">Commissions earned across all schemes</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-white/20 flex items-center justify-center mt-2 group-hover:bg-white/30 transition-colors">
                <ArrowRight size={20} className="text-white" />
              </div>
            </button>

            {/* ── EVERYTHING ELSE below ── */}

            {user?.role !== 'md' && (
              <button onClick={() => navigate('/money/wallet')} className="bg-white p-6 rounded-2xl card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-border">
                <div className="relative z-10 w-3/4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo/5 flex items-center justify-center text-indigo mb-4 group-hover:scale-110 transition-transform">
                    <Briefcase size={24} />
                  </div>
                  <p className="text-xl font-bold text-navy mb-1">My Wallet</p>
                  <p className="text-xs font-medium text-navy/40">₹{walletItems.reduce((sum, item) => sum + parseFloat(item.amount), 0).toLocaleString()} available to transfer</p>
                </div>
                <div className="relative z-10 w-10 h-10 rounded-full bg-indigo/5 flex items-center justify-center mt-2 group-hover:bg-indigo/10 transition-colors">
                  <ArrowRight size={20} className="text-indigo/40" />
                </div>
              </button>
            )}

            <button onClick={() => navigate('/money/salaries')} className="bg-white p-6 rounded-2xl card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-border">
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy mb-4 group-hover:scale-110 transition-transform">
                  <Banknote size={24} />
                </div>
                <p className="text-xl font-bold text-navy mb-1">Salary</p>
                <p className="text-xs font-medium text-navy/40">View or manage employee salaries</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center mt-2 group-hover:bg-navy/10 transition-colors">
                <ArrowRight size={20} className="text-navy/40" />
              </div>
            </button>

          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
