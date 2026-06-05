// Head-branch admin console for the Agila Chit scheme.
// Mirrors GoldCoinHeadBranchPage exactly in structure and UX.
//
// Two actions:
//   Combine: pick 2+ pending_combine groups from the same package (total ≤ 20
//            members) and merge them into a new head-branch group.
//   Expire:  dissolve a pending_combine group — all active members get their
//            refund_credited_at set automatically.
//
// Read-only fallback for MD / Director.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Loader2, AlertTriangle, Layers, CalendarClock, RefreshCw,
  CircleSlash, CheckCircle2, ShieldCheck, Users,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetChitAwaitingCombineQuery,
  useCombineChitGroupsMutation,
  useExpireChitGroupMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormError } from './components/FormError';

const MAX_MEMBERS = 20;
const VIEWER_ROLES = new Set(['md', 'director', 'branch_admin']);
const isHeadBranchAdmin = (user) => user?.role === 'branch_admin' && user?.isHeadBranch === true;

const PACKAGE_LABELS = { 1: '₹5,000', 2: '₹10,000', 3: '₹15,000', 4: '₹20,000', 5: '₹25,000' };

// ─── Stat pill ────────────────────────────────────────────────────────────────
const StatPill = ({ label, value, tone = 'navy' }) => {
  const cls = { navy: 'text-navy', amber: 'text-amber-700', emerald: 'text-emerald-600', rose: 'text-rose-600' }[tone];
  return (
    <div className="px-3 py-2 bg-white rounded-2xl border border-navy/5 text-center min-w-[78px]">
      <p className={`text-lg font-bold ${cls}`}>{value}</p>
      <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">{label}</p>
    </div>
  );
};

const AccessDenied = () => (
  <SchemePageWrapper>
    <SchemePageHeader backTo="/money/schemes/agila-chit" title="Head Branch" />
    <div className="px-4">
      <div className="bg-white rounded-2xl p-6 border border-navy/5 card-shadow text-center">
        <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access denied</p>
        <p className="text-xs text-navy/50 mt-1">Only the head-branch admin, MD, or Director can view this page.</p>
      </div>
    </div>
  </SchemePageWrapper>
);

// ─── Pending group row ─────────────────────────────────────────────────────────
const PendingGroupRow = ({ group, selectable, selected, onToggle, onExpire, busy }) => (
  <div className={`px-4 py-3 flex items-center gap-3 ${selected ? 'bg-amber-50/60' : ''}`}>
    {selectable && (
      <label className="flex items-center cursor-pointer">
        <input type="checkbox" checked={selected} onChange={onToggle}
          className="w-5 h-5 rounded border-navy/20 text-amber-600 focus:ring-amber-500"
          aria-label={`Select ${group.group_name} for combining`} />
      </label>
    )}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-bold text-navy truncate">
        {group.branch_name} · {group.group_name}
        {group.is_combined && (
          <span className="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">COMBINED</span>
        )}
      </p>
      <p className="text-[11px] text-navy/40 truncate flex items-center gap-1.5">
        <Users size={10} aria-hidden="true" />
        {group.member_count}/{MAX_MEMBERS} members
        {group.fill_deadline && ` · deadline ${formatDate(group.fill_deadline)}`}
      </p>
    </div>
    {selectable && (
      <button type="button" disabled={busy} onClick={() => onExpire(group)}
        className="px-2.5 py-1.5 rounded-full bg-red-50 text-red-700 text-[11px] font-bold tactile-press disabled:opacity-50">
        Expire
      </button>
    )}
  </div>
);

