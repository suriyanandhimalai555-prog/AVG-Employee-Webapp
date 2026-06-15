// Management Control Center — full scheme configuration hub.
//
// Accessible to: management, MD, Director
// Route: /control-center
//
// Tabs:
//   Commissions  — per-scheme commission rules (inline-editable via CommissionPanel)
//   Builders     — 6 package rows + employee incentive matrix
//   Chit         — 5 package rows (full / half amount)
//   Gold Coin    — 10 package rows (price / grams)
//   LSS          — 5 plan rows (price)
//   Land         — entry point to site / plot management

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Settings2, IndianRupee, Building2, Gem, Coins,
  Layers, Landmark, Edit2, Check, X, Loader2,
  ShieldCheck, ChevronRight, ToggleLeft, ToggleRight, ShieldAlert,
  MapPin, Navigation,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetBuildersPackagesQuery,
  useUpdateBuildersPackageMutation,
  useGetBuildersIncentiveRulesQuery,
  useUpdateBuildersIncentiveRuleMutation,
  useGetChitPackagesQuery,
  useUpdateChitPackageMutation,
  useGetAllGoldCoinPackagesQuery,
  useUpdateGoldCoinPackageMutation,
  useGetAllLssPlansQuery,
  useUpdateLssPlanMutation,
  useGetMoneyProjectsQuery,
  useGetLandSitesQuery,
  useGetLandSiteLayoutsQuery,
  useGetLandLayoutCommissionRulesQuery,
  useUpdateLandLayoutCommissionRuleMutation,
  useUpdateLandLayoutMutation,
  useGetBackdatedEntrySettingQuery,
  useUpdateBackdatedEntrySettingMutation,
  useGetBranchesQuery,
  useSetHeadBranchMutation,
  useSetBranchLocationMutation,
} from '../store/api/apiSlice';
import { formatCurrency } from '../lib/formatters';
import { SCHEME_INPUT_CLASS } from '../lib/schemeConstants';
import { CommissionPanel } from './schemes/components/CommissionPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['management', 'md', 'director']);

const TABS = [
  { key: 'commissions', label: 'Commissions',  Icon: IndianRupee,  roles: null },
  { key: 'builders',    label: 'Builders',      Icon: Building2,    roles: null },
  { key: 'chit',        label: 'Chit',          Icon: Gem,          roles: null },
  { key: 'goldcoin',    label: 'Gold Coin',      Icon: Coins,        roles: null },
  { key: 'lss',         label: 'LSS',            Icon: Layers,       roles: null },
  { key: 'land',        label: 'Land',           Icon: Landmark,     roles: null },
  { key: 'corrections', label: 'Corrections',   Icon: ShieldAlert,  roles: null },
  // Branches tab: only Management may set geofence coordinates
  { key: 'branches',    label: 'Branches',       Icon: MapPin,       roles: new Set(['management']) },
];

// Scheme codes for the commission tab (maps to projects.code)
const COMMISSION_SCHEMES = [
  { label: 'Trading Academy', code: 'trading_academy' },
  { label: 'Gold Scheme',     code: 'gold_scheme'     },
  { label: 'Gold Coin',       code: 'gold_coin_scheme'},
  { label: 'LSS',             code: 'lss_scheme'      },
  { label: 'Agila Chit',      code: 'agila_chit_scheme'},
  { label: 'Builders',        code: 'builders_scheme' },
  { label: 'Land Sales',      code: 'land_scheme'     },
];

// ─── Generic inline-edit cell ─────────────────────────────────────────────────

