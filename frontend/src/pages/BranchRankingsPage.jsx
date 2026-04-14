import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, BarChart3, Building2, XCircle, CheckCircle2, Clock,
  TrendingUp, Trophy, Medal, Loader2, Wallet, AlertCircle
} from 'lucide-react';
import { PageHeader } from '../components/attendance/PageHeader';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetBranchRankingsQuery,
  useGetMoneyBranchDrilldownQuery,
} from '../store/api/apiSlice';
import { PhotoProof } from '../components/money/PhotoProof';

const STATUS_COLORS = {
  pending: 'text-amber-500 bg-amber-50 border-amber-200',
  approved: 'text-emerald-500 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200',
};

const MODE_LABELS = {
  gpay: 'Google Pay',
  bank_receipt: 'Bank Receipt',
  cash: 'Cash in Hand',
  cash_transfer: 'Cash Transfer',
};

const RankBadge = ({ rank }) => {
  if (rank === 1) return (
    <div className="flex flex-col items-center gap-0.5">
      <Trophy size={20} className="text-yellow-500" />
      <span className="text-[9px] font-black text-yellow-600 uppercase tracking-widest">1st Place</span>
    </div>
  );
  if (rank === 2) return (
    <div className="flex flex-col items-center gap-0.5">
      <Trophy size={20} className="text-slate-400" />
      <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">2nd Place</span>
    </div>
  );
  if (rank === 3) return (
    <div className="flex flex-col items-center gap-0.5">
      <Medal size={20} className="text-amber-700" />
      <span className="text-[9px] font-black text-amber-800 uppercase tracking-widest">3rd Place</span>
    </div>
  );
  return (
    <span className="text-[9px] font-bold text-navy/30 uppercase tracking-widest whitespace-nowrap">{rank}th Place</span>
  );
};

