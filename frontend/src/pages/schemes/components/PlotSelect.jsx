// PlotSelect — available-plot picker for the Land scheme booking form.
//
// Used by LandAddBookingPage. Fetches GET /land/plots?status=available and
// groups the results by "Site — Layout" in optgroups so branch admins can
// quickly orient themselves.
//
// Props:
//   value    — currently selected plot ID (string | '')
//   onChange — (plotId: string, plotObject: object | null) => void
//   layoutId — optional: restrict results to one specific layout

import { RotateCcw, AlertTriangle, Landmark, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useGetLandPlotsQuery } from '../../../store/api/apiSlice';
import { selectCurrentUser } from '../../../store/slices/authSlice';
import { isSchemeAdmin } from '../../../lib/schemeAuth';
import { formatCurrency } from '../../../lib/formatters';
import { SCHEME_INPUT_CLASS } from '../../../lib/schemeConstants';

export const PlotSelect = ({ value, onChange, layoutId, branchId }) => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canManage = isSchemeAdmin(user?.role); // Management or MD can add plots
  // Build the query params — always filter to 'available' status.
  // If a layoutId is provided (future: layout picker on the booking form),
  // narrow results to that layout only.
  const params = { status: 'available', limit: 500 };
  if (layoutId) params.layoutId = layoutId;

  const { data: plotsResult, isLoading, isError, refetch } = useGetLandPlotsQuery(
    params,
    // Refetch on mount and focus so a newly-added plot appears without hard reload
    { refetchOnMountOrArgChange: true, refetchOnFocus: true }
  );

  const plots = plotsResult?.data ?? [];

  // ── error state ───────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-100 rounded-2xl px-4 py-3 flex items-center gap-3">
        <AlertTriangle size={16} className="text-red-500 flex-shrink-0" aria-hidden="true" />
        <p className="text-xs font-semibold text-red-700 flex-1">Failed to load plots.</p>
        <button type="button" onClick={() => refetch()}
          className="flex items-center gap-1 text-xs font-bold text-red-700 underline underline-offset-2 tactile-press">
          <RotateCcw size={12} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  // ── empty state — no available plots at all ──────────────────────────────────
  // This happens when Management hasn't created individual plot records yet.
  // Plots live inside layouts on the Site Detail page (Sites → click a site →
  // expand a layout card → "Add Plot").
  if (!isLoading && plots.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4 space-y-2">
        <div className="flex items-start gap-3">
          <Landmark size={16} className="text-amber-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <p className="text-xs font-bold text-amber-800">
              No available plots{layoutId ? ' in this layout' : ''}
            </p>
            <p className="text-[10px] text-amber-700 mt-0.5">
              {canManage
                ? 'Go to Sites & Layouts, open a site, then click "Add Plot" inside a layout card to create bookable plots.'
                : 'Management needs to add plots to a layout before bookings can be created.'}
            </p>
          </div>
        </div>
        {/* Shortcut for Management — direct link to sites page */}
        {canManage && (
          <button
            type="button"
            onClick={() => navigate('/money/schemes/land/sites')}
            className="flex items-center gap-1.5 text-[10px] font-bold text-amber-700 hover:text-amber-900 tactile-press ml-7"
          >
            <ExternalLink size={10} />
            Open Sites & Layouts →
          </button>
        )}
      </div>
    );
  }

  // ── normal / loading state ────────────────────────────────────────────────────
  const handleChange = (e) => {
    const plotId = e.target.value;
    // Pass both the ID and the full plot object so the parent can show a preview card
    onChange(plotId, plots.find((p) => p.id === plotId) ?? null);
  };

  // Group plots by "Site — Layout" for the optgroup headings so branch admins
  // can easily see which development a plot belongs to
  const groups = {};
  for (const p of plots) {
    const groupKey = p.layout_name
      ? `${p.site_name} — ${p.layout_name}`
      : (p.site_name || 'Unknown Site');
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(p);
  }

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
      {/* Render each site/layout group as an optgroup */}
      {Object.entries(groups).map(([group, groupPlots]) => (
        <optgroup key={group} label={group}>
          {groupPlots.map((p) => (
            <option key={p.id} value={p.id}>
              Plot {p.site_number} — {formatCurrency(p.land_cost)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
};
