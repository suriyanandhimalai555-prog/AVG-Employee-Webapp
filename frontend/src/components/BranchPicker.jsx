// Reusable branch selector for the management role.
//
// Management has no branch_id on their account — they must explicitly choose
// which branch's data they are entering. This component fetches the full branch
// list and renders a <select> so the parent can pass the selected branchId into
// scheme create/record payloads.
//
// Props:
//   value      string | ''   — selected branch UUID
//   onChange   (branchId) => void
//   className  string        — optional extra classes (defaults to SCHEME_INPUT_CLASS)
//   required   bool          — passes required to the <select>

import { Loader2, AlertTriangle } from 'lucide-react';
import { useGetBranchesQuery } from '../store/api/apiSlice';
import { SCHEME_INPUT_CLASS } from '../lib/schemeConstants';

export const BranchPicker = ({ value, onChange, className, required = true }) => {
  const { data: branches = [], isLoading, isError, refetch } = useGetBranchesQuery();

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <AlertTriangle size={15} className="text-red-500 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-red-700 flex-1">Could not load branches.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs font-bold text-red-700 underline underline-offset-2 tactile-press"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={isLoading}
      className={className ?? SCHEME_INPUT_CLASS}
      required={required}
    >
      <option value="">
        {isLoading ? 'Loading branches…' : 'Select branch…'}
      </option>
      {branches.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
};
