import { useState } from 'react';
import { Loader2, TrendingUp, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { useGetBranchReconciliationQuery } from '../../store/api/apiSlice';
import { formatCurrency } from '../../lib/formatters';

const STATUS_CHIP = {
  completed: { label: 'Done',    cls: 'text-emerald-600 bg-emerald-50' },
  exceeded:  { label: 'Over',    cls: 'text-amber-700  bg-amber-50' },
  pending:   { label: 'Pending', cls: 'text-navy/50    bg-navy/5' },
};

const SchemeRow = ({ row }) => {
  const chip = STATUS_CHIP[row.status] ?? STATUS_CHIP.pending;
  const pct  = Math.min(row.percent ?? 0, 100);
  return (
    <div className="py-3 border-b border-navy/5 last:border-0">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className="text-xs font-bold text-navy truncate flex-1">{row.schemeName}</p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.cls}`}>
          {chip.label}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 h-1.5 bg-navy/8 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${row.status === 'exceeded' ? 'bg-amber-400' : 'bg-emerald-400'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-navy/50 w-8 text-right">{Math.round(row.percent ?? 0)}%</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Expected', value: row.expected },
          { label: 'Entered',  value: row.collected },
          { label: 'Left',     value: row.remaining },
        ].map(({ label, value }) => (
          <div key={label} className="bg-navy/[0.02] rounded-xl px-2 py-1.5">
            <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
            <p className="text-xs font-bold text-navy mt-0.5">{formatCurrency(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// businessDate omitted (undefined) → server defaults to IST today
export const LiveReconciliationPanel = ({ branchId, businessDate }) => {
  const [expanded, setExpanded] = useState(false);
  // transformResponse strips the wrapper — data is already ReconciliationLine[]
  const { data, isLoading } = useGetBranchReconciliationQuery({ branchId, businessDate });
  const lines = data ?? [];

  const done     = lines.filter(l => l.status === 'completed').length;
  const over     = lines.filter(l => l.status === 'exceeded').length;
  const pending  = lines.filter(l => l.status === 'pending').length;
  const allDone  = lines.length > 0 && done === lines.length;

  return (
    <div className="px-6 mb-5">
      <div className={`rounded-2xl border overflow-hidden transition-colors ${allDone ? 'border-emerald-200 bg-emerald-50/60' : 'border-navy/8 bg-white'} card-shadow`}>

        {/* Compact header — always visible, click to toggle detail */}
        <button
          type="button"
          onClick={() => setExpanded(x => !x)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          {isLoading ? (
            <Loader2 size={15} className="animate-spin text-indigo flex-shrink-0" aria-hidden="true" />
          ) : allDone ? (
            <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" aria-hidden="true" />
          ) : (
            <TrendingUp size={15} className="text-indigo flex-shrink-0" aria-hidden="true" />
          )}

          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-navy">Today's Reconciliation</p>
            {!isLoading && lines.length > 0 && (
              <p className="text-[10px] font-medium text-navy/50 mt-0.5">
                {done > 0 && <span className="text-emerald-600">{done} done</span>}
                {done > 0 && (over > 0 || pending > 0) && <span className="text-navy/30"> · </span>}
                {over > 0 && <span className="text-amber-600">{over} over</span>}
                {over > 0 && pending > 0 && <span className="text-navy/30"> · </span>}
                {pending > 0 && <span>{pending} pending</span>}
              </p>
            )}
          </div>

          {expanded
            ? <ChevronUp  size={14} className="text-navy/30 flex-shrink-0" aria-hidden="true" />
            : <ChevronDown size={14} className="text-navy/30 flex-shrink-0" aria-hidden="true" />}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="border-t border-navy/5 px-4">
            {isLoading ? (
              <div className="flex justify-center py-5">
                <Loader2 className="animate-spin text-indigo" size={18} aria-hidden="true" />
              </div>
            ) : lines.length === 0 ? (
              <p className="py-4 text-xs text-navy/40">No declared scheme lines for today.</p>
            ) : (
              lines.map(row => <SchemeRow key={row.schemeCode} row={row} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveReconciliationPanel;