// ─── Card per package ─────────────────────────────────────────────────────────
const PackageGroup = ({ packageNumber, groups, selectable, selectedIds, onToggleGroup, onClearSelection, onCombine, onExpire, busy }) => {
  const selectedInGroup  = groups.filter(g => selectedIds.has(g.id));
  const totalMembersInSel = selectedInGroup.reduce((sum, g) => sum + (g.member_count ?? 0), 0);
  const canCombine       = selectedInGroup.length >= 2 && totalMembersInSel <= MAX_MEMBERS;

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-navy/5 flex items-center justify-between bg-navy/[0.02]">
        <div>
          <p className="text-sm font-bold text-navy">Package {packageNumber} — {PACKAGE_LABELS[packageNumber]}</p>
          <p className="text-[11px] text-navy/40">
            {groups.length} group{groups.length !== 1 ? 's' : ''} pending ·
            {' '}{groups.reduce((s, g) => s + (g.member_count ?? 0), 0)} members
          </p>
        </div>
        {selectable && (
          <button type="button" disabled={!canCombine || busy} onClick={() => onCombine(groups)}
            className="px-3 py-1.5 rounded-full bg-violet-600 text-white text-[11px] font-bold tactile-press disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5">
            <Layers size={12} aria-hidden="true" />
            Combine ({selectedInGroup.length})
          </button>
        )}
      </div>

      <div className="divide-y divide-navy/5">
        {groups.map(group => (
          <PendingGroupRow key={group.id} group={group} selectable={selectable}
            selected={selectedIds.has(group.id)} onToggle={() => onToggleGroup(group.id)}
            onExpire={onExpire} busy={busy} />
        ))}
      </div>

      {selectable && selectedInGroup.length > 0 && (
        <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/50 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-amber-800">
            {selectedInGroup.length} selected · {totalMembersInSel}/{MAX_MEMBERS} members
            {totalMembersInSel > MAX_MEMBERS && <span className="text-red-600 ml-1">— exceeds {MAX_MEMBERS}</span>}
          </p>
          <button type="button" onClick={() => onClearSelection(groups.map(g => g.id))}
            className="text-[11px] font-semibold text-navy/50 hover:text-navy/80">
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export const ChitHeadBranchPage = () => {
  const navigate = useNavigate();
  const user     = useSelector(selectCurrentUser);
  const canView  = VIEWER_ROLES.has(user?.role);
  const canAct   = isHeadBranchAdmin(user);

  const { data: awaitingGroups, isLoading, isFetching, refetch } =
    useGetChitAwaitingCombineQuery(undefined, { skip: !canView });
  const [combineGroups, { isLoading: combining }] = useCombineChitGroupsMutation();
  const [expireGroup,   { isLoading: expiring }]  = useExpireChitGroupMutation();
  const busy = combining || expiring;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [error,  setError]  = useState(null);
  const [notice, setNotice] = useState(null);

  const groups = useMemo(() => awaitingGroups ?? [], [awaitingGroups]);

  const groupedByPackage = useMemo(() => {
    const map = new Map();
    for (const g of groups) {
      const list = map.get(g.package_number) ?? [];
      list.push(g);
      map.set(g.package_number, list);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([packageNumber, pkgGroups]) => ({ packageNumber, groups: pkgGroups }));
  }, [groups]);

  const totals = useMemo(() => ({
    totalGroups:   groups.length,
    totalMembers:  groups.reduce((s, g) => s + (g.member_count ?? 0), 0),
    combinable:    groupedByPackage.filter(pg => pg.groups.length >= 2).length,
  }), [groups, groupedByPackage]);

  const toggleGroup = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const clearGroupSelection = (ids) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  };

  const onCombine = async (pkgGroups) => {
    setError(null);
    const sourceGroupIds = pkgGroups.filter(g => selectedIds.has(g.id)).map(g => g.id);
    if (sourceGroupIds.length < 2) { setError('Pick at least 2 groups from the same package to combine.'); return; }
    const totalMembers = pkgGroups.filter(g => selectedIds.has(g.id)).reduce((s, g) => s + (g.member_count ?? 0), 0);
    if (totalMembers > MAX_MEMBERS) { setError(`Combined member count (${totalMembers}) exceeds ${MAX_MEMBERS}. Deselect some groups.`); return; }

    const notes = window.prompt(
      `Combine ${sourceGroupIds.length} groups into a new head-branch group?\n\nAll ${totalMembers} members and their payment history will be moved. Source groups will be marked as combined.\n\nOptional notes:`,
      ''
    );
    if (notes === null) return;
    try {
      const res = await combineGroups({ sourceGroupIds, notes: notes.trim() || undefined }).unwrap();
      setNotice(`Combined ${res.sourceCount} group${res.sourceCount !== 1 ? 's' : ''} · ${res.membersMoved} members moved. ${res.groupActivated ? 'New group is now ACTIVE — winner selection can begin!' : 'New group is forming.'}`);
      clearGroupSelection(pkgGroups.map(g => g.id));
    } catch (err) { setError(err?.data?.error?.message || 'Combine failed.'); }
  };

  const onExpire = async (group) => {
    setError(null);
    const reason = window.prompt(
      `Expire group "${group.group_name}" (${group.branch_name})?\n\nAll ${group.member_count} active members will be marked as refunded automatically. This cannot be undone.\n\nReason (optional):`,
      ''
    );
    if (reason === null) return;
    try {
      const res = await expireGroup(group.id).unwrap();
      setNotice(`Group "${group.group_name}" expired. ${res.membersRefunded} member${res.membersRefunded !== 1 ? 's' : ''} marked as refunded.`);
    } catch (err) { setError(err?.data?.error?.message || 'Expire failed.'); }
  };

  if (!canView) return <AccessDenied />;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/agila-chit"
        title="Head Branch — Chit"
        subtitle={canAct ? 'Combine or expire pending groups across all branches' : 'Read-only view of pending groups'}
        action={(
          <button type="button" onClick={() => refetch()} aria-label="Refresh" disabled={isFetching}
            className="w-10 h-10 rounded-2xl bg-white border border-navy/10 flex items-center justify-center text-navy/60 shadow-sm tactile-press">
            <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        )}
      />

      {/* Summary strip */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <StatPill label="Pending"    value={totals.totalGroups}  tone="amber" />
          <StatPill label="Members"   value={totals.totalMembers} tone="navy" />
          <StatPill label="Combinable" value={totals.combinable}   tone="emerald" />
        </div>
      </div>

      {/* Notices */}
      <div className="px-4 mb-4 space-y-3">
        <FormError error={error} />
        {notice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-2">
            <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs font-semibold text-emerald-800">{notice}</p>
          </div>
        )}
        {!canAct && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-start gap-2">
            <AlertTriangle size={14} className="text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs font-semibold text-blue-800">
              You can see what's pending, but only the head-branch admin can combine or expire groups.
            </p>
          </div>
        )}
      </div>

      {/* Groups by package */}
      <div className="px-4 mb-10">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo" size={24} aria-hidden="true" />
          </div>
        ) : groupedByPackage.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 card-shadow border border-navy/5 text-center">
            <CalendarClock size={32} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-navy/40">No pending groups</p>
            <p className="text-xs text-navy/30 mt-1">All groups are filling within their deadline.</p>
            <button type="button" onClick={() => navigate('/money/schemes/agila-chit')}
              className="mt-4 px-4 py-2 rounded-full bg-violet-600 text-white text-xs font-bold tactile-press">
              Back to Chit Fund
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByPackage.map(({ packageNumber, groups: pkgGroups }) => (
              <PackageGroup
                key={packageNumber}
                packageNumber={packageNumber}
                groups={pkgGroups}
                selectable={canAct}
                selectedIds={selectedIds}
                onToggleGroup={toggleGroup}
                onClearSelection={clearGroupSelection}
                onCombine={onCombine}
                onExpire={onExpire}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default ChitHeadBranchPage;