const EditCell = ({ value, onSave, type = 'number', prefix, suffix, min = 0 }) => {
  const [editing, setEditing] = useState(false);
  const [val,     setVal]     = useState('');
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState('');

  const start = () => { setVal(String(value)); setErr(''); setEditing(true); };
  const cancel = () => { setEditing(false); setErr(''); };

  const save = async () => {
    const parsed = type === 'number' ? Number(val) : val;
    if (type === 'number' && (isNaN(parsed) || parsed < min)) {
      setErr(`Min ${min}`); return;
    }
    setSaving(true);
    try {
      await onSave(parsed);
      setEditing(false);
    } catch (e) {
      setErr(e?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-1">
          {prefix && <span className="text-[10px] text-navy/40">{prefix}</span>}
          <input
            type={type === 'number' ? 'number' : 'text'}
            value={val}
            onChange={e => setVal(e.target.value)}
            min={min}
            className="w-24 px-2 py-1 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
            autoFocus
          />
          {suffix && <span className="text-[10px] text-navy/40">{suffix}</span>}
          <button onClick={save} disabled={saving}
            className="w-6 h-6 rounded-lg bg-stone-700 text-white flex items-center justify-center disabled:opacity-50 tactile-press" aria-label="Save">
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
          </button>
          <button onClick={cancel}
            className="w-6 h-6 rounded-lg bg-navy/5 text-navy/40 flex items-center justify-center tactile-press" aria-label="Cancel">
            <X size={10} />
          </button>
        </div>
        {err && <p className="text-[9px] text-red-600">{err}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 group">
      <span className="text-sm font-bold text-navy">
        {prefix}{type === 'number' ? Number(value).toLocaleString('en-IN') : value}{suffix}
      </span>
      <button onClick={start}
        className="w-5 h-5 rounded-md bg-navy/5 text-navy/30 opacity-0 group-hover:opacity-100 flex items-center justify-center tactile-press transition-opacity" aria-label="Edit">
        <Edit2 size={9} />
      </button>
    </div>
  );
};

// ─── Commissions tab ──────────────────────────────────────────────────────────

const CommissionsTab = () => {
  const [expanded, setExpanded] = useState(null);
  const { data: projects = [] } = useGetMoneyProjectsQuery({});
  // Build a map from scheme code → project UUID
  const codeToId = Object.fromEntries(projects.map(p => [p.code, p.id]));

  return (
    <div className="space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-4">
        Commission rates per scheme · click to expand · hover any value to edit
      </p>
      {COMMISSION_SCHEMES.map(({ label, code }) => {
        const projectId = codeToId[code];
        const isOpen = expanded === code;
        return (
          <div key={code} className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : code)}
              className="w-full px-4 py-3 flex items-center justify-between tactile-press hover:bg-navy/[0.01] transition-colors"
            >
              <span className="text-sm font-bold text-navy">{label}</span>
              <ChevronRight size={16} className={`text-navy/30 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-navy/5 pt-3">
                {projectId
                  ? <CommissionPanel projectId={projectId} />
                  : <p className="text-xs text-navy/30 italic">Project not found</p>
                }
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// ─── Builders tab ─────────────────────────────────────────────────────────────

const BuildersTab = () => {
  const { data: packages = {}, isLoading } = useGetBuildersPackagesQuery();
  const { data: rules = [] }               = useGetBuildersIncentiveRulesQuery();
  const [updatePkg]  = useUpdateBuildersPackageMutation();
  const [updateRule] = useUpdateBuildersIncentiveRuleMutation();

  const pkgList = Object.entries(packages).map(([num, pkg]) => ({ num: parseInt(num), ...pkg }));

  const ruleCell = (pkg, role, type) => {
    const r = rules.find(r => r.package_number === pkg && r.role === role && r.incentive_type === type);
    const amount = r ? parseFloat(r.amount) : 0;
    return (
      <EditCell key={`${pkg}-${role}-${type}`} value={amount} min={0}
        prefix="₹"
        onSave={v => updateRule({ packageNumber: pkg, role, incentiveType: type, amount: v }).unwrap()}
      />
    );
  };

  const ROLES = ['sales_officer','abm','branch_manager','gm'];
  const ROLE_LABELS = { sales_officer: 'SO', abm: 'ABM', branch_manager: 'BM', gm: 'GM' };
  const TIER_LABELS = ['₹5L','₹10L','₹15L','₹20L','₹25L','₹30L'];

  return (
    <div className="space-y-6">
      {/* Package amounts */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Package Amounts</p>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
        ) : (
          <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
            <table className="w-full border-collapse min-w-max">
              <thead>
                <tr className="bg-navy/[0.02] border-b border-navy/5">
                  {['Tier','Investment','Monthly M1-60','Cash Bonus M51-60','House Worth'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-navy/5">
                {pkgList.map(pkg => (
                  <tr key={pkg.num} className="hover:bg-navy/[0.01]">
                    <td className="px-4 py-3 text-xs font-bold text-sky-700">Tier {pkg.num} ({TIER_LABELS[pkg.num-1]})</td>
                    <td className="px-4 py-3">
                      <EditCell value={pkg.investmentAmount} min={1} prefix="₹"
                        onSave={v => updatePkg({ packageNumber: pkg.num, investmentAmount: v }).unwrap()} />
                    </td>
                    <td className="px-4 py-3">
                      <EditCell value={pkg.monthlyPayout} min={1} prefix="₹"
                        onSave={v => updatePkg({ packageNumber: pkg.num, monthlyPayout: v }).unwrap()} />
                    </td>
                    <td className="px-4 py-3">
                      <EditCell value={pkg.cashFinalMonthly} min={1} prefix="₹"
                        onSave={v => updatePkg({ packageNumber: pkg.num, cashFinalMonthly: v }).unwrap()} />
                    </td>
                    <td className="px-4 py-3">
                      <EditCell value={pkg.houseWorth} min={1} prefix="₹"
                        onSave={v => updatePkg({ packageNumber: pkg.num, houseWorth: v }).unwrap()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Employee incentive matrix */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Employee Incentives — One-Time (Enrollment)</p>
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-navy/5">
                <th className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
                {TIER_LABELS.map(t => <th key={t} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{t}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {ROLES.map(role => (
                <tr key={role} className="hover:bg-navy/[0.01]">
                  <td className="px-4 py-2.5 text-xs font-bold text-navy/60">{ROLE_LABELS[role]}</td>
                  {[1,2,3,4,5,6].map(pkg => <td key={pkg} className="px-3 py-2.5">{ruleCell(pkg, role, 'one_time')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mt-5 mb-3">Monthly (SO — 60 months)</p>
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-navy/5">
                <th className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
                {TIER_LABELS.map(t => <th key={t} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{t}</th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-4 py-2.5 text-xs font-bold text-navy/60">SO</td>
                {[1,2,3,4,5,6].map(pkg => <td key={pkg} className="px-3 py-2.5">{ruleCell(pkg, 'sales_officer', 'monthly')}</td>)}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ─── Chit tab ─────────────────────────────────────────────────────────────────

const ChitTab = () => {
  const { data: packages = [], isLoading } = useGetChitPackagesQuery();
  const [updatePkg] = useUpdateChitPackageMutation();

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Package Amounts · 20 members per group · 20 months</p>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : (
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-navy/5">
                {['Package','Full Amount (M1–10)','Half Amount (M11–20)'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {packages.map(pkg => (
                <tr key={pkg.package_number} className="hover:bg-navy/[0.01]">
                  <td className="px-4 py-3 text-xs font-bold text-violet-700">Package {pkg.package_number}</td>
                  <td className="px-4 py-3">
                    <EditCell value={pkg.full_amount} min={1} prefix="₹"
                      onSave={v => updatePkg({ packageNumber: pkg.package_number, fullAmount: v }).unwrap()} />
                  </td>
                  <td className="px-4 py-3">
                    <EditCell value={pkg.half_amount} min={1} prefix="₹"
                      onSave={v => updatePkg({ packageNumber: pkg.package_number, halfAmount: v }).unwrap()} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Gold Coin tab ────────────────────────────────────────────────────────────

const GoldCoinTab = () => {
  const { data: packages = [], isLoading } = useGetAllGoldCoinPackagesQuery();
  const [updatePkg] = useUpdateGoldCoinPackageMutation();

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Packages · 16 slots per room</p>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : (
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-navy/5">
                {['Name','Price (₹)','Gold (grams)','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {packages.map(pkg => (
                <tr key={pkg.id} className={`hover:bg-navy/[0.01] ${!pkg.isActive ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3 text-xs font-bold text-yellow-700">{pkg.name}</td>
                  <td className="px-4 py-3">
                    <EditCell value={pkg.price} min={1} prefix="₹"
                      onSave={v => updatePkg({ id: pkg.id, price: v }).unwrap()} />
                  </td>
                  <td className="px-4 py-3">
                    <EditCell value={pkg.goldGrams} min={0.001} suffix="g"
                      onSave={v => updatePkg({ id: pkg.id, goldGrams: v }).unwrap()} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => updatePkg({ id: pkg.id, isActive: !pkg.isActive })}
                      className="flex items-center gap-1 text-xs font-semibold tactile-press"
                    >
                      {pkg.isActive
                        ? <><ToggleRight size={16} className="text-emerald-500" /> <span className="text-emerald-600">Active</span></>
                        : <><ToggleLeft  size={16} className="text-navy/30" />    <span className="text-navy/40">Inactive</span></>
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── LSS tab ──────────────────────────────────────────────────────────────────

const LssTab = () => {
  const { data: plans = [], isLoading } = useGetAllLssPlansQuery();
  const [updatePlan] = useUpdateLssPlanMutation();

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">Plans · 20 slots per room</p>
      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : (
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-navy/5">
                {['Name','Price (₹)','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {plans.map(plan => (
                <tr key={plan.id} className={`hover:bg-navy/[0.01] ${!plan.isActive ? 'opacity-40' : ''}`}>
                  <td className="px-4 py-3 text-xs font-bold text-violet-700">{plan.name}</td>
                  <td className="px-4 py-3">
                    <EditCell value={plan.price} min={1} prefix="₹"
                      onSave={v => updatePlan({ id: plan.id, price: v }).unwrap()} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => updatePlan({ id: plan.id, isActive: !plan.isActive })}
                      className="flex items-center gap-1 text-xs font-semibold tactile-press"
                    >
                      {plan.isActive
                        ? <><ToggleRight size={16} className="text-emerald-500" /> <span className="text-emerald-600">Active</span></>
                        : <><ToggleLeft  size={16} className="text-navy/30" />    <span className="text-navy/40">Inactive</span></>
                      }
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Land Commission Rules editor (per-layout) ────────────────────────────────

const LAND_ROLE_LABELS = {
  sales_officer:  'SO',
  abm:            'ABM',
  branch_manager: 'BM',
  gm:             'PILLARS (GM)',
};
const LAND_ROLE_ORDER = ['sales_officer', 'abm', 'branch_manager', 'gm'];

const LandCommissionRuleRow = ({ layoutId, rule }) => {
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
    if (isNaN(s) || s < 0 || isNaN(m) || m < 0) { setErr('Enter valid amounts ≥ 0'); return; }
    if (m > 0 && (mo === null || mo < 1)) { setErr('Enter monthly months when monthly > 0'); return; }
    setSaving(true); setErr('');
    try {
      await updateRule({ layoutId, role: rule.role, spotAmount: s, monthlyAmount: m, monthlyMonths: mo }).unwrap();
      setEditing(false);
    } catch (e) {
      setErr(e?.data?.error?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  return (
    <tr className="hover:bg-navy/[0.01]">
      <td className="px-4 py-3 text-xs font-bold text-navy/70">{LAND_ROLE_LABELS[rule.role] || rule.role}</td>
      {editing ? (
        <>
          <td className="px-3 py-2">
            <input type="number" value={spot} onChange={e => setSpot(e.target.value)} min="0"
              className="w-24 px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20" />
          </td>
          <td className="px-3 py-2">
            <input type="number" value={monthly} onChange={e => setMonthly(e.target.value)} min="0"
              className="w-24 px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20" />
          </td>
          <td className="px-3 py-2">
            <input type="number" value={months} onChange={e => setMonths(e.target.value)} min="1" max="120"
              placeholder="—"
              className="w-16 px-2 py-1.5 text-xs font-medium text-navy rounded-lg border border-navy/20 outline-none focus:ring-2 ring-indigo/20" />
          </td>
          <td className="px-3 py-2">
            <div className="flex gap-1">
              <button type="button" onClick={save} disabled={saving}
                className="w-7 h-7 rounded-lg bg-stone-700 text-white flex items-center justify-center disabled:opacity-50 tactile-press">
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
              </button>
              <button type="button" onClick={() => { setEditing(false); setErr(''); }}
                className="w-7 h-7 rounded-lg bg-navy/5 text-navy/40 flex items-center justify-center tactile-press">
                <X size={10} />
              </button>
            </div>
            {err && <p className="text-[9px] text-red-600 mt-0.5 whitespace-nowrap">{err}</p>}
          </td>
        </>
      ) : (
        <>
          <td className="px-3 py-3 text-right">
            <div className="flex items-center justify-end gap-1 group">
              <span className="text-xs font-semibold text-navy">₹{Number(rule.spot_amount||0).toLocaleString('en-IN')}</span>
              <button type="button" onClick={() => setEditing(true)}
                className="w-5 h-5 rounded-md bg-navy/5 text-navy/30 opacity-0 group-hover:opacity-100 flex items-center justify-center tactile-press transition-opacity">
                <Edit2 size={9} />
              </button>
            </div>
          </td>
          <td className="px-3 py-3 text-right">
            <span className="text-xs font-semibold text-navy/60">
              {rule.monthly_amount > 0 ? `₹${Number(rule.monthly_amount).toLocaleString('en-IN')}` : '—'}
            </span>
          </td>
          <td className="px-3 py-3 text-right">
            <span className="text-xs text-navy/40">
              {rule.monthly_months != null ? `${rule.monthly_months} mo` : '—'}
            </span>
          </td>
          <td className="px-3 py-3"></td>
        </>
      )}
    </tr>
  );
};

const LandCommissionEditor = ({ layoutId }) => {
  const { data: rules = [], isLoading } = useGetLandLayoutCommissionRulesQuery(layoutId, { skip: !layoutId });

  const sorted = [...rules].sort((a, b) => LAND_ROLE_ORDER.indexOf(a.role) - LAND_ROLE_ORDER.indexOf(b.role));

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-x-auto">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-navy/[0.02] border-b border-navy/5">
              <th className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Spot (₹)</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Monthly (₹)</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Months</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-navy/5">
            {sorted.map(rule => (
              <LandCommissionRuleRow key={rule.role} layoutId={layoutId} rule={rule} />
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[9px] text-navy/30 px-4 pb-3 flex items-center gap-1 border-t border-navy/5 pt-2">
        <IndianRupee size={8} /> Hover Spot and click the pencil to edit. Monthly = 0 / Months blank = no monthly commission for that role.
      </p>
    </div>
  );
};

// ─── Land tab ─────────────────────────────────────────────────────────────────

const LandTab = ({ navigate }) => {
  const [selectedSiteId,   setSelectedSiteId]   = useState('');
  const [selectedLayoutId, setSelectedLayoutId] = useState('');

  const { data: sitesResult, isLoading: loadingSites } = useGetLandSitesQuery({ limit: 200 });
  const { data: layouts = [],  isLoading: loadingLayouts } = useGetLandSiteLayoutsQuery(
    selectedSiteId, { skip: !selectedSiteId }
  );

  const sites = sitesResult?.data ?? [];
  const selectedLayout = layouts.find(l => l.id === selectedLayoutId);

  const handleSiteChange = (siteId) => {
    setSelectedSiteId(siteId);
    setSelectedLayoutId('');
  };

  return (
    <div className="space-y-4">
      {/* Quick-nav links */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => navigate('/money/schemes/land/sites')}
          className="bg-white rounded-2xl p-4 card-shadow border border-navy/5 text-left tactile-press hover:border-stone-200 transition-colors flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
            <Landmark size={18} className="text-stone-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-navy">Sites & Layouts</p>
            <p className="text-[10px] text-navy/40 mt-0.5">Create sites, add layouts & plots</p>
          </div>
          <ChevronRight size={14} className="text-navy/20 flex-shrink-0 ml-auto" />
        </button>
        <button type="button" onClick={() => navigate('/money/schemes/land')}
          className="bg-white rounded-2xl p-4 card-shadow border border-navy/5 text-left tactile-press hover:border-stone-200 transition-colors flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center flex-shrink-0">
            <Landmark size={18} className="text-stone-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-navy">Bookings</p>
            <p className="text-[10px] text-navy/40 mt-0.5">View & manage bookings</p>
          </div>
          <ChevronRight size={14} className="text-navy/20 flex-shrink-0 ml-auto" />
        </button>
      </div>

      {/* Commission rules editor — site → layout → rules */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
          Employee Commission Rules · Site → Layout
        </p>

        {/* Step 1: pick site */}
        <div className="mb-2">
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">Site</label>
          {loadingSites ? (
            <div className="flex items-center gap-2 px-1"><Loader2 size={14} className="animate-spin text-navy/30" /></div>
          ) : (
            <select value={selectedSiteId} onChange={e => handleSiteChange(e.target.value)}
              className="w-full px-4 py-3 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 appearance-none">
              <option value="">— Select a site —</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
        </div>

        {/* Step 2: pick layout */}
        {selectedSiteId && (
          <div className="mb-3">
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">Layout</label>
            {loadingLayouts ? (
              <div className="flex items-center gap-2 px-1"><Loader2 size={14} className="animate-spin text-navy/30" /></div>
            ) : (
              <select value={selectedLayoutId} onChange={e => setSelectedLayoutId(e.target.value)}
                className="w-full px-4 py-3 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 appearance-none">
                <option value="">— Select a layout —</option>
                {layouts.map(l => (
                  <option key={l.id} value={l.id}>{l.layout_name || '(unnamed layout)'}</option>
                ))}
              </select>
            )}
          </div>
        )}

        {/* Step 3: commission matrix */}
        {selectedLayoutId && (
          <div className="space-y-2">
            {/* Layout pricing summary */}
            {selectedLayout && (
              <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[9px] font-bold uppercase text-navy/40">Plot Price</p>
                  <p className="text-xs font-bold text-navy mt-0.5">
                    {selectedLayout.plot_price ? `₹${Number(selectedLayout.plot_price).toLocaleString('en-IN')}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-navy/40">Buyback/mo</p>
                  <p className="text-xs font-bold text-navy mt-0.5">
                    {selectedLayout.buyback_bonus_monthly ? `₹${Number(selectedLayout.buyback_bonus_monthly).toLocaleString('en-IN')}` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-navy/40">Buyback Months</p>
                  <p className="text-xs font-bold text-navy mt-0.5">
                    {selectedLayout.buyback_months ? `${selectedLayout.buyback_months} mo` : '—'}
                  </p>
                </div>
              </div>
            )}
            <LandCommissionEditor layoutId={selectedLayoutId} />
          </div>
        )}

        {!selectedSiteId && !loadingSites && (
          <div className="bg-white rounded-2xl p-6 border border-navy/5 card-shadow text-center">
            <Landmark size={24} className="text-navy/20 mx-auto mb-2" />
            <p className="text-xs text-navy/40">Select a site, then a layout to edit commission rules.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Branches tab (Management only) ───────────────────────────────────────────
// Lets Management configure the geofence lat/lon and radius for every branch.
// "Use my location" button fills coordinates directly from the device (handy
// when Management is physically standing at the branch).

const BranchLocationRow = ({ branch }) => {
  const [setBranchLocation, { isLoading: saving }] = useSetBranchLocationMutation();
  const [editing, setEditing]   = useState(false);
  const [lat,     setLat]       = useState('');
  const [lng,     setLng]       = useState('');
  const [radius,  setRadius]    = useState('');
  const [gpsMsg,  setGpsMsg]    = useState(''); // '' | 'fetching' | 'ready' | 'blocked'
  const [err,     setErr]       = useState('');
  const [saved,   setSaved]     = useState(false);

  const hasCoords = branch.latitude != null && branch.longitude != null;

  const startEdit = () => {
    setLat(hasCoords ? String(parseFloat(branch.latitude)) : '');
    setLng(hasCoords ? String(parseFloat(branch.longitude)) : '');
    setRadius(branch.geofence_radius_m != null ? String(branch.geofence_radius_m) : '150');
    setErr('');
    setSaved(false);
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setErr(''); setGpsMsg(''); };

  // Fill lat/lng from the device's GPS (useful when standing at the branch)
  const useMyLocation = () => {
    if (!navigator.geolocation) { setGpsMsg('blocked'); return; }
    setGpsMsg('fetching');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGpsMsg('ready');
      },
      () => setGpsMsg('blocked'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const save = async () => {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    const parsedRadius = parseInt(radius, 10);
    if (isNaN(parsedLat) || parsedLat < -90  || parsedLat > 90)  { setErr('Latitude must be between -90 and 90'); return; }
    if (isNaN(parsedLng) || parsedLng < -180 || parsedLng > 180) { setErr('Longitude must be between -180 and 180'); return; }
    if (isNaN(parsedRadius) || parsedRadius < 20 || parsedRadius > 5000) { setErr('Radius must be 20 – 5000 m'); return; }
    setErr('');
    try {
      await setBranchLocation({ id: branch.id, latitude: parsedLat, longitude: parsedLng, geofenceRadiusM: parsedRadius }).unwrap();
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setErr(e?.data?.error?.message || 'Save failed');
    }
  };

  const clearGeofence = async () => {
    try {
      await setBranchLocation({ id: branch.id, latitude: null, longitude: null }).unwrap();
    } catch (e) {
      setErr(e?.data?.error?.message || 'Clear failed');
    }
  };

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo/5 flex items-center justify-center flex-shrink-0">
            <Building2 size={14} className="text-indigo" />
          </div>
          <div>
            <p className="text-sm font-bold text-navy">{branch.name}</p>
            {hasCoords ? (
              <p className="text-[10px] font-mono text-emerald-600 mt-0.5">
                {parseFloat(branch.latitude).toFixed(5)}, {parseFloat(branch.longitude).toFixed(5)} · {branch.geofence_radius_m ?? 150} m
              </p>
            ) : (
              <p className="text-[10px] text-navy/30 mt-0.5 italic">No geofence set — check-in unrestricted</p>
            )}
          </div>
        </div>
        {!editing && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={startEdit}
              className="w-7 h-7 rounded-lg bg-navy/5 text-navy/40 hover:text-navy flex items-center justify-center tactile-press"
              title="Set location"
            >
              <MapPin size={12} />
            </button>
            {hasCoords && (
              <button
                type="button"
                onClick={clearGeofence}
                className="w-7 h-7 rounded-lg bg-red-50 text-red-400 hover:text-red-600 flex items-center justify-center tactile-press"
                title="Clear geofence"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}
        {saved && !editing && (
          <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
            <Check size={11} /> Saved
          </span>
        )}
      </div>

      {editing && (
        <div className="space-y-3 pt-2 border-t border-navy/5">
          {/* GPS fill button */}
          <button
            type="button"
            onClick={useMyLocation}
            disabled={gpsMsg === 'fetching'}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-indigo/20 bg-indigo/5 text-xs font-semibold text-indigo tactile-press disabled:opacity-50"
          >
            {gpsMsg === 'fetching'
              ? <Loader2 size={12} className="animate-spin" />
              : <Navigation size={12} />}
            {gpsMsg === 'fetching' ? 'Getting location…' : 'Use my current location'}
          </button>
          {gpsMsg === 'blocked' && (
            <p className="text-[10px] text-amber-600 font-medium">Location access blocked — enable in browser settings or enter coords manually.</p>
          )}
          {gpsMsg === 'ready' && (
            <p className="text-[10px] text-emerald-600 font-medium">✓ Coordinates filled from GPS</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">Latitude</label>
              <input
                type="number"
                value={lat}
                onChange={e => setLat(e.target.value)}
                step="0.000001"
                placeholder="e.g. 13.082680"
                className="w-full px-3 py-2 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
              />
            </div>
            <div>
              <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">Longitude</label>
              <input
                type="number"
                value={lng}
                onChange={e => setLng(e.target.value)}
                step="0.000001"
                placeholder="e.g. 80.270721"
                className="w-full px-3 py-2 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
              />
            </div>
          </div>

          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">Geofence radius (metres)</label>
            <input
              type="number"
              value={radius}
              onChange={e => setRadius(e.target.value)}
              min={20}
              max={5000}
              placeholder="150"
              className="w-full px-3 py-2 text-xs font-medium text-navy rounded-xl border border-navy/20 outline-none focus:ring-2 ring-indigo/20"
            />
            <p className="text-[9px] text-navy/30 mt-1">
              Employees must be within this radius to check in as office. Default 150 m (recommended — accommodates browser GPS jitter).
            </p>
          </div>

          {err && <p className="text-[10px] text-red-500 font-medium">{err}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              className="flex-1 py-2.5 rounded-xl bg-stone-800 text-white text-xs font-bold tactile-press flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Check size={12} /> Save
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex-1 py-2.5 rounded-xl bg-navy/5 text-navy/50 text-xs font-bold tactile-press"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const BranchesTab = () => {
  const { data: branches = [], isLoading } = useGetBranchesQuery();

  return (
    <div className="space-y-3">
      <div className="bg-indigo/5 border border-indigo/10 rounded-2xl p-3 flex items-start gap-2.5">
        <MapPin size={14} className="text-indigo flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-navy/60 leading-relaxed">
          Set the GPS coordinates and geofence radius for each branch. Employees can only mark
          <strong> office attendance</strong> when they are within the radius. Branches with no
          coordinates set are unrestricted (existing behaviour). Field check-in is never geofenced.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : branches.length === 0 ? (
        <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
          <Building2 size={28} className="text-navy/10 mx-auto mb-2" />
          <p className="text-xs text-navy/40">No branches found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {branches.map(branch => (
            <BranchLocationRow key={branch.id} branch={branch} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Head branch selector (Management only) ───────────────────────────────────
// Management can designate which branch acts as the global head branch for
// Gold Coin, LSS and Chit scheme combine/refund operations. Atomically moves
// the is_head_branch flag on the branches table (old cleared, new set, in one
// transaction) so exactly one branch is always the head branch.
const HeadBranchSetting = () => {
  const { data: branches = [], isLoading: loadingBranches } = useGetBranchesQuery();
  const [setHeadBranch, { isLoading: saving }] = useSetHeadBranchMutation();
  const [selectedId, setSelectedId] = useState('');
  const [saved, setSaved]           = useState(false);
  const [saveErr, setSaveErr]       = useState(null);

  // Find the branch currently marked as head
  const currentHead = branches.find(b => b.is_head_branch);

  const handleSave = async () => {
    if (!selectedId) return;
    setSaveErr(null);
    try {
      await setHeadBranch({ branchId: selectedId }).unwrap();
      setSaved(true);
      setSelectedId('');
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveErr(err?.data?.error?.message || 'Failed to update head branch.');
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-navy/5 card-shadow">
        <div className="flex items-start gap-3 mb-3">
          <Building2 size={16} className="text-navy/50 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">Head Branch</p>
            <p className="text-xs text-navy/40 mt-0.5">
              Receives combined rooms / groups for Gold Coin, LSS and Chit schemes.
            </p>
            {currentHead && (
              <p className="text-xs font-semibold text-indigo mt-1">
                Current: {currentHead.name}
              </p>
            )}
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <select
            value={selectedId}
            onChange={e => { setSelectedId(e.target.value); setSaved(false); setSaveErr(null); }}
            disabled={loadingBranches || saving}
            className="flex-1 rounded-xl border border-navy/10 bg-navy/[0.02] text-sm text-navy px-3 py-2 outline-none focus:ring-2 focus:ring-indigo/20 disabled:opacity-50"
          >
            <option value="">{loadingBranches ? 'Loading…' : 'Select branch to set as head…'}</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}{b.is_head_branch ? ' (current)' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedId || saving || selectedId === currentHead?.id}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold disabled:opacity-40 tactile-press"
          >
            {saving
              ? <Loader2 size={14} className="animate-spin" />
              : saved
              ? <Check size={14} />
              : 'Save'}
          </button>
        </div>
        {saveErr && <p className="text-[11px] text-red-500 mt-2 font-medium">{saveErr}</p>}
        {saved  && <p className="text-[11px] text-emerald-600 mt-2 font-medium">Head branch updated successfully.</p>}
      </div>
    </div>
  );
};

// ─── Backdated-entry toggle (Management only) ─────────────────────────────────
// While ON, branch admins may enter scheme data dated in the past (the
// incentive lands in that date's wallet period). Management itself is always
// allowed to backdate regardless of this switch.
const BackdatedEntryToggle = () => {
  const { data, isLoading }   = useGetBackdatedEntrySettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateBackdatedEntrySettingMutation();
  const enabled = data?.enabled === true;

  const toggle = async () => {
    try {
      await updateSetting({ enabled: !enabled }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch simply stays put.
    }
  };

  return (
    <div className="px-4 md:px-0 mb-6">
      <div className="bg-white rounded-2xl p-4 border border-navy/5 card-shadow flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-navy">Backdated entry by branch admins</p>
          <p className="text-xs text-navy/40 mt-0.5">
            {enabled
              ? 'ON — admins can enter past-dated scheme data; incentives credit to that period.'
              : 'OFF — admins can only enter data dated today. Management can always backdate.'}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={isLoading || saving}
          aria-label={enabled ? 'Disable backdated entry' : 'Enable backdated entry'}
          className="flex-shrink-0 tactile-press disabled:opacity-50"
        >
          {saving
            ? <Loader2 size={34} className="animate-spin text-navy/30" />
            : enabled
              ? <ToggleRight size={34} className="text-emerald-600" />
              : <ToggleLeft size={34} className="text-navy/30" />}
        </button>
      </div>
    </div>
  );
};

export const ManagementControlCenter = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('commissions');

  if (!ALLOWED_ROLES.has(user?.role)) {
    return (
      <div className="px-4 pt-16 max-w-lg mx-auto">
        <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
          <ShieldCheck size={32} className="text-navy/30 mx-auto mb-2" />
          <p className="text-sm font-bold text-navy">Access restricted</p>
          <p className="text-xs text-navy/40 mt-1">Only Management, MD, and Directors can access the Control Center.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4 max-w-5xl mx-auto">

      {/* Header */}
      <div className="px-4 md:px-0 mb-6 flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-stone-800 flex items-center justify-center flex-shrink-0">
          <Settings2 size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-navy tracking-tight">Control Center</h1>
          <p className="text-xs font-medium text-navy/40 mt-0.5">
            Scheme configuration · packages · commissions · incentives
          </p>
        </div>
      </div>

      {/* Management-only global settings */}
      {user?.role === 'management' && <BackdatedEntryToggle />}
      {user?.role === 'management' && <HeadBranchSetting />}

      {/* Tab bar — tabs with a roles set are only shown to matching roles */}
      <div className="px-4 md:px-0 mb-6">
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1.5 w-max md:w-auto md:flex-wrap">
            {TABS.filter(({ roles }) => roles === null || roles.has(user?.role)).map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold whitespace-nowrap transition-all ${
                  activeTab === key
                    ? 'bg-stone-800 text-white shadow-sm'
                    : 'bg-white text-navy/50 border border-navy/5 card-shadow hover:text-navy/70'
                }`}
              >
                <Icon size={13} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 md:px-0">
        {activeTab === 'commissions' && <CommissionsTab />}
        {activeTab === 'builders'    && <BuildersTab />}
        {activeTab === 'chit'        && <ChitTab />}
        {activeTab === 'goldcoin'    && <GoldCoinTab />}
        {activeTab === 'lss'         && <LssTab />}
        {activeTab === 'land'        && <LandTab navigate={navigate} />}
        {activeTab === 'branches'    && user?.role === 'management' && <BranchesTab />}
        {activeTab === 'corrections' && (
          <div className="py-4">
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-start gap-3 mb-4">
              <ShieldAlert size={18} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-amber-800">Data Corrections</p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Edit or void wrongly-entered entries across all schemes.
                  Incentives are automatically clawed back on void. All actions are audit-logged.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/control-center/corrections')}
              className="w-full py-4 rounded-2xl bg-stone-700 text-white text-sm font-bold tactile-press flex items-center justify-center gap-2 shadow-md"
            >
              <ShieldAlert size={18} aria-hidden="true" />
              Open Corrections Center
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ManagementControlCenter;
