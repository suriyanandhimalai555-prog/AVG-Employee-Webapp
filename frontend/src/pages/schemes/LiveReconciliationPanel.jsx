import { Loader2, TrendingUp } from 'lucide-react';
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

// branchId and businessDate are passed from SchemesPage — no need to re-fetch settings.
// businessDate omitted (undefined) means the server uses IST today.
export const LiveReconciliationPanel = ({ branchId, businessDate }) => {
  // transformResponse strips the { success, data } wrapper — data is already ReconciliationLine[]
  const { data, isLoading } = useGetBranchReconciliationQuery({ branchId, businessDate });
  const lines = data ?? [];

  return (
    <div className="px-6 mb-6">
      <div className="bg-white rounded-3xl border border-navy/8 card-shadow overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-navy/5 flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo" aria-hidden="true" />
          <p className="text-sm font-bold text-navy">Today's Reconciliation</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="animate-spin text-indigo" size={20} aria-hidden="true" />
          </div>
        ) : lines.length === 0 ? (
          <p className="px-4 py-5 text-xs text-navy/40">No scheme lines declared for today.</p>
        ) : (
          <div className="px-4">
            {lines.map(row => <SchemeRow key={row.schemeCode} row={row} />)}
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveReconciliationPanel;
