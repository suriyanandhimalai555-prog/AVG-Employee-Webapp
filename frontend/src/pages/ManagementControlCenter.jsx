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

import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Settings2, IndianRupee, Building2, Gem, Coins,
  Layers, Landmark, Edit2, Check, X, Loader2,
  ShieldCheck, ChevronRight, ToggleLeft, ToggleRight, ShieldAlert,
  MessageCircle, Smartphone, UserX, RotateCcw, CalendarX, MapPin,
  ArrowUpRight, CheckCircle2, XCircle, AlertCircle,
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
  useGetWhatsappMessagesSettingQuery,
  useUpdateWhatsappMessagesSettingMutation,
  useGetLssEligibilityBypassSettingQuery,
  useUpdateLssEligibilityBypassSettingMutation,
  useGetGoldCoinEligibilityBypassSettingQuery,
  useUpdateGoldCoinEligibilityBypassSettingMutation,
  useGetDailyCollectionReconciliationSettingQuery,
  useUpdateDailyCollectionReconciliationSettingMutation,
  useGetAutoDeactivationSettingQuery,
  useUpdateAutoDeactivationSettingMutation,
  useGetDeactivatedUsersQuery,
  useReactivateUserMutation,
  useGetBranchesQuery,
  useSetHeadBranchMutation,
  useGetMobileAppVersionQuery,
  useUpdateMobileAppVersionMutation,
  useGetManagerOptionsQuery,
  useListTransferRequestsQuery,
  useExecuteTransferMutation,
  useGetUsersQuery,
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
  { key: 'transfers',   label: 'Transfers',      Icon: ArrowUpRight, roles: new Set(['management']) },
  // Branches tab removed — branch management + geofence lives at /branches (ManagementBranches page)
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

// ─── Transfers tab — Management direct-execute (form on top, history below) ────

const ROLE_LABELS = {
  director: 'Director', gm: 'General Manager', branch_manager: 'Branch Manager',
  abm: 'Asst. Branch Manager', sales_officer: 'Sales Officer',
  branch_admin: 'Branch Admin', oa: 'Operations Asst.', management: 'Management',
  md: 'MD',
};

// Roles available as a transfer destination
const ALL_ROLES_TRANSFER = [
  { value: 'director',       label: 'Director' },
  { value: 'gm',             label: 'General Manager' },
  { value: 'branch_manager', label: 'Branch Manager' },
  { value: 'abm',            label: 'Asst. Branch Manager' },
  { value: 'sales_officer',  label: 'Sales Officer' },
  { value: 'branch_admin',   label: 'Branch Admin' },
  { value: 'oa',             label: 'Operations Assistant' },
];

