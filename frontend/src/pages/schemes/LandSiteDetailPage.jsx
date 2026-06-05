import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Plus, ChevronLeft, Edit2, Check, X } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLandSiteQuery,
  useUpdateLandSiteMutation,
  useCreateLandPlotMutation,
  useUpdateLandPlotMutation,
} from '../../store/api/apiSlice';
import { formatCurrency } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { FormError } from './components/FormError';

const PLOT_STATUS_STYLES = {
  available: 'text-emerald-600 bg-emerald-50',
  booked:    'text-amber-700 bg-amber-50',
  completed: 'text-indigo bg-indigo/10',
  cancelled: 'text-red-500 bg-red-50',
};

const AddPlotForm = ({ siteId, onSuccess }) => {
  const [form, setForm] = useState({ siteNumber: '', areaSqft: '', landCost: '', buybackBonusMonthly: '' });
  const [error, setError] = useState('');
  const set = createFormSetter(setForm);
  const [createPlot, { isLoading }] = useCreateLandPlotMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createPlot({
        siteId,
        siteNumber:          form.siteNumber.trim(),
        areaSqft:            Number(form.areaSqft),
        landCost:            Number(form.landCost),
        buybackBonusMonthly: Number(form.buybackBonusMonthly),
      }).unwrap();
      setForm({ siteNumber: '', areaSqft: '', landCost: '', buybackBonusMonthly: '' });
      onSuccess?.();
    } catch (err) {
      setError(err?.data?.error?.message || err?.data?.message || 'Failed to add plot.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-stone-50 border border-stone-100 rounded-2xl p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-600">Add Plot</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">Site Number *</p>
          <input type="text" value={form.siteNumber} onChange={set('siteNumber')}
            placeholder="e.g. 81A" className={SCHEME_INPUT_CLASS} required />
        </div>
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">Area (sqft) *</p>
          <input type="number" value={form.areaSqft} onChange={set('areaSqft')}
            placeholder="e.g. 1200" min="1" className={SCHEME_INPUT_CLASS} required />
        </div>
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">Land Cost (₹) *</p>
          <input type="number" value={form.landCost} onChange={set('landCost')}
            placeholder="e.g. 500000" min="1" className={SCHEME_INPUT_CLASS} required />
        </div>
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">Buyback/month (₹)</p>
          <input type="number" value={form.buybackBonusMonthly} onChange={set('buybackBonusMonthly')}
            placeholder="e.g. 5000" min="0" className={SCHEME_INPUT_CLASS} />
        </div>
      </div>
      <FormError error={error} />
      <button type="submit" disabled={isLoading}
        className="w-full py-3 rounded-2xl bg-stone-700 text-white text-sm font-bold disabled:opacity-50 tactile-press">
        {isLoading ? 'Adding…' : 'Add Plot'}
      </button>
    </form>
  );
};

