// Decoupled available-plot picker for the Land scheme booking form.
//
// Fetches GET /land/plots?status=available on mount AND on window focus so a plot
// the MD just created in another session appears without a hard reload.
// Surfaces loading, empty, and error states explicitly — the parent form never
// needs to reach into RTK Query itself.
//
// Props
//   value     — currently selected plot ID (string | '')
//   onChange  — (plotId: string, plotObject: object | null) => void
//               plotObject is null when the selection is cleared.

import { RotateCcw, AlertTriangle, Landmark } from 'lucide-react';
import { useGetLandPlotsQuery } from '../../../store/api/apiSlice';
import { formatCurrency } from '../../../lib/formatters';
import { SCHEME_INPUT_CLASS } from '../../../lib/schemeConstants';

export const PlotSelect = ({ value, onChange }) => {
  const {
    data: plotsResult,
    isLoading,
    isError,
    refetch,
  } = useGetLandPlotsQuery(
    { status: 'available', limit: 500 },
    // Force a fresh network request every time this component mounts (navigating
    // to the booking page) and whenever the window regains focus (switching tabs
    // back from the MD's site-management session).
    { refetchOnMountOrArgChange: true, refetchOnFocus: true }
  );

  const plots = plotsResult?.data ?? [];

  // ── error state ──────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <AlertTriangle size={16} className="text-red-500 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-red-700 flex-1">Failed to load plots.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1 text-xs font-bold text-red-700 underline underline-offset-2 tactile-press"
        >
          <RotateCcw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  // ── empty state (loaded, but no available plots) ──────────────────────────────
  if (!isLoading && plots.length === 0) {
    return (
      <div className="bg-stone-50 border border-stone-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <Landmark size={16} className="text-stone-400 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-stone-600">
          No available plots yet — ask the MD to add plots to a site.
        </p>
      </div>
    );
  }

  // ── normal / loading state ────────────────────────────────────────────────────
  const handleChange = (e) => {
    const plotId = e.target.value;
    const plot   = plots.find((p) => p.id === plotId) ?? null;
    onChange(plotId, plot);
  };

  return (
    <select
      value={value}
      onChange={handleChange}
      disabled={isLoading}
      className={SCHEME_INPUT_CLASS}
      required
    >
      <option value="">
        {isLoading ? 'Loading plots…' : 'Select an available plot…'}
      </option>
      {plots.map((p) => (
        <option key={p.id} value={p.id}>
          {p.site_number} — {p.site_name}
          {p.layout_name ? ` (${p.layout_name})` : ''} — {formatCurrency(p.land_cost)}
        </option>
      ))}
    </select>
  );
};
