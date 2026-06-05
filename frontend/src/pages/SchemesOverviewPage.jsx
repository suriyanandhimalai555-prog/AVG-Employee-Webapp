// MD / Director Schemes dashboard — summary view.
//
// Shows one card per scheme with org-wide totals. Tapping a card navigates to
// /schemes/:schemeCode where the full per-branch breakdown (with search) lives.
// Separating the two levels keeps this page fast even with 70+ branches.

import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Layers, Wallet, Sparkles, ShieldCheck, Trophy,
  CircleSlash, ChevronRight, Users, TrendingUp,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetSchemesOverviewQuery } from '../store/api/apiSlice';
import { formatCurrency, formatNumber } from '../lib/formatters';
import { SOURCE_META } from '../lib/schemeConstants';

const VIEWER_ROLES = new Set(['md', 'director']);

const StatBlock = ({ label, value, tone = 'navy', icon }) => {
  const cls = { navy: 'text-navy', amber: 'text-amber-700', emerald: 'text-emerald-600', indigo: 'text-indigo' }[tone];
  return (
    <div className="flex-1 min-w-[110px] bg-white/60 rounded-2xl px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-base font-bold ${cls}`}>{value}</p>
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

// ─── Scheme summary card — tap to go to branch list ──────────────────────────

const SchemeCard = ({ scheme, onClick }) => {
  const meta = SOURCE_META[scheme.schemeCode] ?? SOURCE_META.scheme;
  const Icon = meta.Icon;
  const { totals } = scheme;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-3xl overflow-hidden card-shadow border border-navy/5 text-left tactile-press ${meta.bg}`}
    >
      <div className="p-4 flex items-center gap-3">
        {/* Icon */}
        <div className={`w-12 h-12 rounded-2xl bg-white/60 flex items-center justify-center flex-shrink-0 ${meta.color}`}>
          <Icon size={22} aria-hidden="true" />
        </div>

        {/* Name + subtitle */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-bold ${meta.color} truncate`}>{scheme.schemeName}</p>
          <p className="text-[11px] font-medium text-navy/50">
            {formatNumber(totals.count)} entries · {formatNumber(totals.branchCount)} branch{totals.branchCount === 1 ? '' : 'es'}
          </p>
        </div>

        <ChevronRight size={18} className={`${meta.color} flex-shrink-0 opacity-60`} aria-hidden="true" />
      </div>

      {/* Stats row */}
      <div className="px-4 pb-4 grid grid-cols-2 gap-2">
        <div className="bg-white/50 rounded-2xl px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Collected</p>
          <p className="text-sm font-bold text-navy mt-0.5">{formatCurrency(totals.collected)}</p>
        </div>
        <div className="bg-white/50 rounded-2xl px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Commission</p>
          <p className="text-sm font-bold text-emerald-700 mt-0.5">{formatCurrency(totals.commission)}</p>
        </div>
      </div>
    </button>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const SchemesOverviewPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canView  = VIEWER_ROLES.has(user?.role);

  const { data, isLoading, isFetching } = useGetSchemesOverviewQuery(
    undefined,
    { skip: !canView }
  );

  const schemes = useMemo(() => data?.schemes ?? [], [data]);

  const headlineTotals = useMemo(() => {
    let collected = 0, commission = 0, entries = 0, branches = new Set();
    for (const s of schemes) {
      collected  += s.totals.collected;
      commission += s.totals.commission;
      entries    += s.totals.count;
      (s.byBranch ?? []).forEach(b => branches.add(b.branchId));
    }
    return { collected, commission, entries, branchCount: branches.size };
  }, [schemes]);

  if (!canView) return <AccessDenied />;

  return (
    <div className="pb-32 pt-4">

      {/* Header */}
      <div className="px-6 mb-6 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-navy tracking-tight">Schemes</h2>
          <p className="text-xs font-medium text-navy/40 mt-1">
            Tap a scheme to see its branch breakdown
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

      {/* Org-wide headline strip */}
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
          <StatBlock
            label="Branches"
            value={formatNumber(headlineTotals.branchCount)}
            tone="navy"
            icon={<Users size={11} className="text-navy/40" aria-hidden="true" />}
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
            <p className="text-xs text-navy/40 mt-1">No collections or commissions recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {isFetching && (
              <p className="text-[11px] font-medium text-navy/40 flex items-center gap-1.5">
                <Loader2 className="animate-spin" size={10} aria-hidden="true" />
                Refreshing…
              </p>
            )}
            {schemes.map(scheme => (
              <SchemeCard
                key={scheme.schemeCode}
                scheme={scheme}
                onClick={() =>
                  scheme.schemeCode === 'land_scheme'
                    ? navigate('/money/schemes/land')
                    : navigate(`/schemes/${scheme.schemeCode}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 mb-8">
        <div className="bg-white rounded-2xl p-4 border border-navy/5 card-shadow flex items-start gap-3">
          <TrendingUp size={16} className="text-navy/40 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-bold text-navy">Scheme operations</p>
            <p className="text-[11px] text-navy/50 mt-0.5">
              To sell slots, mark payments, or run draws — use{' '}
              <button type="button" onClick={() => navigate('/money/schemes')} className="text-indigo font-semibold underline-offset-2 hover:underline">
                Money → Schemes
              </button>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SchemesOverviewPage;
