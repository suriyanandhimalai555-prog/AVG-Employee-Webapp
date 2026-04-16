import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import {
  Wallet, Plus, History, XCircle, CheckCircle2, ChevronRight, ArrowRight,
  Loader2, Clock, AlertCircle,
  Briefcase, TrendingUp, Building2, AlertTriangle,
  BarChart3, PenLine
} from 'lucide-react';
import { PageHeader } from '../components/attendance/PageHeader';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyCollectionsQuery,
  useGetMoneyWalletQuery,
  useGetMoneyAdminOverviewQuery,
  useGetMoneyBranchDrilldownQuery,
} from '../store/api/apiSlice';
import { useNavigate } from 'react-router-dom';
import { PhotoProof } from '../components/money/PhotoProof';

// Status colors (used in MD drilldown collections log)
const STATUS_COLORS = {
  pending: 'text-amber-500 bg-amber-50 border-amber-200',
  approved: 'text-emerald-500 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200'
};

const MODE_LABELS = {
  gpay: 'Google Pay',
  bank_receipt: 'Bank Receipt',
  cash: 'Cash in Hand',
  cash_transfer: 'Cash Transfer'
};

export const MoneyManagementPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [drillBranchId, setDrillBranchId] = useState(null);

  // Admin overview — MD only
  const { data: adminOverview, isLoading: isOverviewLoading } = useGetMoneyAdminOverviewQuery({}, { skip: user?.role !== 'md' });
  const { data: drilldown, isLoading: isDrilldownLoading } = useGetMoneyBranchDrilldownQuery(drillBranchId, { skip: !drillBranchId });

  // Collections — used on home to detect pending approvals
  const { data: collectionsResult } = useGetMoneyCollectionsQuery(undefined, { skip: user?.role === 'md' });
  const collections = collectionsResult?.data || [];
  const pendingToVerify = collections.filter(c => c.status === 'pending' && c.assigned_verifier_id === user?.id);

  // Wallet — used on home to show available total
  const { data: walletItems = [] } = useGetMoneyWalletQuery(undefined, {
    skip: user?.role === 'md'
  });

