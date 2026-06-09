import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Plus, ChevronLeft, ChevronDown, ChevronUp, Edit2, Check, X, IndianRupee } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLandSiteQuery,
  useUpdateLandSiteMutation,
  useCreateLandLayoutPlotMutation,
  useUpdateLandPlotMutation,
  useUpdateLandLayoutMutation,
  useGetLandLayoutCommissionRulesQuery,
  useUpdateLandLayoutCommissionRuleMutation,
} from '../../store/api/apiSlice';
import { formatCurrency } from '../../lib/formatters';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { FormError } from './components/FormError';

const PLOT_STATUS_STYLES = {
  available: 'text-emerald-600 bg-emerald-50',
  booked:    'text-amber-700 bg-amber-50',
  completed: 'text-indigo bg-indigo/10',
  cancelled: 'text-red-500 bg-red-50',
};

const AddPlotForm = ({ layoutId, onSuccess }) => {
  const [form, setForm] = useState({ siteNumber: '', areaSqft: '', landCost: '', buybackBonusMonthly: '' });
  const [error, setError] = useState('');
  const set = createFormSetter(setForm);
  const [createPlot, { isLoading }] = useCreateLandLayoutPlotMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createPlot({
        layoutId,
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

// ─── Commission rules editor (inline, for MD / Management) ───────────────────

const LAND_ROLE_LABELS = {
  sales_officer: 'SO', abm: 'ABM', branch_manager: 'BM', gm: 'PILLARS (GM)',
};
const LAND_ROLE_ORDER = ['sales_officer', 'abm', 'branch_manager', 'gm'];

const LandCommissionRow = ({ layoutId, rule }) => {
  const [spot,    setSpot]    = useState(String(parseFloat(rule.spot_amount || 0)));
  const [monthly, setMonthly] = useState(String(parseFloat(rule.monthly_amount || 0)));
  const [months,  setMonths]  = useState(rule.monthly_months != null ? String(rule.monthly_months) : '');
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');
  const [updateRule] = useUpdateLandLayoutCommissionRuleMutation();

  const save = async () => {
    const s = Number(spot), m = Number(monthly);
    const mo = months !== '' ? parseInt(months, 10) : null;
    if (isNaN(s) || s < 0 || isNaN(m) || m < 0) { setErr('Enter valid amounts'); return; }
    setSaving(true); setErr('');
    try {
      await updateRule({ layoutId, role: rule.role, spotAmount: s, monthlyAmount: m, monthlyMonths: mo }).unwrap();
      setEditing(false);
    } catch (e) { setErr(e?.data?.error?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <tr className="hover:bg-navy/[0.01]">
      <td className="px-3 py-2.5 text-xs font-bold text-navy/70">{LAND_ROLE_LABELS[rule.role] || rule.role}</td>
      {editing ? (
        <>
          <td className="px-2 py-1.5">
            <input type="number" value={spot} onChange={e => setSpot(e.target.value)} min="0"
              className="w-20 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none" />
          </td>
          <td className="px-2 py-1.5">
            <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} min="0"
              className="w-20 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none" />
          </td>
          <td className="px-2 py-1.5">
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} min="1" max="120"
              placeholder="—"
              className="w-14 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none" />
          </td>
          <td className="px-2 py-1.5">
            <div className="flex gap-1">
              <button onClick={save} disabled={saving}
                className="w-6 h-6 rounded-lg bg-stone-700 text-white flex items-center justify-center disabled:opacity-50 tactile-press">
                {saving ? <Loader2 size={9} className="animate-spin" /> : <Check size={9} />}
              </button>
              <button onClick={() => { setEditing(false); setErr(''); }}
                className="w-6 h-6 rounded-lg bg-navy/5 text-navy/40 flex items-center justify-center tactile-press">
                <X size={9} />
              </button>
            </div>
            {err && <p className="text-[9px] text-red-600 mt-0.5">{err}</p>}
          </td>
        </>
      ) : (
        <>
          <td className="px-2 py-2.5 text-right">
            <div className="flex items-center justify-end gap-1 group">
              <span className="text-xs font-semibold text-navy">₹{Number(rule.spot_amount||0).toLocaleString('en-IN')}</span>
              <button onClick={() => setEditing(true)}
                className="w-5 h-5 rounded-md bg-navy/5 text-navy/30 opacity-0 group-hover:opacity-100 flex items-center justify-center tactile-press transition-opacity">
                <Edit2 size={9} />
              </button>
            </div>
          </td>
          <td className="px-2 py-2.5 text-right">
            <span className="text-xs font-semibold text-navy/60">
              {rule.monthly_amount > 0 ? `₹${Number(rule.monthly_amount).toLocaleString('en-IN')}` : '—'}
            </span>
          </td>
          <td className="px-2 py-2.5 text-right">
            <span className="text-xs text-navy/40">
              {rule.monthly_months != null ? `${rule.monthly_months}mo` : '—'}
            </span>
          </td>
          <td className="px-2 py-2.5"></td>
        </>
      )}
    </tr>
  );
};

const SiteCommissionPanel = ({ layoutId }) => {
  const { data: rules = [], isLoading } = useGetLandLayoutCommissionRulesQuery(layoutId);
  const [updateRule] = useUpdateLandLayoutCommissionRuleMutation();

  const sorted = [...rules].sort((a,b) => LAND_ROLE_ORDER.indexOf(a.role) - LAND_ROLE_ORDER.indexOf(b.role));

  return (
    <div className="bg-white rounded-xl border border-navy/5 overflow-x-auto">
      {isLoading ? (
        <div className="flex justify-center py-4"><Loader2 className="animate-spin text-navy/20" size={18} /></div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-navy/[0.02] border-b border-navy/5">
              <th className="px-3 py-2 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
              <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Spot (₹)</th>
              <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Monthly (₹)</th>
              <th className="px-2 py-2 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Months</th>
              <th className="px-2 py-2 w-16"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/5">
            {sorted.map(rule => (
              <LandCommissionRow key={rule.role} layoutId={layoutId} rule={rule} />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export const LandSiteDetailPage = () => {
  const { siteId } = useParams();
  const user       = useSelector(selectCurrentUser);
  const navigate   = useNavigate();
  const isSiteAdmin = isSchemeAdmin(user?.role);

  const [updatePlot] = useUpdateLandPlotMutation();
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

  const layouts = site.layouts || [];

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

      {/* Layouts section */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">
            Layouts · {layouts.length}
          </p>
          {isSiteAdmin && (
            <button type="button"
              onClick={() => navigate(`/money/schemes/land/sites/${siteId}/layouts/new`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-700 text-white text-[11px] font-bold tactile-press">
              <Plus size={12} aria-hidden="true" />
              Add Layout
            </button>
          )}
        </div>

        {layouts.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <p className="text-sm font-bold text-navy">No layouts yet</p>
            {isSiteAdmin && <p className="text-xs text-navy/40 mt-1">Tap "Add Layout" to define the first layout.</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {layouts.map(layout => (
              <LayoutCard
                key={layout.id}
                layout={layout}
                isSiteAdmin={isSiteAdmin}
                updatePlot={updatePlot}
              />
            ))}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

// ─── Layout card with plots + optional commission panel ───────────────────────

const LayoutCard = ({ layout, isSiteAdmin, updatePlot }) => {
  const [addingPlot, setAddingPlot] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState(null);
  const [plotEditForm, setPlotEditForm]   = useState({});
  const [plotEditError, setPlotEditError] = useState('');
  const [showCommission, setShowCommission] = useState(false);
  const [updatingPlot, setUpdatingPlot] = useState(false);
  const [updateLayoutMutation] = useUpdateLandLayoutMutation();
  const [editLayout, setEditLayout] = useState(false);

  const plots = layout.plots || [];

  const startEditPlot = (plot) => {
    setEditingPlotId(plot.id);
    setPlotEditForm({ landCost: plot.land_cost, buybackBonusMonthly: plot.buyback_bonus_monthly, status: plot.status });
    setPlotEditError('');
  };

  const saveEditPlot = async (plotId) => {
    setPlotEditError(''); setUpdatingPlot(true);
    try {
      await updatePlot({
        plotId,
        landCost:            Number(plotEditForm.landCost),
        buybackBonusMonthly: Number(plotEditForm.buybackBonusMonthly),
        status:              plotEditForm.status,
      }).unwrap();
      setEditingPlotId(null);
    } catch (err) { setPlotEditError(err?.data?.error?.message || 'Failed to update plot.'); }
    finally { setUpdatingPlot(false); }
  };

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden">
      {/* Layout header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy">{layout.layout_name || '(Unnamed Layout)'}</p>
          {layout.location_detail && (
            <p className="text-[10px] text-navy/40 mt-0.5">{layout.location_detail}</p>
          )}
          {/* Pricing row */}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            {layout.plot_price && (
              <span className="text-[10px] font-semibold text-stone-600">
                ₹{Number(layout.plot_price).toLocaleString('en-IN')} / plot
              </span>
            )}
            {layout.plot_size_sqft && (
              <span className="text-[10px] text-navy/40">{layout.plot_size_sqft} sqft</span>
            )}
            {layout.buyback_bonus_monthly && (
              <span className="text-[10px] text-emerald-600 font-medium">
                ₹{Number(layout.buyback_bonus_monthly).toLocaleString('en-IN')}/mo buyback × {layout.buyback_months || '?'} mo
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 flex flex-col items-end gap-1">
          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${layout.status === 'active' ? 'text-emerald-600 bg-emerald-50' : 'text-navy/30 bg-navy/5'}`}>
            {layout.status}
          </span>
          {/* Plot count badge — shows Management how many plots are ready to book */}
          <span className="text-[9px] font-semibold text-navy/50">
            {layout.available_plots ?? 0} avail / {layout.total_plots ?? 0} plots
          </span>
        </div>
      </div>

      {/* Plots */}
      {plots.length > 0 && (
        <div className="border-t border-navy/5 divide-y divide-navy/5">
          {plots.map(plot => (
            <div key={plot.id} className="px-4 py-2.5">
              {editingPlotId === plot.id && isSiteAdmin ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[9px] font-bold text-navy/30 mb-0.5">Land Cost (₹)</p>
                      <input type="number" value={plotEditForm.landCost}
                        onChange={e => setPlotEditForm(f => ({ ...f, landCost: e.target.value }))}
                        className={SCHEME_INPUT_CLASS} min="1" />
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-navy/30 mb-0.5">Buyback/mo (₹)</p>
                      <input type="number" value={plotEditForm.buybackBonusMonthly}
                        onChange={e => setPlotEditForm(f => ({ ...f, buybackBonusMonthly: e.target.value }))}
                        className={SCHEME_INPUT_CLASS} min="0" />
                    </div>
                  </div>
                  <select value={plotEditForm.status}
                    onChange={e => setPlotEditForm(f => ({ ...f, status: e.target.value }))}
                    className={SCHEME_INPUT_CLASS}>
                    {['available','booked','cancelled','completed'].map(s => <option key={s} value={s}>{s}</option>)}
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
                  <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    {plot.site_number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-navy">Plot {plot.site_number}
                      <span className="ml-1.5 text-[10px] font-normal text-navy/40">{plot.area_sqft} sqft</span>
                    </p>
                    <p className="text-[10px] text-navy/40">
                      {formatCurrency(plot.land_cost)}
                      {plot.buyback_bonus_monthly > 0 && ` · ₹${Number(plot.buyback_bonus_monthly).toLocaleString('en-IN')}/mo`}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${PLOT_STATUS_STYLES[plot.status] || 'bg-navy/5 text-navy/40'}`}>
                      {plot.status}
                    </span>
                    {isSiteAdmin && (
                      <button type="button" onClick={() => startEditPlot(plot)}
                        className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press">
                        <Edit2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Plot form */}
      {isSiteAdmin && (
        <div className="border-t border-navy/5 px-4 py-3">
          {addingPlot ? (
            <AddPlotForm layoutId={layout.id} onSuccess={() => setAddingPlot(false)} />
          ) : (
            <button type="button" onClick={() => setAddingPlot(true)}
              className="flex items-center gap-1.5 text-[10px] font-bold text-navy/50 hover:text-stone-700 tactile-press">
              <Plus size={11} /> Add Plot
            </button>
          )}
        </div>
      )}

      {/* Commission rules (Management/MD only) */}
      {isSiteAdmin && (
        <div className="border-t border-navy/5">
          <button type="button"
            onClick={() => setShowCommission(v => !v)}
            className="w-full px-4 py-2.5 flex items-center justify-between text-[10px] font-bold text-navy/40 hover:text-navy/60 transition-colors">
            <span className="flex items-center gap-1.5">
              <IndianRupee size={10} /> Commission Rules
            </span>
            {showCommission ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {showCommission && (
            <div className="px-4 pb-4">
              <SiteCommissionPanel layoutId={layout.id} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LandSiteDetailPage;
