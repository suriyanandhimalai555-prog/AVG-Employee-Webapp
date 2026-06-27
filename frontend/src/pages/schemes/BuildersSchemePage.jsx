import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Building2, ChevronRight, IndianRupee } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetBuildersPlansQuery,
  useGetBuildersSummaryQuery,
  useGetBuildersPackagesQuery,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { SchemePendingBanner } from './components/SchemePendingBanner';

const STATUS_STYLES = {
  cooling:          'text-blue-600 bg-blue-50',
  active:           'text-emerald-600 bg-emerald-50',
  decision_pending: 'text-amber-700 bg-amber-50',
  house:            'text-sky-700 bg-sky-50',
  cash:             'text-violet-700 bg-violet-50',
  completed:        'text-indigo bg-indigo/10',
  cancelled:        'text-red-500 bg-red-50',
};

const STATUS_LABELS = {
  cooling:          'Cooling',
  active:           'Active',
  decision_pending: 'Decision',
  house:            'House',
  cash:             'Cash',
  completed:        'Done',
  cancelled:        'Cancelled',
};

const PKG_COLORS = [
  'text-sky-700 bg-sky-50',
  'text-emerald-700 bg-emerald-50',
  'text-violet-700 bg-violet-50',
  'text-amber-700 bg-amber-50',
  'text-rose-700 bg-rose-50',
  'text-indigo bg-indigo/10',
];

const STATUS_FILTERS = [
  ['in_progress',     'Active'],
  ['cooling',         'Cooling'],
  ['active',          'Running'],
  ['decision_pending','Decision'],
  ['house',           'House'],
  ['cash',            'Cash'],
  ['all',             'All'],
  ['completed',       'Done'],
];

