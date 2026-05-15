// Commission breakdown panel shown below a scheme card on the SchemesPage hub.
// Fetches rules from the DB via RTK Query. Handles both fixed-amount (₹) and
// percentage-based (%) rules via the rate_type field added in migration 025.
import { Loader2, IndianRupee } from 'lucide-react';
import { useGetCommissionRulesQuery } from '../../../store/api/apiSlice';
import { COMMISSION_ROLE_LABELS, COMMISSION_ROLE_ORDER } from '../../../lib/schemeConstants';

export const CommissionPanel = ({ projectId }) => {
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
        <div key={rule.role} className="flex items-center justify-between">
          <span className="text-xs font-medium text-navy/60">
            {COMMISSION_ROLE_LABELS[rule.role] || rule.role}
          </span>
          {rule.rate_type === 'percent' ? (
            <span className="text-xs font-bold text-amber-600">{Number(rule.amount)}%</span>
          ) : (
            <span className="text-xs font-bold text-navy flex items-center gap-0.5">
              <IndianRupee size={10} aria-hidden="true" />
              {Number(rule.amount).toLocaleString('en-IN')}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};
