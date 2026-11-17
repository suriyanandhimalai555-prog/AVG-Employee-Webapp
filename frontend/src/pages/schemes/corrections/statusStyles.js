// frontend/src/pages/schemes/corrections/statusStyles.js
// Status-chip colours for entries in the Corrections Center, per scheme.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { GOLD_STATUS_STYLES } from '../../../lib/schemeConstants';

const BUILDERS_STATUS_STYLES = {
  cooling: 'bg-blue-50 text-blue-600', active: 'bg-emerald-50 text-emerald-700',
  decision_pending: 'bg-amber-50 text-amber-700', house: 'bg-sky-50 text-sky-700',
  cash: 'bg-violet-50 text-violet-700', completed: 'bg-indigo/10 text-indigo',
  cancelled: 'bg-red-50 text-red-500', voided: 'bg-gray-100 text-gray-500',
};
const GC_STATUS = {
  filling: 'bg-blue-50 text-blue-600', pending_combine: 'bg-amber-50 text-amber-700',
  combined_into: 'bg-navy/5 text-navy/60', expired: 'bg-red-50 text-red-600',
  active: 'bg-emerald-50 text-emerald-700', completed: 'bg-indigo/10 text-indigo',
  voided: 'bg-gray-100 text-gray-500',
};

export const statusStyleFor = (code, status) => {
  if (!status) return 'bg-navy/5 text-navy/40';
  if (status === 'voided') return 'bg-gray-100 text-gray-500';
  if (code === 'gold_scheme')     return GOLD_STATUS_STYLES[status] ?? 'bg-navy/5 text-navy/40';
  if (code === 'builders_scheme') return BUILDERS_STATUS_STYLES[status] ?? 'bg-navy/5 text-navy/40';
  if (code === 'gold_coin_scheme' || code === 'lss_scheme') return GC_STATUS[status] ?? 'bg-navy/5 text-navy/40';
  if (status === 'active' || status === 'forming') return 'bg-emerald-50 text-emerald-700';
  if (status === 'cancelled' || status === 'expired') return 'bg-red-50 text-red-500';
  if (status === 'completed') return 'bg-indigo/10 text-indigo';
  return 'bg-navy/5 text-navy/40';
};
