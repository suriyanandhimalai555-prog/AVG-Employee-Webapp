// Read-only commission summary for the Builders scheme card on /money/schemes.
//
// Replaces CommissionPanel for builders_scheme because that scheme uses the
// builders_incentive_rules table (tier × role × type matrix) rather than the
// 1-D scheme_commission_rules used by every other scheme.
//
// Shows two compact tables:
//   One-time (enrollment) — SO / ABM / BM / GM × Tier 1–6
//   Monthly  (per payout) — SO only             × Tier 1–6

import { Loader2 } from 'lucide-react';
import { useGetBuildersIncentiveRulesQuery } from '../../../store/api/apiSlice';
import { COMMISSION_ROLE_LABELS } from '../../../lib/schemeConstants';

// ─── Constants ──────────────────────────────────────────────────────────────────

const TIER_LABELS     = ['₹5L', '₹10L', '₹15L', '₹20L', '₹25L', '₹30L'];
const ONE_TIME_ROLES  = ['sales_officer', 'abm', 'branch_manager', 'gm'];
const TIER_NUMBERS    = [1, 2, 3, 4, 5, 6];

// ─── Format helper ──────────────────────────────────────────────────────────────

function fmtAmount(n) {
  if (n === 0) return '—';
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(n % 100_000 === 0 ? 0 : 1)}L`;
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`;
  return `₹${n}`;
}

// ─── Build lookup matrix from flat rules array ──────────────────────────────────

function buildMatrix(rules) {
  const m = {};
  for (const r of rules) {
    const k = `${r.role}:${r.package_number}:${r.incentive_type}`;
    m[k] = Number(r.amount);
  }
  return m;
}

function get(matrix, role, pkg, type) {
  return matrix[`${role}:${pkg}:${type}`] ?? 0;
}

// ─── Mini matrix table ──────────────────────────────────────────────────────────

const MiniTable = ({ heading, rows, type, matrix }) => (
  <div className="mb-3 last:mb-0">
    <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30 mb-1.5">{heading}</p>
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full border-collapse min-w-max">
        <thead>
          <tr>
            <th className="text-left text-[8px] font-bold uppercase tracking-wider text-navy/30 pr-2 pb-1 w-8">
              Role
            </th>
            {TIER_LABELS.map(t => (
              <th key={t} className="text-right text-[8px] font-bold uppercase tracking-wider text-navy/30 px-1 pb-1">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(role => (
            <tr key={role}>
              <td className="text-[10px] font-semibold text-navy/60 pr-2 py-0.5 whitespace-nowrap">
                {COMMISSION_ROLE_LABELS[role] || role}
              </td>
              {TIER_NUMBERS.map(pkg => (
                <td key={pkg} className="text-right text-[10px] font-bold text-navy px-1 py-0.5 whitespace-nowrap">
                  {fmtAmount(get(matrix, role, pkg, type))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── Component ──────────────────────────────────────────────────────────────────

export const BuildersCommissionSummary = () => {
  const { data: rules = [], isLoading } = useGetBuildersIncentiveRulesQuery();

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="animate-spin text-navy/30" size={16} aria-hidden="true" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <p className="text-xs text-navy/30 text-center py-2 italic">
        No incentive rates configured yet
      </p>
    );
  }

  const matrix = buildMatrix(rules);

  return (
    <div className="space-y-1 pt-1">
      <MiniTable
        heading="One-time at enrollment"
        rows={ONE_TIME_ROLES}
        type="one_time"
        matrix={matrix}
      />
      <MiniTable
        heading="Monthly · SO only · 60 months"
        rows={['sales_officer']}
        type="monthly"
        matrix={matrix}
      />
    </div>
  );
};
