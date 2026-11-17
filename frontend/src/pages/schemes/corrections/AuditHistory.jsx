// frontend/src/pages/schemes/corrections/AuditHistory.jsx
// Collapsible log of recent corrections for the selected scheme.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import { Loader2, ChevronDown, ChevronUp, History } from 'lucide-react';
import { useGetSchemeAuditLogQuery } from '../../../store/api/apiSlice';
import { formatDate } from '../../../lib/formatters';

// ─── Audit history ────────────────────────────────────────────────────────────

const ACTION_STYLES = {
  void:   'bg-red-50 text-red-600',
  unpay:  'bg-amber-50 text-amber-700',
  remove: 'bg-orange-50 text-orange-600',
  edit:   'bg-blue-50 text-blue-700',
  delete: 'bg-red-100 text-red-700',
};

export const AuditHistory = ({ schemeCode }) => {
  const [open, setOpen] = useState(false);
  const { data: auditRows, isLoading } = useGetSchemeAuditLogQuery(
    { schemeCode, limit: 50 },
    { skip: !open || !schemeCode }
  );

  return (
    <div className="border-t border-border pt-4 mt-6">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-bold text-navy/50 tactile-press hover:text-navy/80">
        <History size={14} />
        Correction Audit History
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-navy/30" size={20} /></div>}
          {!isLoading && (!auditRows || auditRows.length === 0) && (
            <p className="text-xs text-navy/40 text-center py-4">No corrections recorded yet.</p>
          )}
          {!isLoading && auditRows?.map((row) => (
            <div key={row.id} className="bg-white rounded-xl px-4 py-3 border border-border space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${ACTION_STYLES[row.action] ?? 'bg-navy/5 text-navy/40'}`}>
                  {row.action}
                </span>
                <span className="text-[10px] text-navy/40">{formatDate(row.created_at)}</span>
              </div>
              <p className="text-xs font-medium text-navy">{row.entity_type} · {row.actor_name}</p>
              {row.old_values?.notes !== row.new_values?.notes && row.new_values?.notes && (
                <p className="text-[10px] text-navy/40">
                  Notes: <span className="line-through">{row.old_values?.notes || '—'}</span>{' → '}{row.new_values?.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
