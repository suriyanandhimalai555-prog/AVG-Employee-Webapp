import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ShieldCheck, Loader2, Check, X, IndianRupee } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useCreateLandLayoutMutation,
  useUpdateLandLayoutCommissionRuleMutation,
} from '../../store/api/apiSlice';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';

const ROLES = [
  { key: 'sales_officer',  label: 'SO (Sales Officer)'    },
  { key: 'abm',            label: 'ABM'                    },
  { key: 'branch_manager', label: 'BM (Branch Manager)'   },
  { key: 'gm',             label: 'PILLARS (GM)'           },
];

const INITIAL_LAYOUT_FORM = {
  layoutName: '', locationDetail: '', plotPrice: '', plotSizeSqft: '',
  pricePerSqft: '', buybackBonusMonthly: '', buybackMonths: '60',
  incentiveType: 'spot_commission',
};

const INITIAL_COMMISSIONS = {
  sales_officer:  { spot: '', monthly: '', months: '60' },
  abm:            { spot: '', monthly: '', months: '' },
  branch_manager: { spot: '', monthly: '', months: '' },
  gm:             { spot: '', monthly: '', months: '' },
};

export const LandAddLayoutPage = () => {
  const { siteId } = useParams();
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [layoutForm, setLayoutForm] = useState(INITIAL_LAYOUT_FORM);
  const [commissions, setCommissions] = useState(INITIAL_COMMISSIONS);
  const [error,  setError]  = useState('');
  const [done,   setDone]   = useState(false);
  const [step,   setStep]   = useState(1); // 1=layout details, 2=commissions
  const [createdLayout, setCreatedLayout] = useState(null);
  const setLayout = createFormSetter(setLayoutForm);

  const [createLayout, { isLoading: creating }] = useCreateLandLayoutMutation();
  const [updateCommissionRule] = useUpdateLandLayoutCommissionRuleMutation();
  const [savingComm, setSavingComm] = useState(false);

  if (!isSchemeAdmin(user?.role)) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo={`/money/schemes/land/sites/${siteId}`} title="Add Layout" />
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
            <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" />
            <p className="text-sm font-bold text-navy">Admin only</p>
            <p className="text-xs text-navy/40 mt-1">Only MD or Management can create layouts.</p>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  if (done) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo={`/money/schemes/land/sites/${siteId}`} title="Add Layout" />
        <div className="px-4 pt-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto mb-3">
            <Check size={28} className="text-emerald-600" />
          </div>
          <p className="text-lg font-bold text-navy">Layout Created</p>
          <p className="text-sm text-navy/50 mt-1">{createdLayout?.layout_name || '(unnamed layout)'}</p>
          <div className="mt-6 space-y-3">
            <button type="button" onClick={() => navigate(`/money/schemes/land/sites/${siteId}`)}
              className="w-full py-3.5 rounded-2xl bg-stone-700 text-white text-sm font-bold tactile-press">
              View Site
            </button>
            <button type="button"
              onClick={() => { setLayoutForm(INITIAL_LAYOUT_FORM); setCommissions(INITIAL_COMMISSIONS); setDone(false); setStep(1); setCreatedLayout(null); }}
              className="w-full py-3 rounded-2xl bg-stone-100 text-stone-700 text-sm font-bold tactile-press">
              Add Another Layout
            </button>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  const handleCreateLayout = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await createLayout({
        siteId,
        layoutName:          layoutForm.layoutName.trim() || undefined,
        locationDetail:      layoutForm.locationDetail.trim() || undefined,
        plotPrice:           layoutForm.plotPrice       ? Number(layoutForm.plotPrice)            : undefined,
        plotSizeSqft:        layoutForm.plotSizeSqft    ? Number(layoutForm.plotSizeSqft)         : undefined,
        pricePerSqft:        layoutForm.pricePerSqft    ? Number(layoutForm.pricePerSqft)         : undefined,
        buybackBonusMonthly: layoutForm.buybackBonusMonthly ? Number(layoutForm.buybackBonusMonthly) : undefined,
        buybackMonths:       layoutForm.buybackMonths   ? Number(layoutForm.buybackMonths)        : undefined,
        incentiveType:       layoutForm.incentiveType,
      }).unwrap();
      setCreatedLayout(res);
      setStep(2);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to create layout.');
    }
  };

  const handleSaveCommissions = async (e) => {
    e.preventDefault();
    setError('');
    setSavingComm(true);
    try {
      for (const role of ROLES.map(r => r.key)) {
        const c = commissions[role];
        const spot    = Number(c.spot)    || 0;
        const monthly = Number(c.monthly) || 0;
        const months  = c.months !== '' ? parseInt(c.months, 10) : null;
        if (spot > 0 || monthly > 0) {
          await updateCommissionRule({
            layoutId:      createdLayout.id,
            role,
            spotAmount:    spot,
            monthlyAmount: monthly,
            monthlyMonths: monthly > 0 ? months : null,
          }).unwrap();
        }
      }
      setDone(true);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save commission rules.');
    } finally { setSavingComm(false); }
  };

  const setComm = (role, field) => (e) => {
    setCommissions(prev => ({
      ...prev,
      [role]: { ...prev[role], [field]: e.target.value },
    }));
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={`/money/schemes/land/sites/${siteId}`}
        title="Add Layout"
        subtitle={step === 1 ? 'Step 1 of 2 — Layout Details' : 'Step 2 of 2 — Commission Rules'}
      />

      {/* Step indicator */}
      <div className="px-4 mb-4 flex gap-2">
        {[1, 2].map(s => (
          <div key={s} className={`h-1 flex-1 rounded-full ${s <= step ? 'bg-stone-700' : 'bg-navy/10'}`} />
        ))}
      </div>

      {step === 1 && (
        <form onSubmit={handleCreateLayout} className="px-4 space-y-5">
          <FormField label="Layout Name" hint="e.g. Hare Rama Layout, SR Grand City 2 (optional)">
            <input type="text" value={layoutForm.layoutName} onChange={setLayout('layoutName')}
              placeholder="Layout name…" className={SCHEME_INPUT_CLASS} />
          </FormField>

          <FormField label="Location Detail">
            <textarea value={layoutForm.locationDetail} onChange={setLayout('locationDetail')} rows={2}
              placeholder="Address / landmark details…" className={`${SCHEME_INPUT_CLASS} resize-none`} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Plot Price (₹)">
              <input type="number" value={layoutForm.plotPrice} onChange={setLayout('plotPrice')}
                placeholder="e.g. 2400000" className={SCHEME_INPUT_CLASS} />
            </FormField>
            <FormField label="Plot Size (sqft)">
              <input type="number" value={layoutForm.plotSizeSqft} onChange={setLayout('plotSizeSqft')}
                placeholder="e.g. 1200" className={SCHEME_INPUT_CLASS} />
            </FormField>
          </div>

          <FormField label="Price / sqft (₹)" hint="Auto-calculated if not set.">
            <input type="number" value={layoutForm.pricePerSqft} onChange={setLayout('pricePerSqft')}
              placeholder="e.g. 2000" className={SCHEME_INPUT_CLASS} />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Investor Buyback / mo (₹)">
              <input type="number" value={layoutForm.buybackBonusMonthly} onChange={setLayout('buybackBonusMonthly')}
                placeholder="e.g. 40000" className={SCHEME_INPUT_CLASS} />
            </FormField>
            <FormField label="Buyback Months">
              <input type="number" value={layoutForm.buybackMonths} onChange={setLayout('buybackMonths')}
                placeholder="60" min={1} max={120} className={SCHEME_INPUT_CLASS} />
            </FormField>
          </div>

          <FormField label="Incentive Type">
            <div className="grid grid-cols-2 gap-2">
              {[
                { val: 'spot_commission', label: 'Spot + Monthly' },
                { val: 'spot_incentive',  label: 'Spot Only'      },
              ].map(({ val, label }) => (
                <button key={val} type="button"
                  onClick={() => setLayoutForm(f => ({ ...f, incentiveType: val }))}
                  className={`py-3 rounded-2xl border-2 text-sm font-bold transition-all ${
                    layoutForm.incentiveType === val
                      ? 'border-stone-700 bg-stone-50 text-stone-700'
                      : 'border-navy/10 text-navy/50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </FormField>

          <FormError error={error} />

          <button type="submit" disabled={creating}
            className="w-full py-4 rounded-2xl bg-stone-700 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press flex items-center justify-center gap-2">
            {creating ? <><Loader2 size={16} className="animate-spin" /> Creating…</> : 'Next: Set Commissions →'}
          </button>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={handleSaveCommissions} className="px-4 space-y-4">
          <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-navy">Set employee commission for this layout</p>
            <p className="text-[10px] text-navy/40 mt-0.5">
              "PILLARS" = GM role. Monthly = 0 means no monthly commission for that role. Leave blank to skip.
            </p>
          </div>

          {/* Commission header */}
          <div className="grid grid-cols-4 gap-2 px-1">
            <span className="text-[9px] font-bold uppercase text-navy/40">Role</span>
            <span className="text-[9px] font-bold uppercase text-navy/40 text-right">Spot (₹)</span>
            <span className="text-[9px] font-bold uppercase text-navy/40 text-right">Monthly (₹)</span>
            <span className="text-[9px] font-bold uppercase text-navy/40 text-right">Mo. Months</span>
          </div>

          {ROLES.map(({ key, label }) => (
            <div key={key} className="grid grid-cols-4 gap-2 bg-white rounded-xl px-3 py-2.5 border border-border">
              <div className="flex items-center">
                <span className="text-xs font-bold text-navy/70">{label.split(' ')[0]}</span>
              </div>
              <input type="number" value={commissions[key].spot}
                onChange={setComm(key, 'spot')} min={0}
                placeholder="0" className="px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20 text-right" />
              <input type="number" value={commissions[key].monthly}
                onChange={setComm(key, 'monthly')} min={0}
                placeholder="0" className="px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20 text-right" />
              <input type="number" value={commissions[key].months}
                onChange={setComm(key, 'months')} min={1} max={120}
                placeholder="—" className="px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20 text-right" />
            </div>
          ))}

          <FormError error={error} />

          <div className="flex gap-3">
            <button type="button" onClick={() => { setDone(true); }}
              className="flex-1 py-3.5 rounded-2xl border border-navy/10 text-navy/50 text-sm font-bold tactile-press">
              Skip for now
            </button>
            <button type="submit" disabled={savingComm}
              className="flex-1 py-3.5 rounded-2xl bg-stone-700 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press flex items-center justify-center gap-2">
              {savingComm ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Save & Finish'}
            </button>
          </div>
        </form>
      )}
    </SchemePageWrapper>
  );
};

export default LandAddLayoutPage;