export const BuildersSchemePage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState('in_progress');

  const { data: plansResult, isLoading } = useGetBuildersPlansQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit:  200,
  });
  const { data: summary }  = useGetBuildersSummaryQuery({});
  const { data: packages } = useGetBuildersPackagesQuery();

  const plans = plansResult?.data || [];

  // Build a human-readable package label e.g. "₹5 L"
  const pkgLabel = (n) => {
    if (!packages || !packages[n]) return `Pkg ${n}`;
    const inv = packages[n].investmentAmount;
    const lakh = inv / 100_000;
    return `₹${lakh % 1 === 0 ? lakh : lakh.toFixed(1)} L`;
  };

  const isMD = user?.role === 'md';

  const rightAction = user?.role === 'branch_admin' ? (
    <button
      onClick={() => navigate('/money/schemes/builders/create')}
      type="button"
      aria-label="Enroll new plan"
      className="w-10 h-10 rounded-2xl bg-sky-600 flex items-center justify-center text-white shadow-md tactile-press"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  ) : isMD ? (
    <button
      onClick={() => navigate('/money/schemes/builders/incentives')}
      type="button"
      aria-label="Edit incentive rules"
      className="w-10 h-10 rounded-2xl bg-stone-700 flex items-center justify-center text-white shadow-md tactile-press"
    >
      <IndianRupee size={18} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes"
        title="Builders Scheme"
        subtitle="1 member · 60 months · house or cash"
        action={rightAction}
      />

      <SchemePendingBanner schemeCode="builders_scheme" />

      {/* Summary strip */}
      {summary && (
        <div className="px-4 mb-5">
          <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 grid grid-cols-4 divide-x divide-navy/5">
            {[
              { label: 'Invested',   val: formatCurrency(summary.totalInvested || 0),  cls: 'text-sky-600' },
              { label: 'Paid Out',   val: formatCurrency(summary.totalPaidOut   || 0),  cls: 'text-emerald-600' },
              { label: 'Active',     val: (summary.activePlans || 0) + (summary.coolingPlans || 0), cls: 'text-amber-600' },
              { label: 'Decision',   val: summary.decisionPendingPlans || 0,             cls: 'text-rose-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center px-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                <p className={`text-base font-bold mt-0.5 ${cls}`}>{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status filter chips */}
      <div className="px-4 mb-4">
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
          <div className="flex gap-1 w-max">
            {STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  statusFilter === key
                    ? 'bg-sky-600 text-white shadow-sm'
                    : 'bg-navy/5 text-navy/40 hover:text-navy/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Plans list */}
      <div className="px-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
          </div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-navy/5">
            <Building2 size={28} className="text-navy/20 mb-3" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No Plans Found</p>
            <p className="text-xs font-medium text-navy/40 mt-1">
              {user?.role === 'branch_admin'
                ? 'Tap + to enroll the first plan.'
                : 'No builders plans in your branch yet.'}
            </p>
          </div>
        ) : (
          plans.map(plan => {
            const colorClass    = PKG_COLORS[(plan.package_number - 1) % PKG_COLORS.length];
            const monthsLeft    = 60 - (plan.current_month || 0);
            const progress      = ((plan.current_month || 0) / 60) * 100;
            const isDecision    = plan.status === 'decision_pending';
            const isTerminal    = ['completed', 'cancelled'].includes(plan.status);

            return (
              <button
                key={plan.id}
                onClick={() => navigate(`/money/schemes/builders/${plan.id}`)}
                className="w-full bg-white rounded-3xl p-4 card-shadow border border-navy/5 text-left hover:border-sky-100 transition-colors tactile-press"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p className="text-sm font-bold text-navy truncate">
                        {plan.customer_name}
                      </p>
                      <span className={`shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider ${colorClass}`}>
                        {pkgLabel(plan.package_number)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-navy/50 flex-wrap">
                      <span>{formatCurrency(plan.investment_amount)} invested</span>
                      {!isTerminal && (
                        <>
                          <span>·</span>
                          <span>Month {plan.current_month || 0}/60</span>
                        </>
                      )}
                      {isDecision && (
                        <>
                          <span>·</span>
                          <span className="text-amber-600 font-bold">Choose reward</span>
                        </>
                      )}
                      {plan.reward_choice && (
                        <>
                          <span>·</span>
                          <span className="capitalize">{plan.reward_choice}</span>
                        </>
                      )}
                      {plan.referrer_name && (
                        <>
                          <span>·</span>
                          <span>via {plan.referrer_name.split(' ')[0]}</span>
                        </>
                      )}
                    </div>
                    {plan.customer_code && (
                      <p className="text-[9px] text-navy/30 mt-0.5">{plan.customer_code}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase tracking-wider ${STATUS_STYLES[plan.status] || 'bg-navy/5 text-navy/40'}`}>
                      {STATUS_LABELS[plan.status] || plan.status}
                    </span>
                    <ChevronRight size={14} className="text-navy/20" aria-hidden="true" />
                  </div>
                </div>

                {/* Progress bar — months paid out */}
                {!isTerminal && plan.current_month > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                    <p className="text-[9px] font-medium text-navy/30 mt-1">
                      {plan.current_month}/60 months paid · {monthsLeft} remaining
                    </p>
                  </div>
                )}

                {/* Cooling bar */}
                {plan.status === 'cooling' && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-blue-50 rounded-full" />
                    <p className="text-[9px] font-medium text-blue-600 shrink-0">
                      Cooling · starts {formatDate(plan.payout_start_date)}
                    </p>
                  </div>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Packages reference table */}
      {packages && (
        <div className="px-4 mt-8 mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
            Package Reference
          </p>
          <div className="bg-white rounded-2xl border border-navy/5 card-shadow overflow-hidden">
            <div className="grid grid-cols-4 text-[9px] font-bold uppercase tracking-wider text-navy/30 px-4 py-2.5 bg-navy/[0.02] border-b border-navy/5">
              <span>Plan</span>
              <span className="text-right">Investment</span>
              <span className="text-right">M1–60</span>
              <span className="text-right">M51–60 Total</span>
            </div>
            {Object.entries(packages).map(([num, pkg]) => (
              <div key={num} className="grid grid-cols-4 px-4 py-2.5 border-b border-navy/5 last:border-0">
                <span className="text-xs font-bold text-navy">
                  {(pkg.investmentAmount / 100_000)}L
                </span>
                <span className="text-xs font-medium text-navy/60 text-right">
                  {formatCurrency(pkg.investmentAmount)}
                </span>
                <span className="text-xs font-medium text-emerald-600 text-right">
                  {formatCurrency(pkg.monthlyPayout)}
                </span>
                <span className="text-xs font-medium text-sky-600 text-right">
                  {formatCurrency(pkg.monthlyPayout + (pkg.cashFinalMonthly || 0))}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[9px] font-medium text-navy/30 mt-2 text-center">
            M1–60 monthly continues for all 60 months · M51–60 cash = monthly + bonus · House option available at month 50
          </p>
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default BuildersSchemePage;