export const BranchRankingsPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [rankingsFilter, setRankingsFilter] = useState('all');
  const [drillBranchId, setDrillBranchId] = useState(null);

  const rankingsDates = (() => {
    const now = new Date();
    if (rankingsFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
    }
    if (rankingsFilter === 'year') {
      const start = new Date(now.getFullYear(), 0, 1);
      return { startDate: start.toISOString().slice(0, 10), endDate: now.toISOString().slice(0, 10) };
    }
    return {};
  })();

  const { data: branchRankings = [], isLoading: isRankingsLoading } = useGetBranchRankingsQuery(rankingsDates);
  const { data: drilldown, isLoading: isDrilldownLoading } = useGetMoneyBranchDrilldownQuery(drillBranchId, { skip: !drillBranchId });

  const rankTotal = branchRankings.reduce((s, b) => s + b.totalCollection, 0);
  const drillBranchName = branchRankings.find(b => b.branchId === drillBranchId)?.branchName || 'Branch';

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f8fc]">
      <PageHeader user={user} title="Branch Rankings" />
      <motion.div
        key="branch_rankings"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex-1 pt-4 pb-28"
      >
        {/* Back + title */}
        <div className="px-4 mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate('/money')}
            className="p-3 bg-white rounded-full shadow-sm text-navy hover:bg-navy/5 tactile-press shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-navy tracking-tight">Branch Rankings</h2>
            <p className="text-[11px] font-medium text-navy/40">Total collected · all branches</p>
          </div>
        </div>

        {/* Date filter tabs */}
        <div className="px-4 mb-5">
          <div className="bg-white rounded-2xl p-1 flex gap-1 card-shadow border border-navy/5">
            {[
              { key: 'all', label: 'All Time' },
              { key: 'year', label: 'This Year' },
              { key: 'month', label: 'This Month' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRankingsFilter(key)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold transition-all ${rankingsFilter === key ? 'bg-navy text-white shadow-sm' : 'text-navy/40 hover:text-navy/60'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Grand total strip */}
        <div className="px-4 mb-6">
          <div className="bg-navy rounded-[24px] p-5 flex items-center justify-between">
            <div>
              <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest mb-1">Grand Total (All Branches)</p>
              <p className="text-2xl font-black text-white">₹{rankTotal.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <BarChart3 size={22} className="text-white/70" />
            </div>
          </div>
        </div>

        {/* Rankings list */}
        <div className="px-4 space-y-3">
          {isRankingsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-navy/20" size={28} /></div>
          ) : branchRankings.length === 0 ? (
            <p className="text-center text-sm text-navy/30 py-8">No collection data yet.</p>
          ) : (
            branchRankings.map((b) => (
              <button
                key={b.branchId}
                onClick={() => setDrillBranchId(b.branchId)}
                className="w-full bg-white rounded-[24px] p-4 card-shadow border border-navy/5 text-left tactile-press group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-navy/5 flex items-center justify-center shrink-0">
                    <span className="text-xs font-black text-navy/40">{b.rank}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy truncate">{b.branchName}</p>
                    <p className="text-[10px] font-medium text-navy/40 truncate">BM: {b.bmName}</p>
                  </div>
                  <div className="text-right shrink-0 mr-3">
                    <p className="text-base font-black text-navy">₹{b.totalCollection.toLocaleString()}</p>
                    <p className="text-[9px] text-navy/30">collected</p>
                  </div>
                  <div className="shrink-0 w-16 flex flex-col items-center">
                    <RankBadge rank={b.rank} />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-3 pt-3 border-t border-navy/5">
                  {[
                    { label: 'GPay', val: b.byMode?.gpay || 0, cls: 'text-indigo bg-indigo/5' },
                    { label: 'Bank', val: b.byMode?.bankReceipt || 0, cls: 'text-emerald-600 bg-emerald-50' },
                    { label: 'Cash', val: b.byMode?.cash || 0, cls: 'text-amber-600 bg-amber-50' },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className={`rounded-xl px-2 py-1.5 ${cls}`}>
                      <p className="text-[8px] font-bold uppercase tracking-wider opacity-60">{label}</p>
                      <p className="text-[10px] font-bold mt-0.5">₹{val.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </button>
            ))
          )}
        </div>
      </motion.div>

      {/* Branch drilldown portal — full detail identical to main money page */}
      {createPortal(
        <AnimatePresence>
          {drillBranchId && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm pointer-events-none"
              onClick={() => setDrillBranchId(null)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                onClick={e => e.stopPropagation()}
                className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl pointer-events-auto"
              >
                <div className="flex items-center justify-between p-5 border-b border-navy/5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-2xl bg-indigo/5 text-indigo flex items-center justify-center"><Building2 size={18} /></div>
                    <div>
                      <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Branch Detail</p>
                      <p className="text-base font-bold text-navy">{drillBranchName}</p>
                    </div>
                  </div>
                  <button onClick={() => setDrillBranchId(null)} className="p-2 hover:bg-navy/5 rounded-full">
                    <XCircle size={20} className="text-navy/30" />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[80vh] p-4 space-y-6">
                  {isDrilldownLoading ? (
                    <div className="flex justify-center py-12"><Loader2 className="animate-spin text-indigo/40" size={28} /></div>
                  ) : drilldown ? (
                    <>
                      {/* Flow totals */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Collected', val: drilldown.totals.collected, icon: <TrendingUp size={13} />, bg: 'bg-indigo/5 text-indigo' },
                          { label: 'Verified',  val: drilldown.totals.verified,  icon: <CheckCircle2 size={13} />, bg: 'bg-emerald-50 text-emerald-500' },
                          { label: 'Pending',   val: drilldown.totals.pending,   icon: <Clock size={13} />, bg: 'bg-amber-50 text-amber-500' },
                          { label: 'Rejected',  val: drilldown.totals.rejected,  icon: <XCircle size={13} />, bg: 'bg-red-50 text-red-400' },
                        ].map(({ label, val, icon, bg }) => (
                          <div key={label} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5">
                            <div className={`w-7 h-7 rounded-xl flex items-center justify-center mb-2 ${bg}`}>{icon}</div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                            <p className="text-base font-bold text-navy mt-0.5">₹{val.toLocaleString()}</p>
                          </div>
                        ))}
                      </div>

                      {/* Mode breakdown */}
                      <div className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5">
                        <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Collected by Mode</p>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'GPay', val: drilldown.totals.byMode?.gpay || 0, cls: 'bg-indigo/5 text-indigo' },
                            { label: 'Bank', val: drilldown.totals.byMode?.bankReceipt || 0, cls: 'bg-emerald-50 text-emerald-600' },
                            { label: 'Cash', val: drilldown.totals.byMode?.cash || 0, cls: 'bg-amber-50 text-amber-600' },
                          ].map(({ label, val, cls }) => (
                            <div key={label} className={`rounded-2xl p-3 ${cls}`}>
                              <p className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1">{label}</p>
                              <p className="text-sm font-bold">₹{val.toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Cash holders */}
                      {drilldown.holders && drilldown.holders.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Current Cash Holders</p>
                          <div className="space-y-2">
                            {drilldown.holders.map(h => (
                              <div key={h.id} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 rounded-xl bg-navy/5 flex items-center justify-center text-navy/30"><Wallet size={15} /></div>
                                  <div>
                                    <p className="text-xs font-bold text-navy">{h.name}</p>
                                    <p className="text-[9px] font-medium text-navy/40 capitalize">{h.role?.replace('_', ' ')}</p>
                                  </div>
                                </div>
                                <p className="text-sm font-bold text-navy">₹{parseFloat(h.amount_held).toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Top collectors */}
                      {drilldown.topCollectors && drilldown.topCollectors.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Top Collectors</p>
                          <div className="space-y-2">
                            {drilldown.topCollectors.map((c, idx) => (
                              <div key={c.id} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5 flex items-center gap-3">
                                <span className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-[10px] font-bold text-navy/30 shrink-0">{idx + 1}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-navy truncate">{c.name}</p>
                                  <p className="text-[10px] font-medium text-navy/40 capitalize">{c.role?.replace('_', ' ')}</p>
                                </div>
                                <p className="text-sm font-bold text-indigo shrink-0">₹{parseFloat(c.total_collected).toLocaleString()}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Project split */}
                      {drilldown.projectSplit && drilldown.projectSplit.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Project Split</p>
                          <div className="space-y-2">
                            {drilldown.projectSplit.map(p => {
                              const pct = drilldown.totals.collected > 0
                                ? Math.round((parseFloat(p.total_amount) / drilldown.totals.collected) * 100)
                                : 0;
                              return (
                                <div key={p.id} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5">
                                  <div className="flex justify-between items-center mb-2">
                                    <p className="text-xs font-bold text-navy truncate w-2/3">{p.name}</p>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-bold text-indigo">₹{parseFloat(p.total_amount).toLocaleString()}</p>
                                      <p className="text-[9px] font-bold text-navy/20">{pct}%</p>
                                    </div>
                                  </div>
                                  <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Collections log with proof photos */}
                      {drilldown.collections && drilldown.collections.length > 0 && (
                        <div>
                          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Collections Log</p>
                          <div className="space-y-3">
                            {drilldown.collections.map(col => (
                              <div key={col.id} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5 space-y-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <p className="text-xs font-bold text-navy">{col.submitter_name}</p>
                                    <p className="text-[9px] text-navy/40 capitalize">{col.submitter_role?.replace(/_/g, ' ')}</p>
                                    {col.verifier_name && (
                                      <p className="text-[9px] font-semibold text-indigo mt-0.5">→ {col.verifier_name}</p>
                                    )}
                                  </div>
                                  <span className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${STATUS_COLORS[col.status]}`}>
                                    {col.status}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center">
                                  <div>
                                    <p className="text-base font-bold text-navy">₹{parseFloat(col.amount).toLocaleString()}</p>
                                    <p className="text-[9px] text-navy/40">{col.client_name} · {col.project_name}</p>
                                  </div>
                                  <span className="text-[9px] font-bold text-navy/30 bg-navy/5 px-2 py-1 rounded-lg uppercase">
                                    {MODE_LABELS[col.mode] || col.mode}
                                  </span>
                                </div>
                                {col.photo_key && <PhotoProof photoKey={col.photo_key} />}
                                {col.rejection_note && (
                                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-100 flex items-start gap-2">
                                    <AlertCircle size={12} className="text-red-500 shrink-0 mt-0.5" />
                                    <p className="text-[9px] font-medium text-red-700 leading-relaxed">{col.rejection_note}</p>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
