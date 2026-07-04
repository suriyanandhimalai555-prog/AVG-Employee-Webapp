// MD-only editor for the Builders Scheme tiered employee incentive matrix.
//
// Two matrices rendered on one page:
//   One-time (enrollment) — SO / ABM / BM / GM × Tier 1–6
//   Monthly  (per payout) — SO only           × Tier 1–6
//
// Each cell is inline-editable: click the pencil, edit the ₹ value, Save.
// Mirrors the pattern in LandSiteDetailPage for inline plot editing.

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Loader2, Edit2, Check, X, ShieldCheck, IndianRupee } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetBuildersIncentiveRulesQuery,
  useUpdateBuildersIncentiveRuleMutation,
} from '../../store/api/apiSlice';
import { SCHEME_INPUT_CLASS } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

// ─── Constants ─────────────────────────────────────────────────────────────────

const TIER_LABELS   = ['₹5L', '₹10L', '₹15L', '₹20L', '₹25L', '₹30L'];
const ONE_TIME_ROLES = [
  { key: 'sales_officer',  label: 'SO'  },
  { key: 'abm',            label: 'ABM' },
  { key: 'branch_manager', label: 'BM'  },
  { key: 'gm',             label: 'GM'  },
];

// ─── Build a lookup from the flat rules array ──────────────────────────────────
// Returns amount at rules[role][packageNumber][type]
function buildMatrix(rules) {
  const m = {};
  for (const r of rules) {
    if (!m[r.role]) m[r.role] = {};
    if (!m[r.role][r.package_number]) m[r.role][r.package_number] = {};
    m[r.role][r.package_number][r.incentive_type] = Number(r.amount);
  }
  return m;
}

// ─── Inline cell component ─────────────────────────────────────────────────────

const RuleCell = ({ packageNumber, role, incentiveType, amount }) => {
  const [editing,  setEditing]  = useState(false);
  const [value,    setValue]    = useState('');
  const [error,    setError]    = useState('');
  const [updateRule, { isLoading }] = useUpdateBuildersIncentiveRuleMutation();

  const startEdit = () => {
    setValue(String(amount));
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setError('');
  };

  const save = async () => {
    const parsed = Number(value);
    if (isNaN(parsed) || parsed < 0) { setError('Enter a valid amount ≥ 0'); return; }
    setError('');
    try {
      await updateRule({ packageNumber, role, incentiveType, amount: parsed }).unwrap();
      setEditing(false);
    } catch (err) {
      setError(err?.data?.error?.message || 'Save failed');
    }
  };

  if (editing) {
    return (
      <td className="px-2 py-2 min-w-[110px]">
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            onChange={e => setValue(e.target.value)}
            min="0"
            className="w-20 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
            autoFocus
          />
          <button
            type="button"
            onClick={save}
            disabled={isLoading}
            className="w-6 h-6 rounded-lg bg-stone-700 flex items-center justify-center text-white disabled:opacity-50 tactile-press"
            aria-label="Save"
          >
            {isLoading ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          </button>
          <button
            type="button"
            onClick={cancelEdit}
            className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press"
            aria-label="Cancel"
          >
            <X size={10} />
          </button>
        </div>
        {error && <p className="text-[9px] text-red-600 mt-0.5">{error}</p>}
      </td>
    );
  }

  return (
    <td className="px-2 py-2 text-right">
      <div className="flex items-center justify-end gap-1">
        <span className="text-xs font-semibold text-navy">
          ₹{Number(amount).toLocaleString('en-IN')}
        </span>
        <button
          type="button"
          onClick={startEdit}
          className="w-5 h-5 rounded-md bg-navy/5 flex items-center justify-center text-navy/30 hover:text-navy/60 tactile-press"
          aria-label={`Edit Tier ${packageNumber} ${role} ${incentiveType}`}
        >
          <Edit2 size={9} />
        </button>
      </div>
    </td>
  );
};

// ─── Matrix table ──────────────────────────────────────────────────────────────

const IncentiveMatrix = ({ title, rows, incentiveType, matrix, isLoading }) => (
  <div className="px-4 mb-8">
    <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">{title}</p>
    <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="animate-spin text-navy/20" size={24} aria-hidden="true" />
        </div>
      ) : (
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-navy/[0.02] border-b border-border">
              <th className="px-3 py-2.5 text-[9px] font-bold uppercase tracking-wider text-navy/30 w-16">Role</th>
              {TIER_LABELS.map((t, i) => (
                <th key={i} className="px-2 py-2.5 text-[9px] font-bold uppercase tracking-wider text-navy/30 text-right">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ key: role, label }) => (
              <tr key={role} className="hover:bg-navy/[0.01]">
                <td className="px-3 py-2.5 text-xs font-bold text-navy/70">{label}</td>
                {[1, 2, 3, 4, 5, 6].map(pkg => (
                  <RuleCell
                    key={pkg}
                    packageNumber={pkg}
                    role={role}
                    incentiveType={incentiveType}
                    amount={matrix[role]?.[pkg]?.[incentiveType] ?? 0}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
    <p className="text-[9px] font-medium text-navy/30 mt-1.5 px-1 flex items-center gap-1">
      <IndianRupee size={8} aria-hidden="true" /> Tap the pencil next to any cell to edit. Changes save immediately.
    </p>
  </div>
);

// ─── Page ──────────────────────────────────────────────────────────────────────

export const BuildersIncentiveRulesPage = () => {
  const user = useSelector(selectCurrentUser);

  const { data: rules = [], isLoading } = useGetBuildersIncentiveRulesQuery(undefined, {
    skip: user?.role !== 'md',
  });

  if (user?.role !== 'md') {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/builders" title="Incentive Rules" />
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
            <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">MD access only</p>
            <p className="text-xs text-navy/40 mt-1">Only the MD can view or edit incentive rules.</p>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  const matrix = buildMatrix(rules);

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/builders"
        title="Incentive Rules"
        subtitle="Builders · per tier · per role · editable"
      />

      {/* Context note */}
      <div className="px-4 mb-5">
        <div className="bg-stone-50 border border-stone-100 rounded-2xl p-3 text-xs text-stone-600 space-y-0.5">
          <p><span className="font-bold">One-time:</span> credited to SO → GM chain at enrollment.</p>
          <p><span className="font-bold">Monthly:</span> credited to the SO each time a customer payout is recorded (max 60).</p>
          <p className="text-stone-400">Plans without a referrer generate no employee incentives.</p>
        </div>
      </div>

      <IncentiveMatrix
        title="One-Time (Enrollment) — SO / ABM / BM / GM"
        rows={ONE_TIME_ROLES}
        incentiveType="one_time"
        matrix={matrix}
        isLoading={isLoading}
      />

      <IncentiveMatrix
        title="Monthly (Per Customer Payout) — SO Only"
        rows={[{ key: 'sales_officer', label: 'SO' }]}
        incentiveType="monthly"
        matrix={matrix}
        isLoading={isLoading}
      />
    </SchemePageWrapper>
  );
};

export default BuildersIncentiveRulesPage;