export const LandSiteDetailPage = () => {
  const { siteId } = useParams();
  const user       = useSelector(selectCurrentUser);
  const navigate   = useNavigate();
  const isMD       = user?.role === 'md';

  const [showAddPlot, setShowAddPlot] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState(null);
  const [plotEditForm, setPlotEditForm]   = useState({});
  const [plotEditError, setPlotEditError] = useState('');
  const [updatePlot, { isLoading: updatingPlot }] = useUpdateLandPlotMutation();

  const { data: site, isLoading } = useGetLandSiteQuery(siteId);

  if (isLoading) {
    return (
      <SchemePageWrapper>
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-stone-400" size={28} aria-hidden="true" />
        </div>
      </SchemePageWrapper>
    );
  }
  if (!site) {
    return (
      <SchemePageWrapper>
        <div className="px-4 pt-10 text-center">
          <p className="text-sm font-bold text-navy">Site not found.</p>
          <button onClick={() => navigate('/money/schemes/land/sites')}
            className="mt-4 text-xs font-bold text-stone-600 underline">← Sites</button>
        </div>
      </SchemePageWrapper>
    );
  }

  const plots = site.plots || [];

  const startEditPlot = (plot) => {
    setEditingPlotId(plot.id);
    setPlotEditForm({
      landCost: plot.land_cost,
      buybackBonusMonthly: plot.buyback_bonus_monthly,
      status: plot.status,
    });
    setPlotEditError('');
  };

  const saveEditPlot = async (plotId) => {
    setPlotEditError('');
    try {
      await updatePlot({
        plotId,
        landCost:            Number(plotEditForm.landCost),
        buybackBonusMonthly: Number(plotEditForm.buybackBonusMonthly),
        status:              plotEditForm.status,
      }).unwrap();
      setEditingPlotId(null);
    } catch (err) {
      setPlotEditError(err?.data?.error?.message || 'Failed to update plot.');
    }
  };

  return (
    <SchemePageWrapper>
      {/* Header */}
      <div className="px-4 mb-4 flex items-center gap-3">
        <button onClick={() => navigate('/money/schemes/land/sites')}
          className="w-9 h-9 rounded-2xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press flex-shrink-0"
          aria-label="Back">
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-navy truncate">{site.name}</h2>
          {site.layout_name && (
            <p className="text-[11px] font-medium text-navy/40">{site.layout_name}</p>
          )}
        </div>
        <span className={`px-2 py-1 rounded-lg text-[9px] font-bold uppercase flex-shrink-0 ${site.status === 'active' ? 'text-emerald-600 bg-emerald-50' : 'text-red-500 bg-red-50'}`}>
          {site.status}
        </span>
      </div>

      {/* Site details card */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-2xl p-4 card-shadow border border-navy/5 space-y-2">
          {[
            { label: 'Location',    val: site.location },
            { label: 'Address',     val: site.address },
            { label: 'State',       val: site.state },
            { label: 'Loan Option', val: site.loan_enabled ? '✓ Enabled' : '✗ Disabled' },
          ].filter(i => i.val).map(({ label, val }) => (
            <div key={label} className="flex items-baseline gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-navy/30 w-20 flex-shrink-0">{label}</p>
              <p className="text-xs font-medium text-navy">{val}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Plots section */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">
            Plots · {plots.length}
          </p>
          {isMD && (
            <button type="button" onClick={() => setShowAddPlot(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-700 text-white text-[11px] font-bold tactile-press">
              <Plus size={12} aria-hidden="true" />
              Add Plot
            </button>
          )}
        </div>

        {isMD && showAddPlot && (
          <div className="mb-4">
            <AddPlotForm siteId={siteId} onSuccess={() => setShowAddPlot(false)} />
          </div>
        )}

        {plots.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <p className="text-sm font-bold text-navy">No plots yet</p>
            {isMD && <p className="text-xs text-navy/40 mt-1">Tap "Add Plot" to create the first plot.</p>}
          </div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden divide-y divide-navy/5">
            {plots.map(plot => (
              <div key={plot.id} className="px-4 py-3">
                {editingPlotId === plot.id && isMD ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-[9px] font-bold text-navy/30 mb-0.5">Land Cost (₹)</p>
                        <input type="number" value={plotEditForm.landCost}
                          onChange={e => setPlotEditForm(f => ({ ...f, landCost: e.target.value }))}
                          className={SCHEME_INPUT_CLASS} min="1" />
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-navy/30 mb-0.5">Buyback/month (₹)</p>
                        <input type="number" value={plotEditForm.buybackBonusMonthly}
                          onChange={e => setPlotEditForm(f => ({ ...f, buybackBonusMonthly: e.target.value }))}
                          className={SCHEME_INPUT_CLASS} min="0" />
                      </div>
                    </div>
                    <select value={plotEditForm.status}
                      onChange={e => setPlotEditForm(f => ({ ...f, status: e.target.value }))}
                      className={SCHEME_INPUT_CLASS}>
                      {['available','booked','cancelled','completed'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                    {plotEditError && <p className="text-xs text-red-600">{plotEditError}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => saveEditPlot(plot.id)} disabled={updatingPlot}
                        className="flex-1 py-2 rounded-xl bg-stone-700 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
                        <Check size={12} /> Save
                      </button>
                      <button onClick={() => setEditingPlotId(null)}
                        className="px-4 py-2 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {plot.site_number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy">
                        Plot {plot.site_number}
                        <span className="ml-2 text-[10px] font-normal text-navy/40">{plot.area_sqft} sqft</span>
                      </p>
                      <p className="text-[11px] text-navy/40">
                        {formatCurrency(plot.land_cost)} · ₹{Number(plot.buyback_bonus_monthly).toLocaleString('en-IN')}/mo buyback
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${PLOT_STATUS_STYLES[plot.status] || 'bg-navy/5 text-navy/40'}`}>
                        {plot.status}
                      </span>
                      {isMD && (
                        <button type="button" onClick={() => startEditPlot(plot)}
                          className="w-7 h-7 rounded-xl bg-navy/5 flex items-center justify-center text-navy/40 tactile-press">
                          <Edit2 size={11} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default LandSiteDetailPage;
