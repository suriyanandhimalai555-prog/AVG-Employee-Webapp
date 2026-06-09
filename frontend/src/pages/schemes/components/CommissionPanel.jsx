// Commission breakdown panel shown below a scheme card on the SchemesPage hub.
// Fetches rules from the DB via RTK Query. Handles both fixed-amount (₹) and
// percentage-based (%) rules via the rate_type field added in migration 025.
//
// MD and Director: see pencil icons → inline-edit each rate.
// All other roles: read-only view (unchanged behaviour).
import { useState } from 'react';
import { Loader2, IndianRupee, Edit2, Check, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useGetCommissionRulesQuery, useSetCommissionRuleMutation } from '../../../store/api/apiSlice';
import { COMMISSION_ROLE_LABELS, COMMISSION_ROLE_ORDER, SCHEME_INPUT_CLASS } from '../../../lib/schemeConstants';
import { selectCurrentUser } from '../../../store/slices/authSlice';

const EDIT_ROLES = new Set(['md', 'director', 'management']);

// ─── Inline-editable row ─────────────────────────────────────────────────────

const RuleRow = ({ rule, canEdit }) => {
  const [editing,   setEditing]   = useState(false);
  const [value,     setValue]     = useState('');
  const [rowError,  setRowError]  = useState('');
  const [setRule, { isLoading }]  = useSetCommissionRuleMutation();

  const startEdit = () => {
    setValue(String(Number(rule.amount)));
    setRowError('');
    setEditing(true);
  };

  const cancel = () => { setEditing(false); setRowError(''); };

  const save = async () => {
    const parsed = Number(value);
    if (isNaN(parsed) || parsed < 0) { setRowError('Enter a valid amount ≥ 0'); return; }
    setRowError('');
    try {
      await setRule({
        projectId: rule.project_id,
        role:      rule.role,
        amount:    parsed,
        rateType:  rule.rate_type,
      }).unwrap();
      setEditing(false);
    } catch (err) {
      setRowError(err?.data?.error?.message || 'Save failed');
    }
  };

  const label = COMMISSION_ROLE_LABELS[rule.role] || rule.role;

  if (editing) {
    return (
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-navy/60">{label}</span>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={value}
              onChange={e => setValue(e.target.value)}
              min="0"
              className="w-20 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
              autoFocus
            />
            <span className="text-[10px] text-navy/40">{rule.rate_type === 'percent' ? '%' : '₹'}</span>
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
              onClick={cancel}
              className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press"
              aria-label="Cancel"
            >
              <X size={10} />
            </button>
          </div>
        </div>
        {rowError && <p className="text-[9px] text-red-600 mt-0.5 text-right">{rowError}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-xs font-medium text-navy/60">{label}</span>
      <div className="flex items-center gap-1.5">
        {rule.rate_type === 'percent' ? (
          <span className="text-xs font-bold text-amber-600">{Number(rule.amount)}%</span>
        ) : (
          <span className="text-xs font-bold text-navy flex items-center gap-0.5">
            <IndianRupee size={10} aria-hidden="true" />
            {Number(rule.amount).toLocaleString('en-IN')}
          </span>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={startEdit}
            className="w-5 h-5 rounded-md bg-navy/5 flex items-center justify-center text-navy/30 hover:text-navy/60 tactile-press"
            aria-label={`Edit ${label} rate`}
          >
            <Edit2 size={9} />
          </button>
        )}
      </div>
    </div>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

export const CommissionPanel = ({ projectId }) => {
  const user    = useSelector(selectCurrentUser);
  const canEdit = EDIT_ROLES.has(user?.role);

  const { data: rules = [], isLoading } = useGetCommissionRulesQuery(projectId, { skip: !projectId });

  if (isLoading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="animate-spin text-navy/30" size={16} aria-hidden="true" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <p className="text-xs text-navy/30 text-center py-2 italic">No commission rates configured yet</p>
    );
  }

  const sorted = [...rules].sort(
    (a, b) => COMMISSION_ROLE_ORDER.indexOf(a.role) - COMMISSION_ROLE_ORDER.indexOf(b.role)
  );

  return (
    <div className="space-y-1.5 pt-1">
      {sorted.map((rule) => (
        <RuleRow key={rule.role} rule={rule} canEdit={canEdit} />
      ))}
    </div>
  );
};