// ─── SHARED ADMIN OVERVIEW VIEW (used for MD and management roles) ───
  const AdminOverviewContent = () => {
    const isMd = user?.role === 'md';
    const ov = adminOverview;
    const ovTotals = ov?.totals || { collected: 0, verified: 0, pending: 0, rejected: 0, byMode: { gpay: 0, bankReceipt: 0, cash: 0 } };
    const byBranch = ov?.byBranch || [];
    const stuckCash = ov?.stuckCash || [];
    const allHolders = ov?.holders || [];
    const topVerified = ovTotals.verified > 0 ? ovTotals.verified : 1; // for bar scaling

    return (
      <div className="pb-28">
        {/* KPI Strip */}
        <div className="px-4 mb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-indigo/5 text-indigo flex items-center justify-center"><TrendingUp size={14} /></div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-navy/30">Collected</p>
              </div>
              <p className="text-xl font-bold text-navy">₹{ovTotals.collected.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center"><CheckCircle2 size={14} /></div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-navy/30">Verified</p>
              </div>
              <p className="text-xl font-bold text-navy">₹{ovTotals.verified.toLocaleString()}</p>
            </div>
            <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center"><Clock size={14} /></div>
                <p className="text-[9px] uppercase tracking-widest font-bold text-navy/30">Pending</p>
              </div>
              <p className="text-xl font-bold text-navy">₹{ovTotals.pending.toLocaleString()}</p>
            </div>
            {isMd ? (
              <div className="bg-navy rounded-3xl p-4 card-shadow">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-xl bg-white/10 text-white flex items-center justify-center"><Wallet size={14} /></div>
                  <p className="text-[9px] uppercase tracking-widest font-bold text-white/40">Cash on Hand</p>
                </div>
                <p className="text-xl font-bold text-white">₹{(ov?.cashOnHand || 0).toLocaleString()}</p>
              </div>
            ) : (
              <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-xl bg-red-50 text-red-500 flex items-center justify-center"><XCircle size={14} /></div>
                  <p className="text-[9px] uppercase tracking-widest font-bold text-navy/30">Rejected</p>
                </div>
                <p className="text-xl font-bold text-navy">₹{ovTotals.rejected.toLocaleString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Mode breakdown strip */}
        <div className="px-4 mb-6">
          <div className="bg-white rounded-[24px] p-4 card-shadow border border-navy/5">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 mb-3 font-mono">Collected by Mode</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'GPay', val: ovTotals.byMode?.gpay || 0, color: 'bg-indigo/5 text-indigo' },
                { label: 'Bank', val: ovTotals.byMode?.bankReceipt || 0, color: 'bg-emerald-50 text-emerald-600' },
                { label: 'Cash', val: ovTotals.byMode?.cash || 0, color: 'bg-amber-50 text-amber-600' },
              ].map(({ label, val, color }) => (
                <div key={label} className={`rounded-2xl p-3 ${color}`}>
                  <p className="text-[9px] font-bold uppercase tracking-wider opacity-60 mb-1">{label}</p>
                  <p className="text-sm font-bold">₹{val.toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stuck Cash Alerts (MD-only) */}
        {isMd && stuckCash.length > 0 && (
          <div className="px-4 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-[24px] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-500" />
                <p className="text-xs font-bold text-red-700">{stuckCash.length} cash alert{stuckCash.length > 1 ? 's' : ''} — held &gt;3 days</p>
              </div>
              <div className="space-y-2">
                {stuckCash.map(sc => (
                  <div key={sc.id} className="bg-white rounded-2xl p-3 flex items-center justify-between border border-red-100">
                    <div>
                      <p className="text-xs font-bold text-navy">{sc.holder_name}</p>
                      <p className="text-[9px] font-medium text-navy/40">{sc.branch_name} · {sc.holder_role?.replace('_', ' ')}</p>
                    </div>
                    <p className="text-sm font-bold text-red-600">₹{parseFloat(sc.amount).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Branch Breakdown */}
        <div className="px-4 mb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">Branch Breakdown</p>
            {isMd && <p className="text-[9px] font-bold text-navy/20 uppercase tracking-wider">incl. cash on hand</p>}
          </div>
          <div className="space-y-3">
            {isOverviewLoading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin text-navy/20" size={28} /></div>
            ) : byBranch.length === 0 ? (
              <p className="text-center text-sm text-navy/30 py-6">No branch data yet.</p>
            ) : (
              byBranch.map(b => (
                <button
                  key={b.branchId}
                  onClick={() => setDrillBranchId(b.branchId)}
                  className="w-full bg-white rounded-[24px] p-4 card-shadow border border-navy/5 text-left tactile-press group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo/5 text-indigo flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Building2 size={15} />
                      </div>
                      <p className="text-sm font-bold text-navy">{b.branchName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMd && b.cashOnHand > 0 && (
                        <span className="text-[9px] font-bold text-navy bg-navy/5 px-2 py-1 rounded-lg">
                          ₹{b.cashOnHand.toLocaleString()} held
                        </span>
                      )}
                      <ChevronRight size={14} className="text-navy/20 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </div>
                  {/* Mini bar: verified width relative to top branch */}
                  <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-indigo rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (b.verified / topVerified) * 100)}%` }}
                    />
                  </div>
                  <div className="flex gap-4 text-[9px] font-bold uppercase tracking-wider mb-3">
                    <span className="text-emerald-500">₹{b.verified.toLocaleString()} verified</span>
                    {b.pending > 0 && <span className="text-amber-500">₹{b.pending.toLocaleString()} pending</span>}
                    {b.rejected > 0 && <span className="text-red-400">₹{b.rejected.toLocaleString()} rejected</span>}
                  </div>
                  {/* Mode breakdown */}
                  <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-navy/5">
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
        </div>

        {/* Org-wide cash holders (MD-only) */}
        {isMd && allHolders.length > 0 && (
          <div className="px-4 mb-6">
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">Who is Holding Cash</p>
            <div className="space-y-2">
              {allHolders.map(h => (
                <div key={h.id} className="bg-white rounded-[20px] p-4 card-shadow border border-navy/5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-navy/5 flex items-center justify-center text-navy/30">
                      <Wallet size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">{h.name}</p>
                      <p className="text-[9px] font-medium text-navy/40 capitalize">
                        {h.role?.replace(/_/g, ' ')} · {h.branch_name || 'No branch'}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm font-bold text-navy">₹{parseFloat(h.amount_held).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manage Projects (MD-only) */}
        {isMd && (
          <div className="px-4">
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">Administration</p>
            <button
              onClick={() => navigate('/money/projects')}
              className="w-full bg-white rounded-[28px] p-5 flex items-center justify-between card-shadow border border-navy/5 group tactile-press"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-indigo/5 text-indigo flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Briefcase size={22} />
                </div>
                <div className="text-left">
                  <p className="text-sm font-bold text-navy">Manage Projects</p>
                  <p className="text-[10px] font-medium text-navy/30">Edit names, activate/deactivate</p>
                </div>
              </div>
              <ChevronRight size={20} className="text-navy/20 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}

      </div>
    );
  };

// ─── MD DASHBOARD VIEW ───
  if (user?.role === 'md') {
    const mdByBranch = adminOverview?.byBranch || [];

    return (
      <div className="flex flex-col">
        <PageHeader user={user} title="Financial Oversight" />
        <motion.div key="md_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-10 pt-4">
          <div className="px-6 mb-6">
            <h2 className="text-3xl font-bold text-navy tracking-tight">Finances</h2>
            <p className="text-xs font-medium text-navy/40 mt-1">Global collections overview</p>
          </div>

          {/* MD quick actions */}
          <div className="px-4 mb-6 grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/money/rankings')}
              className="bg-gradient-to-br from-indigo to-indigo/80 rounded-[24px] p-4 flex flex-col items-start gap-3 card-shadow tactile-press group"
            >
              <div className="w-9 h-9 rounded-2xl bg-white/10 flex items-center justify-center">
                <BarChart3 size={18} className="text-white" />
              </div>
              <div>
                <p className="text-xs font-bold text-white leading-tight">Branch Rankings</p>
                <p className="text-[9px] font-medium text-white/60 mt-0.5">Top collectors</p>
              </div>
            </button>
            <button
              onClick={() => navigate('/money/add-entry')}
              className="bg-white rounded-[24px] p-4 flex flex-col items-start gap-3 card-shadow border border-navy/5 tactile-press group"
            >
              <div className="w-9 h-9 rounded-2xl bg-emerald-50 flex items-center justify-center">
                <PenLine size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs font-bold text-navy leading-tight">Add Entry</p>
                <p className="text-[9px] font-medium text-navy/40 mt-0.5">Direct collection</p>
              </div>
            </button>
          </div>

          <AdminOverviewContent />
        </motion.div>

        {/* Branch Drilldown — rendered via portal to ensure viewport centering */}
        {createPortal(
          <AnimatePresence>
            {drillBranchId && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-navy/40 backdrop-blur-sm pointer-events-none"
                onClick={() => setDrillBranchId(null)}
              >
                <motion.div
                  initial={{ scale: 0.92, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.92, opacity: 0 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 280 }}
                  onClick={e => e.stopPropagation()}
                  className="bg-white w-full max-w-lg rounded-[32px] overflow-hidden shadow-2xl pointer-events-auto"
                >
                  <div className="flex items-center justify-between p-5 border-b border-navy/5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-indigo/5 text-indigo flex items-center justify-center"><Building2 size={18} /></div>
                      <div>
                        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Branch Detail</p>
                        <p className="text-base font-bold text-navy">
                          {mdByBranch.find(b => b.branchId === drillBranchId)?.branchName || 'Branch'}
                        </p>
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

                        {/* Cash holders (MD-only) */}
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
  }

  // ─── NON-MD WORKFORCE HOME VIEW ───
  return (
    <div className="relative">
      <PageHeader user={user} title="Collections" />
      <motion.div key="worker_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-10 pt-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="px-6 mb-8">
            <h2 className="text-3xl font-bold text-navy tracking-tight">Money</h2>
            <p className="text-xs font-medium text-navy/40 mt-1">Submit &amp; track collections</p>
          </div>

          <div className="px-6 grid grid-cols-1 gap-4 mb-8">
            <button onClick={() => navigate('/money/submit')} className="bg-gradient-to-br from-indigo to-indigo/80 p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left">
              <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white mb-4">
                  <Plus size={24} />
                </div>
                <p className="text-xl font-bold text-white mb-1">New Entry</p>
                <p className="text-xs font-medium text-white/70">Record a new payment collection</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mt-2 group-hover:bg-white/20 transition-colors">
                <ArrowRight size={20} className="text-white" />
              </div>
            </button>

            <button onClick={() => navigate('/money/history')} className="bg-white p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-navy/5">
              <div className="relative z-10 w-3/4">
                <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy mb-4 group-hover:scale-110 transition-transform">
                  <History size={24} />
                </div>
                <p className="text-xl font-bold text-navy mb-1">Transactions</p>
                <p className="text-xs font-medium text-navy/40">View your collection history</p>
              </div>
              <div className="relative z-10 w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center mt-2 group-hover:bg-navy/10 transition-colors">
                <ArrowRight size={20} className="text-navy/40" />
              </div>
            </button>

            {pendingToVerify.length > 0 && (
              <button onClick={() => navigate('/money/history')} className="bg-amber-50 p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-amber-200">
                <div className="relative z-10 w-3/4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
                    <CheckCircle2 size={24} />
                  </div>
                  <p className="text-xl font-bold text-navy mb-1">Pending Approvals</p>
                  <p className="text-xs font-medium text-navy/40">{pendingToVerify.length} collection{pendingToVerify.length > 1 ? 's' : ''} waiting for your review</p>
                </div>
                <div className="relative z-10 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mt-2 group-hover:bg-amber-200 transition-colors">
                  <ArrowRight size={20} className="text-amber-600" />
                </div>
              </button>
            )}

            {user?.role !== 'md' && (
              <button onClick={() => navigate('/money/wallet')} className="bg-white p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-navy/5">
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
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
};
