// frontend/src/pages/schemes/corrections/entryRows.jsx
// One-line summary renderers for an entry, one component per scheme.
// The scheme → component map is in ./entryRowRegistry.js; chip colours in ./statusStyles.js.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { formatCurrency, formatDate } from '../../../lib/formatters';

// ─── Entry row renderers ──────────────────────────────────────────────────────

export const EntryRowGold     = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}<span className="ml-1.5 text-[10px] text-navy/40">#{e.chit_number}</span></p>
    <p className="text-[11px] text-navy/40">{formatCurrency(e.monthly_amount)}/mo · {e.months_paid}/{e.total_months} paid · {formatDate(e.start_date)}</p>
  </div>
);
export const EntryRowTrading  = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">{formatDate(e.enrollment_date)} · {formatCurrency(e.amount)}</p>
  </div>
);
export const EntryRowBuilders = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">Pkg {e.package_number} · {formatDate(e.lump_sum_date)}</p>
  </div>
);
export const EntryRowGoldCoin = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || e.package_name || '—'}</p>
    <p className="text-[11px] text-navy/40">R{e.room_number} · {e.slots_held}/16 slots</p>
  </div>
);
export const EntryRowLss      = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || e.plan_name || '—'}</p>
    <p className="text-[11px] text-navy/40">R{e.room_number} · {e.slots_held}/20 slots</p>
  </div>
);
export const EntryRowLand     = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">{formatDate(e.booking_date)} · {e.payment_mode?.replace(/_/g, ' ')}</p>
  </div>
);