const TransfersTab = () => {
  // ── employee picker state ──
  const [empSearch, setEmpSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);

  // ── form state ──
  const [form, setForm] = useState({ kind: 'promotion', newRole: '', newBranchId: '', newManagerId: '', replacementManagerId: '', reason: '' });
  const [formErr, setFormErr] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // ── data queries ──
  // Employee search (skip until user types something)
  const { data: empResult = {}, isFetching: searchingEmps } = useGetUsersQuery(
    { search: empSearch || undefined, limit: 50 },
    { skip: !empSearch }
  );
  const empCandidates = empResult.data ?? [];

  const { data: branches = [] } = useGetBranchesQuery();

  // Maps destination role → valid manager roles; mirrors hierarchy-policy.ts ALLOWED_MANAGER_ROLES.
  // Empty array = no strict-role rule (branch_admin, oa) — New Manager field hidden for those.
  const MANAGER_ROLE_MAP = {
    director:       ['md'],
    gm:             ['director'],
    branch_manager: ['gm'],
    abm:            ['branch_manager'],
    sales_officer:  ['abm', 'oa', 'branch_admin', 'branch_manager'],
  };
  // Roles that REQUIRE a manager — backend throws a ValidationError if manager is null.
  const MANAGER_REQUIRED = new Set(['director', 'gm', 'branch_manager', 'abm', 'sales_officer']);

  // New Manager candidates: fetched cross-branch by role via getManagerOptions so that
  // GM, Director, and MD (who have branch_id = NULL) actually appear. A branch-filtered
  // getUsers call returns nothing for them and blocks transfers into high-hierarchy roles.
  const managerRoles = MANAGER_ROLE_MAP[form.newRole] ?? [];
  const { data: newManagerCandidates = [] } = useGetManagerOptionsQuery(
    managerRoles.join(','),
    { skip: !form.newRole || managerRoles.length === 0 }
  );

  // Replacement manager candidates — must come from the person's CURRENT branch (backend rule).
  // camelCase: listUsers returns branchId (aliased in user.service.ts:386).
  const { data: replMgrResult = {} } = useGetUsersQuery(
    { branchId: selectedUser?.branchId, limit: 200 },
    { skip: !selectedUser?.branchId }
  );
  const replacementCandidates = (replMgrResult.data ?? []).filter(u => u.id !== selectedUser?.id);

  const { data: history = [], isLoading: historyLoading } = useListTransferRequestsQuery({});
  const [executeTransfer, { isLoading: isExecuting }] = useExecuteTransferMutation();

  const resetForm = () => {
    setSelectedUser(null);
    setEmpSearch('');
    setForm({ kind: 'promotion', newRole: '', newBranchId: '', newManagerId: '', replacementManagerId: '', reason: '' });
    setFormErr('');
    setFormSuccess('');
  };

  const handleUserSelect = (u) => {
    setSelectedUser(u);
    setEmpSearch('');
    // Pre-fill newRole with the user's current role so management only has to change what's different
    setForm(f => ({ ...f, kind: 'promotion', newRole: u.role, newBranchId: u.branchId ?? '', newManagerId: '', replacementManagerId: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormErr('');
    setFormSuccess('');
    if (!selectedUser) { setFormErr('Select an employee first'); return; }
    if (!form.newRole) { setFormErr('New role is required'); return; }
    if (MANAGER_REQUIRED.has(form.newRole) && !form.newManagerId) { setFormErr('A manager is required for this role'); return; }
    if (form.kind === 'transfer' && !form.newBranchId) { setFormErr('New branch is required for a transfer'); return; }
    const payload = {
      userId:  selectedUser.id,
      kind:    form.kind,
      newRole: form.newRole,
      reason:  form.reason || undefined,
    };
    if (form.newBranchId)          payload.newBranchId          = form.newBranchId;
    if (form.newManagerId)         payload.newManagerId         = form.newManagerId;
    if (form.replacementManagerId) payload.replacementManagerId = form.replacementManagerId;
    try {
      await executeTransfer(payload).unwrap();
      setFormSuccess(`${selectedUser.name} has been transferred successfully.`);
      setTimeout(resetForm, 2500);
    } catch (err) {
      setFormErr(err?.data?.error?.message || 'Transfer failed');
    }
  };

  return (
    <div className="space-y-6">

      {/* ── New Transfer form ─────────────────────────────────────────── */}
      <div className="bg-white p-5 rounded-3xl card-shadow border border-border">
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-5">
          New Transfer / Promotion
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          {formErr && (
            <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs font-bold flex items-center gap-2">
              <AlertCircle size={14} /> {formErr}
            </div>
          )}
          {formSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <CheckCircle2 size={14} /> {formSuccess}
            </div>
          )}

          {/* Employee picker */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
              Employee <span className="text-red-400">*</span>
            </label>
            {selectedUser ? (
              /* Selected employee pill */
              <div className="flex items-center justify-between p-3 bg-navy/[0.03] rounded-2xl border border-border">
                <div>
                  <p className="text-sm font-bold text-navy">{selectedUser.name}</p>
                  <p className="text-[10px] text-navy/40 font-bold mt-0.5">
                    {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                    {` · ${selectedUser.branchName || 'No branch (HQ)'}`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-[10px] font-bold text-navy/40 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50 tactile-press"
                >
                  Change
                </button>
              </div>
            ) : (
              /* Search input + dropdown */
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type employee name or email…"
                  className="w-full px-4 py-3.5 bg-white border border-border rounded-xl text-navy font-bold text-sm placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 outline-none"
                  value={empSearch}
                  onChange={(e) => setEmpSearch(e.target.value)}
                  autoComplete="off"
                />
                {searchingEmps && (
                  <Loader2 size={14} className="animate-spin text-indigo/40 absolute right-4 top-1/2 -translate-y-1/2" />
                )}
                {empSearch && empCandidates.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-border rounded-2xl card-shadow overflow-hidden max-h-56 overflow-y-auto">
                    {empCandidates.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleUserSelect(u)}
                        className="w-full text-left px-4 py-3 hover:bg-indigo/5 transition-colors border-b border-border last:border-b-0"
                      >
                        <p className="text-sm font-bold text-navy">{u.name}</p>
                        <p className="text-[10px] text-navy/40 font-bold mt-0.5">
                          {ROLE_LABELS[u.role] ?? u.role}
                          {` · ${u.branchName || 'No branch (HQ)'}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
                {empSearch && !searchingEmps && empCandidates.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-border rounded-2xl card-shadow px-4 py-3">
                    <p className="text-xs text-navy/40 font-bold">No employees found</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Kind toggle (only when employee selected) */}
          {selectedUser && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Type</label>
              <div className="flex gap-2">
                {[{ v: 'promotion', l: 'Promotion (same branch)' }, { v: 'transfer', l: 'Transfer (new branch)' }].map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, kind: v, newBranchId: v === 'promotion' ? (selectedUser.branchId ?? '') : '', newManagerId: '' }))}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-all tactile-press ${form.kind === v ? 'bg-indigo text-white border-indigo shadow-md shadow-indigo/20' : 'bg-white text-navy/40 border-border hover:border-indigo/30'}`}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* New Role */}
          {selectedUser && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                New Role <span className="text-red-400">*</span>
              </label>
              <select
                required
                className="w-full px-4 py-3.5 bg-white border border-border rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 cursor-pointer outline-none appearance-none"
                value={form.newRole}
                onChange={(e) => setForm(f => ({ ...f, newRole: e.target.value, newManagerId: '' }))}
              >
                <option value="">Select new role…</option>
                {ALL_ROLES_TRANSFER.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* New Branch (transfers only) */}
          {selectedUser && form.kind === 'transfer' && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                New Branch <span className="text-red-400">*</span>
              </label>
              <select
                required
                className="w-full px-4 py-3.5 bg-white border border-border rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 cursor-pointer outline-none appearance-none"
                value={form.newBranchId}
                onChange={(e) => setForm(f => ({ ...f, newBranchId: e.target.value, newManagerId: '' }))}
              >
                <option value="">Select branch…</option>
                {branches.filter(b => b.id !== selectedUser.branchId).map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* New Manager — required for hierarchical roles; hidden for branch_admin / oa (no role rule) */}
          {selectedUser && managerRoles.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                New Manager
                {MANAGER_REQUIRED.has(form.newRole)
                  ? <span className="text-red-400 ml-0.5">*</span>
                  : <span className="font-normal normal-case tracking-normal text-navy/30"> (optional)</span>
                }
              </label>
              <select
                required={MANAGER_REQUIRED.has(form.newRole)}
                className="w-full px-4 py-3.5 bg-white border border-border rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 cursor-pointer outline-none appearance-none"
                value={form.newManagerId}
                onChange={(e) => setForm(f => ({ ...f, newManagerId: e.target.value }))}
              >
                <option value="">Select new manager…</option>
                {newManagerCandidates.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({ROLE_LABELS[u.role] ?? u.role}{u.branchName ? ` · ${u.branchName}` : ''})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Replacement Manager for orphaned team */}
          {selectedUser && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                Replacement Manager{' '}
                <span className="text-navy/30 font-normal normal-case tracking-normal">
                  (required if this person manages a team)
                </span>
              </label>
              <select
                className="w-full px-4 py-3.5 bg-white border border-border rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 cursor-pointer outline-none appearance-none"
                value={form.replacementManagerId}
                onChange={(e) => setForm(f => ({ ...f, replacementManagerId: e.target.value }))}
              >
                <option value="">Not applicable</option>
                {replacementCandidates.map(u => (
                  <option key={u.id} value={u.id}>{u.name} ({ROLE_LABELS[u.role] ?? u.role})</option>
                ))}
              </select>
            </div>
          )}

          {/* Reason */}
          {selectedUser && (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Reason (optional)</label>
              <textarea
                rows={2}
                placeholder="Briefly explain the reason…"
                className="w-full px-4 py-3 bg-white border border-border rounded-xl text-navy font-bold text-sm placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 outline-none resize-none"
                value={form.reason}
                onChange={(e) => setForm(f => ({ ...f, reason: e.target.value }))}
              />
            </div>
          )}

          {selectedUser && (
            <>
              <p className="text-[10px] text-navy/30 font-bold uppercase tracking-widest">
                This takes effect immediately.
              </p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={resetForm}
                  className="flex-1 py-3 rounded-xl border border-border text-navy/40 text-xs font-bold hover:bg-navy/5 transition-colors tactile-press"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isExecuting || !form.newRole}
                  className="flex-1 py-3 rounded-xl bg-indigo text-white text-xs font-bold shadow-lg shadow-indigo/20 disabled:opacity-60 flex items-center justify-center gap-1.5 tactile-press"
                >
                  {isExecuting ? (
                    <><Loader2 className="animate-spin" size={14} /> Executing…</>
                  ) : (
                    <><ArrowUpRight size={14} /> Execute Transfer</>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>

      {/* ── Transfer history (read-only) ─────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
          Transfer History
        </p>

        {historyLoading && (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo/30" size={28} />
          </div>
        )}

        {!historyLoading && history.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-border">
            <div className="w-16 h-16 rounded-xl bg-navy/5 flex items-center justify-center text-navy/20 mb-4">
              <ArrowUpRight size={28} />
            </div>
            <p className="text-sm font-bold text-navy/40">No transfers yet</p>
          </div>
        )}

        <div className="space-y-3">
          {history.map((rec) => (
            <div key={rec.id} className="bg-white p-5 rounded-3xl card-shadow border border-border space-y-4">
              {/* Header */}
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-bold text-navy">{rec.user_name}</p>
                  <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mt-0.5">
                    Executed by {rec.executed_by_name}
                    {rec.decided_at ? ` · ${new Date(rec.decided_at).toLocaleDateString('en-IN')}` : ''}
                  </p>
                </div>
                <div className="px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest text-emerald-600 bg-emerald-50 border-emerald-200">
                  {rec.kind}
                </div>
              </div>

              {/* Change summary grid */}
              <div className="grid grid-cols-2 gap-3 bg-navy/[0.02] rounded-2xl p-3">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Previous Role</p>
                  <p className="text-xs font-bold text-navy mt-0.5">{ROLE_LABELS[rec.previous_role] ?? rec.previous_role ?? '—'}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">New Role</p>
                  <p className="text-xs font-bold text-indigo mt-0.5">{ROLE_LABELS[rec.new_role] ?? rec.new_role}</p>
                </div>
                {rec.new_branch_name && (
                  <div className="col-span-2">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">New Branch</p>
                    <p className="text-xs font-bold text-navy mt-0.5">{rec.new_branch_name}</p>
                  </div>
                )}
                {rec.reason && (
                  <div className="col-span-2">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Reason</p>
                    <p className="text-xs text-navy/60 mt-0.5">{rec.reason}</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
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
          <div key={code} className="bg-white rounded-2xl card-shadow border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : code)}
              className="w-full px-4 py-3 flex items-center justify-between tactile-press hover:bg-navy/[0.01] transition-colors"
            >
              <span className="text-sm font-bold text-navy">{label}</span>
              <ChevronRight size={16} className={`text-navy/30 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 border-t border-border pt-3">
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
          <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
            <table className="w-full border-collapse min-w-max">
              <thead>
                <tr className="bg-navy/[0.02] border-b border-border">
                  {['Tier','Investment','Monthly M1-60','Cash Bonus M51-60','House Worth'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
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
        <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-border">
                <th className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
                {TIER_LABELS.map(t => <th key={t} className="px-3 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{t}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
        <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-border">
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
        <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-border">
                {['Package','Full Amount (M1–10)','Half Amount (M11–20)'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
        <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-border">
                {['Name','Price (₹)','Gold (grams)','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
        <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-navy/[0.02] border-b border-border">
                {['Name','Price (₹)','Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
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
    <div className="bg-white rounded-2xl card-shadow border border-border overflow-x-auto">
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-navy/20" size={24} /></div>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-navy/[0.02] border-b border-border">
              <th className="px-4 py-2.5 text-left text-[9px] font-bold uppercase tracking-wider text-navy/30">Role</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Spot (₹)</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Monthly (₹)</th>
              <th className="px-3 py-2.5 text-right text-[9px] font-bold uppercase tracking-wider text-navy/30">Months</th>
              <th className="px-3 py-2.5 w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map(rule => (
              <LandCommissionRuleRow key={rule.role} layoutId={layoutId} rule={rule} />
            ))}
          </tbody>
        </table>
      )}
      <p className="text-[9px] text-navy/30 px-4 pb-3 flex items-center gap-1 border-t border-border pt-2">
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
          className="bg-white rounded-2xl p-4 card-shadow border border-border text-left tactile-press hover:border-stone-200 transition-colors flex items-center gap-3">
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
          className="bg-white rounded-2xl p-4 card-shadow border border-border text-left tactile-press hover:border-stone-200 transition-colors flex items-center gap-3">
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
          <div className="bg-white rounded-2xl p-6 border border-border card-shadow text-center">
            <Landmark size={24} className="text-navy/20 mx-auto mb-2" />
            <p className="text-xs text-navy/40">Select a site, then a layout to edit commission rules.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Head branch selector (Management only) ───────────────────────────────────
// Management can designate which branch acts as the global head branch for
// Gold Coin, LSS and Chit scheme combine/refund operations. Atomically moves
// the is_head_branch flag on the branches table (old cleared, new set, in one
// transaction) so exactly one branch is always the head branch.
// ─── Mobile app version gate (Management only) ────────────────────────────────
// Controls which Android/iOS builds the native app team considers current and
// minimum-acceptable, plus a force-update flag to block outdated clients.
// The native app reads GET /api/app-version publicly on every launch; this UI
// lets Management update the values without needing curl.
const MobileAppVersionSetting = () => {
  const { data, isLoading }                           = useGetMobileAppVersionQuery();
  const [updateVersion, { isLoading: saving }]        = useUpdateMobileAppVersionMutation();

  // Local form mirrors the four version strings, toggle, and release notes
  const [form, setForm]     = useState({
    androidCurrentVersion: '',
    androidMinimalVersion: '',
    iosCurrentVersion:     '',
    iosMinimalVersion:     '',
    releaseNotes:          '',
  });
  const [forceUpdate, setForceUpdate] = useState(false);
  const [saved, setSaved]             = useState(false);
  const [saveErr, setSaveErr]         = useState(null);
  const [initialised, setInitialised] = useState(false);

  // Seed form from the fetched config on first load only
  useEffect(() => {
    if (data && !initialised) {
      setForm({
        androidCurrentVersion: data.androidCurrentVersion ?? '1.0.0',
        androidMinimalVersion: data.androidMinimalVersion ?? '1.0.0',
        iosCurrentVersion:     data.iosCurrentVersion     ?? '1.0.0',
        iosMinimalVersion:     data.iosMinimalVersion     ?? '1.0.0',
        releaseNotes:          data.releaseNotes           ?? '',
      });
      setForceUpdate(data.forceUpdate ?? false);
      setInitialised(true);
    }
  }, [data, initialised]);

  const handleSave = async () => {
    setSaveErr(null);
    try {
      await updateVersion({
        androidCurrentVersion: form.androidCurrentVersion,
        androidMinimalVersion: form.androidMinimalVersion,
        iosCurrentVersion:     form.iosCurrentVersion,
        iosMinimalVersion:     form.iosMinimalVersion,
        forceUpdate,
        releaseNotes: form.releaseNotes || null,
      }).unwrap();
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveErr(err?.data?.error?.message || 'Failed to update app version config.');
    }
  };

  const handleToggleForce = async () => {
    const next = !forceUpdate;
    setForceUpdate(next);
    setSaveErr(null);
    try {
      await updateVersion({ forceUpdate: next }).unwrap();
    } catch {
      // Revert the optimistic toggle if the server rejected it
      setForceUpdate(!next);
    }
  };

  if (isLoading) return null;

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">

        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Smartphone size={16} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">Mobile App Version</p>
            <p className="text-xs text-navy/40 mt-0.5">
              Controls which Android/iOS builds are accepted. The native app checks this on every launch.
            </p>
          </div>
        </div>

        {/* Version string fields — 2-column grid on wider screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[11px] font-bold text-navy/50 uppercase tracking-widest mb-1">
              Android current
            </label>
            <input
              type="text"
              value={form.androidCurrentVersion}
              onChange={e => { setForm(f => ({ ...f, androidCurrentVersion: e.target.value })); setSaved(false); }}
              placeholder="e.g. 1.2.0"
              className={SCHEME_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-navy/50 uppercase tracking-widest mb-1">
              Android minimum
            </label>
            <input
              type="text"
              value={form.androidMinimalVersion}
              onChange={e => { setForm(f => ({ ...f, androidMinimalVersion: e.target.value })); setSaved(false); }}
              placeholder="e.g. 1.0.0"
              className={SCHEME_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-navy/50 uppercase tracking-widest mb-1">
              iOS current
            </label>
            <input
              type="text"
              value={form.iosCurrentVersion}
              onChange={e => { setForm(f => ({ ...f, iosCurrentVersion: e.target.value })); setSaved(false); }}
              placeholder="e.g. 1.2.0"
              className={SCHEME_INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-navy/50 uppercase tracking-widest mb-1">
              iOS minimum
            </label>
            <input
              type="text"
              value={form.iosMinimalVersion}
              onChange={e => { setForm(f => ({ ...f, iosMinimalVersion: e.target.value })); setSaved(false); }}
              placeholder="e.g. 1.0.0"
              className={SCHEME_INPUT_CLASS}
            />
          </div>
        </div>

        {/* Release notes */}
        <div className="mb-3">
          <label className="block text-[11px] font-bold text-navy/50 uppercase tracking-widest mb-1">
            Release notes (optional)
          </label>
          <textarea
            value={form.releaseNotes}
            onChange={e => { setForm(f => ({ ...f, releaseNotes: e.target.value })); setSaved(false); }}
            placeholder="What changed in this version…"
            rows={3}
            className={SCHEME_INPUT_CLASS}
          />
        </div>

        {/* Force-update toggle + save button row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={handleToggleForce}
              disabled={saving}
              aria-label={forceUpdate ? 'Disable force update' : 'Enable force update'}
              className="flex-shrink-0 tactile-press disabled:opacity-50"
            >
              {saving
                ? <Loader2 size={28} className="animate-spin text-navy/30" />
                : forceUpdate
                  ? <ToggleRight size={28} className="text-red-500" />
                  : <ToggleLeft  size={28} className="text-navy/30" />}
            </button>
            <div className="min-w-0">
              <p className="text-xs font-bold text-navy">Force update</p>
              <p className="text-[11px] text-navy/40">
                {forceUpdate
                  ? 'ON — outdated builds are blocked at launch.'
                  : 'OFF — users can keep using older builds.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-stone-800 text-white text-xs font-bold disabled:opacity-40 tactile-press"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} /> : 'Save'}
          </button>
        </div>

        {saveErr && <p className="text-[11px] text-red-500 mt-1 font-medium">{saveErr}</p>}
        {saved  && <p className="text-[11px] text-emerald-600 mt-1 font-medium">App version config saved successfully.</p>}
      </div>
    </div>
  );
};

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
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
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

// ─── WhatsApp messages toggle (Management only) ───────────────────────────────
// Controls whether scheme purchase/renewal notifications are sent to customers
// via WhatsApp.  Must be ON for messages to go out — acts as the business gate
// on top of the infra gate (WHATSAPP_ENABLED env on the worker).
const WhatsappMessagesToggle = () => {
  const { data, isLoading }   = useGetWhatsappMessagesSettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateWhatsappMessagesSettingMutation();
  const enabled = data?.enabled === true;

  const toggle = async () => {
    try {
      await updateSetting({ enabled: !enabled }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch stays put.
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
              <MessageCircle size={16} className="text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">WhatsApp notifications</p>
              <p className="text-xs text-navy/40 mt-0.5">
                {enabled
                  ? 'ON — customers receive WhatsApp messages on scheme purchases and renewals.'
                  : 'OFF — no WhatsApp messages sent. Enable once Meta setup is complete.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || saving}
            aria-label={enabled ? 'Disable WhatsApp notifications' : 'Enable WhatsApp notifications'}
            className="flex-shrink-0 tactile-press disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={34} className="animate-spin text-navy/30" />
              : enabled
                ? <ToggleRight size={34} className="text-emerald-600" />
                : <ToggleLeft  size={34} className="text-navy/30" />}
          </button>
        </div>
        {enabled && (
          <div className="mt-3 px-3 py-2 bg-emerald-50 rounded-xl">
            <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Active</p>
            <p className="text-xs text-emerald-600 mt-0.5">
              Messages will be sent to customers who have opted in (has_whatsapp = on) when
              they buy a plan or pay a renewal across all schemes.
            </p>
          </div>
        )}
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
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow flex items-center justify-between gap-3">
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

// ─── LSS eligibility bypass toggle (Management only) ─────────────────────────
// While ON, draws can be run on any LSS slot regardless of how long ago the
// customer joined. Turn OFF to restore the 30-day minimum wait.
const LssEligibilityBypassToggle = () => {
  const { data, isLoading }   = useGetLssEligibilityBypassSettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateLssEligibilityBypassSettingMutation();
  const enabled = data?.enabled === true;

  const toggle = async () => {
    try {
      await updateSetting({ enabled: !enabled }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch stays put.
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Layers size={16} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">LSS — bypass 30-day draw eligibility</p>
              <p className="text-xs text-navy/40 mt-0.5">
                {enabled
                  ? 'ON — draws can run on any LSS slot, no waiting period enforced.'
                  : 'OFF — slots must be at least 30 days old before a draw can be run.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || saving}
            aria-label={enabled ? 'Disable LSS eligibility bypass' : 'Enable LSS eligibility bypass'}
            className="flex-shrink-0 tactile-press disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={34} className="animate-spin text-navy/30" />
              : enabled
                ? <ToggleRight size={34} className="text-amber-500" />
                : <ToggleLeft  size={34} className="text-navy/30" />}
          </button>
        </div>
        {enabled && (
          <div className="mt-3 px-3 py-2 bg-amber-50 rounded-xl">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Bypass active</p>
            <p className="text-xs text-amber-600 mt-0.5">
              LSS draws will run on any slot immediately — the 30-day eligibility wait is suspended.
              Turn OFF to restore the normal safeguard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Gold-Coin eligibility bypass toggle (Management only) ───────────────────
// While ON, draws can be run on any Gold-Coin slot regardless of how long ago
// the customer joined. Turn OFF to restore the 30-day minimum wait.
const GoldCoinEligibilityBypassToggle = () => {
  const { data, isLoading }   = useGetGoldCoinEligibilityBypassSettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateGoldCoinEligibilityBypassSettingMutation();
  const enabled = data?.enabled === true;

  const toggle = async () => {
    try {
      await updateSetting({ enabled: !enabled }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch stays put.
    }
  };

  return (
    <div className="px-4 md:px-0 mb-6">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Coins size={16} className="text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">Gold-Coin — bypass 30-day draw eligibility</p>
              <p className="text-xs text-navy/40 mt-0.5">
                {enabled
                  ? 'ON — draws can run on any Gold-Coin slot, no waiting period enforced.'
                  : 'OFF — slots must be at least 30 days old before a draw can be run.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || saving}
            aria-label={enabled ? 'Disable Gold-Coin eligibility bypass' : 'Enable Gold-Coin eligibility bypass'}
            className="flex-shrink-0 tactile-press disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={34} className="animate-spin text-navy/30" />
              : enabled
                ? <ToggleRight size={34} className="text-amber-500" />
                : <ToggleLeft  size={34} className="text-navy/30" />}
          </button>
        </div>
        {enabled && (
          <div className="mt-3 px-3 py-2 bg-amber-50 rounded-xl">
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">Bypass active</p>
            <p className="text-xs text-amber-600 mt-0.5">
              Gold-Coin draws will run on any slot immediately — the 30-day eligibility wait is suspended.
              Turn OFF to restore the normal safeguard.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Daily collection reconciliation toggle (Management only) ─────────────────
// While ON, branch admins must complete a Daily Collection Summary each morning
// before any scheme entries are accepted. Management itself is always exempt.
const DailyCollectionReconciliationToggle = () => {
  const { data, isLoading }   = useGetDailyCollectionReconciliationSettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateDailyCollectionReconciliationSettingMutation();
  const enabled = data?.enabled === true;

  const toggle = async () => {
    try {
      await updateSetting({ enabled: !enabled }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch stays put.
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo/10 flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={16} className="text-indigo" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">Daily Collection Reconciliation</p>
              <p className="text-xs text-navy/40 mt-0.5">
                {enabled
                  ? 'ON — branch admins must declare expected cash before scheme entries each day.'
                  : 'OFF — no morning declaration required; admins access schemes directly.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || saving}
            aria-label={enabled ? 'Disable daily reconciliation' : 'Enable daily reconciliation'}
            className="flex-shrink-0 tactile-press disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={34} className="animate-spin text-navy/30" />
              : enabled
                ? <ToggleRight size={34} className="text-emerald-600" />
                : <ToggleLeft  size={34} className="text-navy/30" />}
          </button>
        </div>
        {enabled && (
          <div className="mt-3 px-3 py-2 bg-indigo/8 rounded-xl">
            <p className="text-[10px] font-bold text-indigo uppercase tracking-widest">Active</p>
            <p className="text-xs text-indigo mt-0.5">
              Branch admins must submit a Daily Collection Summary each morning. Management is always exempt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// Master switch + editable threshold for the chronic-absentee auto-deactivation
// sweep. The toggle and the threshold both write through the same mutation, so
// each action carries the other's current value to avoid clobbering it.
const AutoDeactivationToggle = () => {
  const { data, isLoading }   = useGetAutoDeactivationSettingQuery();
  const [updateSetting, { isLoading: saving }] = useUpdateAutoDeactivationSettingMutation();
  const enabled       = data?.enabled === true;
  const thresholdDays = data?.thresholdDays ?? 90;

  // Draft mirrors the fetched threshold until the user edits it.
  const [draftDays, setDraftDays] = useState('');
  const [daysError, setDaysError] = useState('');
  useEffect(() => { setDraftDays(String(thresholdDays)); }, [thresholdDays]);

  const toggle = async () => {
    try {
      // Carry the current threshold so flipping the switch doesn't reset it.
      await updateSetting({ enabled: !enabled, thresholdDays }).unwrap();
    } catch {
      // Error surfaces on next refetch; the switch stays put.
    }
  };

  const dirty = draftDays !== '' && Number(draftDays) !== thresholdDays;

  const saveDays = async () => {
    const n = Number(draftDays);
    if (!Number.isInteger(n) || n < 7 || n > 365) {
      setDaysError('Enter a whole number between 7 and 365.');
      return;
    }
    setDaysError('');
    try {
      await updateSetting({ enabled, thresholdDays: n }).unwrap();
    } catch {
      setDaysError('Could not save. Try again.');
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
              <UserX size={16} className="text-red-400" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-navy">Auto-Deactivation</p>
              <p className="text-xs text-navy/40 mt-0.5">
                {enabled
                  ? `ON — ABM / Sales Officer / OA accounts with no attendance for ${thresholdDays} days are deactivated daily.`
                  : 'OFF — the daily chronic-absentee sweep is paused; no accounts are auto-deactivated.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggle}
            disabled={isLoading || saving}
            aria-label={enabled ? 'Disable auto-deactivation' : 'Enable auto-deactivation'}
            className="flex-shrink-0 tactile-press disabled:opacity-50"
          >
            {saving
              ? <Loader2 size={34} className="animate-spin text-navy/30" />
              : enabled
                ? <ToggleRight size={34} className="text-emerald-600" />
                : <ToggleLeft  size={34} className="text-navy/30" />}
          </button>
        </div>

        {/* Threshold editor */}
        <div className="mt-3 flex items-center gap-2">
          <label className="text-xs font-bold text-navy/50">Threshold (days)</label>
          <input
            type="number"
            min={7}
            max={365}
            value={draftDays}
            onChange={(e) => setDraftDays(e.target.value)}
            className={`${SCHEME_INPUT_CLASS} w-24`}
          />
          {dirty && (
            <button
              type="button"
              onClick={saveDays}
              disabled={saving}
              className="flex items-center gap-1 px-3 py-2 bg-indigo text-white font-bold text-[11px] rounded-xl tactile-press disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save
            </button>
          )}
        </div>
        {daysError && <p className="text-[11px] font-bold text-red-500 mt-1.5">{daysError}</p>}
      </div>
    </div>
  );
};

// Lists accounts paused by the auto-deactivation sweep and lets Management
// restore them. Reuses the existing /users/deactivated + reactivate endpoints
// (opened to Management alongside MD).
const DeactivatedAccountsSection = () => {
  const { data: deactivated = [], isLoading } = useGetDeactivatedUsersQuery();
  const [reactivateUser] = useReactivateUserMutation();
  const [reactivatingId, setReactivatingId] = useState(null);
  const [error, setError] = useState(null);

  const handleReactivate = async (id) => {
    setReactivatingId(id);
    setError(null);
    try {
      await reactivateUser(id).unwrap();
    } catch (err) {
      setError(err?.data?.error?.message || 'Reactivation failed. Please try again.');
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <div className="px-4 md:px-0 mb-4">
      <div className="bg-white rounded-2xl p-4 border border-border card-shadow">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <UserX size={16} className="text-red-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">Deactivated Accounts</p>
            <p className="text-xs text-navy/40 mt-0.5">
              Accounts paused for chronic absence. Reactivate to restore login.
            </p>
          </div>
        </div>

        {error && <p className="text-[11px] font-bold text-red-500 mb-2">{error}</p>}

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 size={20} className="animate-spin text-navy/30" />
          </div>
        ) : deactivated.length === 0 ? (
          <div className="px-3 py-5 text-center">
            <p className="text-xs text-navy/40">No deactivated accounts.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {deactivated.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 p-3 bg-navy/[0.02] rounded-xl border border-border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-navy text-sm truncate">{u.name}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5">
                    <span className="text-[10px] font-bold text-navy/30 uppercase tracking-wider">
                      {u.role?.replace(/_/g, ' ')}
                    </span>
                    {u.branch_name && (
                      <span className="text-[10px] text-navy/25 font-medium flex items-center gap-1">
                        <MapPin size={9} />
                        {u.branch_name}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5">
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-50 px-2 py-0.5 rounded-full">
                      <CalendarX size={9} />
                      {u.days_inactive} {u.days_inactive === 1 ? 'day' : 'days'} inactive
                    </span>
                    {u.last_present_date && (
                      <span className="text-[10px] text-navy/30 font-medium">
                        Last seen {new Date(u.last_present_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    )}
                    {!u.last_present_date && (
                      <span className="text-[10px] text-navy/25 font-medium">No attendance on record</span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleReactivate(u.id)}
                  disabled={reactivatingId === u.id}
                  className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 font-bold text-[11px] rounded-xl transition-colors disabled:opacity-50"
                >
                  {reactivatingId === u.id
                    ? <Loader2 size={12} className="animate-spin" />
                    : <RotateCcw size={12} />}
                  Reactivate
                </button>
              </div>
            ))}
          </div>
        )}
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
        <div className="bg-white rounded-2xl p-8 border border-border card-shadow text-center">
          <ShieldCheck size={32} className="text-navy/30 mx-auto mb-2" />
          <p className="text-sm font-bold text-navy">Access restricted</p>
          <p className="text-xs text-navy/40 mt-1">Only Management, MD, and Directors can access the Control Center.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-32 pt-4 md:max-w-5xl">

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
      {user?.role === 'management' && <WhatsappMessagesToggle />}
      {user?.role === 'management' && <BackdatedEntryToggle />}
      {user?.role === 'management' && <LssEligibilityBypassToggle />}
      {user?.role === 'management' && <GoldCoinEligibilityBypassToggle />}
      {user?.role === 'management' && <DailyCollectionReconciliationToggle />}
      {user?.role === 'management' && <AutoDeactivationToggle />}
      {user?.role === 'management' && <DeactivatedAccountsSection />}
      {user?.role === 'management' && <HeadBranchSetting />}
      {user?.role === 'management' && <MobileAppVersionSetting />}

      {/* Reconciliation dashboard — accessible to all allowed roles */}
      <div className="px-4 md:px-0 mb-4">
        <button
          type="button"
          onClick={() => navigate('/control-center/reconciliation')}
          className="w-full bg-white rounded-2xl p-4 border border-border card-shadow flex items-center gap-3 tactile-press text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo/10 flex items-center justify-center flex-shrink-0">
            <ChevronRight size={16} className="text-indigo" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-navy">Collection Reconciliation Dashboard</p>
            <p className="text-xs text-navy/40 mt-0.5">Daily declared-vs-actual across all branches</p>
          </div>
          <ChevronRight size={16} className="text-navy/30 flex-shrink-0" aria-hidden="true" />
        </button>
      </div>

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
                    : 'bg-white text-navy/50 border border-border card-shadow hover:text-navy/70'
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
        {activeTab === 'transfers'   && <TransfersTab />}
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
