// LSS — Head-branch admin console.
//
// Backend enforces "branch_admin at a branch with is_head_branch = true"
// via CombineService.assertHeadBranchAdmin.
//
// Two head-branch-only actions:
//   - Combine: pick N pending_combine rooms from the same plan, fold the
//     first 20 held slots into a new room owned by the head branch.
//   - Refund: refund every held slot in one pending_combine room (room → expired).
//
// MD / Director see the same dashboard read-only.

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Loader2,
  AlertTriangle,
  Layers,
  CalendarClock,
  RefreshCw,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLssAwaitingCombineQuery,
  useGetLssPlansQuery,
  useCombineLssRoomsMutation,
  useRefundLssRoomMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormError } from './components/FormError';

const SLOTS_PER_ROOM = 20;

const VIEWER_ROLES = new Set(['md', 'director', 'branch_admin']);

const isHeadBranchAdmin = (user) =>
  user?.role === 'branch_admin' && user?.isHeadBranch === true;

const StatPill = ({ label, value, tone = 'navy' }) => {
  const toneClass = {
    navy:    'text-navy',
    amber:   'text-amber-700',
    rose:    'text-rose-600',
    emerald: 'text-emerald-600',
  }[tone];
  return (
    <div className="px-3 py-2 bg-white rounded-2xl border border-navy/5 text-center min-w-[78px]">
      <p className={`text-lg font-bold ${toneClass}`}>{value}</p>
      <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">{label}</p>
    </div>
  );
};

const AccessDenied = ({ reason }) => (
  <SchemePageWrapper>
    <SchemePageHeader backTo="/money/schemes/lss" title="Head Branch" />
    <div className="px-4">
      <div className="bg-white rounded-2xl p-6 border border-navy/5 card-shadow text-center">
        <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access denied</p>
        <p className="text-xs text-navy/50 mt-1">{reason}</p>
      </div>
    </div>
  </SchemePageWrapper>
);

const PendingRoomRow = ({ room, selectable, selected, onToggle, onRefund, busy }) => {
  const filled = room.slots_filled ?? 0;
  return (
    <div className={`px-4 py-3 flex items-center gap-3 ${selected ? 'bg-amber-50/60' : ''}`}>
      {selectable && (
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="w-5 h-5 rounded border-navy/20 text-amber-600 focus:ring-amber-500"
            aria-label={`Select room ${room.room_number} for combining`}
          />
        </label>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-navy">
          {room.branch_name} · Room #{room.room_number}
          {room.is_combined && (
            <span className="ml-2 text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full">
              COMBINED
            </span>
          )}
        </p>
        <p className="text-[11px] text-navy/40 truncate">
          {filled}/{SLOTS_PER_ROOM} slots held · deadline {formatDate(room.fill_deadline)}
        </p>
      </div>
      {selectable && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRefund(room)}
            className="px-2.5 py-1.5 rounded-full bg-red-50 text-red-700 text-[11px] font-bold tactile-press disabled:opacity-50"
          >
            Refund
          </button>
        </div>
      )}
    </div>
  );
};

const PackageGroup = ({
  pkg,
  rooms,
  selectable,
  selectedIds,
  onToggleRoom,
  onClearSelection,
  onCombine,
  onRefund,
  busy,
}) => {
  const selectedInGroup = rooms.filter((r) => selectedIds.has(r.id));
  const totalHeldInSelection = selectedInGroup.reduce(
    (sum, r) => sum + (r.slots_filled ?? 0),
    0,
  );
  const enoughForCombine =
    selectedInGroup.length >= 2 && totalHeldInSelection >= SLOTS_PER_ROOM;

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden">
      <div className="px-4 py-3 border-b border-navy/5 flex items-center justify-between bg-navy/[0.02]">
        <div>
          <p className="text-sm font-bold text-navy">{pkg?.name ?? rooms[0].plan_name}</p>
          <p className="text-[11px] text-navy/40">
            {formatCurrency(parseFloat(rooms[0].plan_price))} / slot ·
            {' '}{rooms.length} room{rooms.length > 1 ? 's' : ''} pending
          </p>
        </div>
        {selectable && (
          <button
            type="button"
            disabled={!enoughForCombine || busy}
            onClick={() => onCombine(rooms)}
            className="px-3 py-1.5 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-[11px] font-bold tactile-press disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            <Layers size={12} aria-hidden="true" />
            Combine ({selectedInGroup.length})
          </button>
        )}
      </div>

      <div className="divide-y divide-navy/5">
        {rooms.map((room) => (
          <PendingRoomRow
            key={room.id}
            room={room}
            selectable={selectable}
            selected={selectedIds.has(room.id)}
            onToggle={() => onToggleRoom(room.id)}
            onRefund={onRefund}
            busy={busy}
          />
        ))}
      </div>

      {selectable && selectedInGroup.length > 0 && (
        <div className="px-4 py-2 border-t border-amber-100 bg-amber-50/50 flex items-center justify-between">
          <p className="text-[11px] font-semibold text-amber-800">
            {selectedInGroup.length} selected · {totalHeldInSelection}/{SLOTS_PER_ROOM} slots
          </p>
          <button
            type="button"
            onClick={() => onClearSelection(rooms.map((r) => r.id))}
            className="text-[11px] font-semibold text-navy/50 hover:text-navy/80"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
};

export const LssHeadBranchPage = () => {
  const navigate = useNavigate();
  const user     = useSelector(selectCurrentUser);
  const canView  = VIEWER_ROLES.has(user?.role);
  const canAct   = isHeadBranchAdmin(user);

  const {
    data: awaitingCombineRooms,
    isLoading: roomsLoading,
    isFetching: roomsFetching,
    refetch,
  } = useGetLssAwaitingCombineQuery(undefined, { skip: !canView });
  const { data: plans = [] } = useGetLssPlansQuery(undefined, { skip: !canView });

  const [combineRooms, { isLoading: combining }] = useCombineLssRoomsMutation();
  const [refundRoom,   { isLoading: refunding }] = useRefundLssRoomMutation();
  const busy = combining || refunding;

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [error,  setError]  = useState(null);
  const [notice, setNotice] = useState(null);

  const rooms = useMemo(() => awaitingCombineRooms ?? [], [awaitingCombineRooms]);

  const groupedByPlan = useMemo(() => {
    const map = new Map();
    for (const room of rooms) {
      const list = map.get(room.plan_id) ?? [];
      list.push(room);
      map.set(room.plan_id, list);
    }
    return Array.from(map.entries()).map(([planId, planRooms]) => ({
      planId,
      pkg: plans.find((p) => p.id === planId),
      rooms: planRooms,
    }));
  }, [rooms, plans]);

  const totals = useMemo(() => {
    const totalRooms = rooms.length;
    const totalHeldSlots = rooms.reduce((sum, r) => sum + (r.slots_filled ?? 0), 0);
    const totalCombineCandidates = groupedByPlan.filter(
      (g) => g.rooms.reduce((s, r) => s + (r.slots_filled ?? 0), 0) >= SLOTS_PER_ROOM,
    ).length;
    return { totalRooms, totalHeldSlots, totalCombineCandidates };
  }, [rooms, groupedByPlan]);

  const toggleRoom = (roomId) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId); else next.add(roomId);
      return next;
    });
  };

  const clearGroupSelection = (roomIdsInGroup) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of roomIdsInGroup) next.delete(id);
      return next;
    });
  };

  const onCombine = async (roomsInGroup) => {
    setError(null);
    const sourceRoomIds = roomsInGroup
      .filter((r) => selectedIds.has(r.id))
      .map((r) => r.id);
    if (sourceRoomIds.length < 2) {
      setError('Pick at least 2 rooms from the same plan to combine.');
      return;
    }
    const reason = window.prompt(
      `Combine ${sourceRoomIds.length} rooms?\n\nThe first ${SLOTS_PER_ROOM} held slots (earliest paid first) will be moved into a new room owned by your branch. Source rooms with zero remaining slots will be marked combined.\n\nOptional notes for the combined room:`,
      '',
    );
    if (reason === null) return;
    try {
      const res = await combineRooms({
        sourceRoomIds,
        notes: reason.trim() || undefined,
      }).unwrap();
      setNotice(
        `Combined ${res.sourceRooms} room${res.sourceRooms === 1 ? '' : 's'} into a new room with ${res.slotsMoved} slots.`,
      );
      clearGroupSelection(roomsInGroup.map((r) => r.id));
    } catch (err) {
      setError(err?.data?.error?.message || 'Combine failed.');
    }
  };

  const onRefund = async (room) => {
    setError(null);
    const reason = window.prompt(
      `Refund room #${room.room_number} (${room.branch_name})?\n\nAll held slots will be marked refunded. The room will be expired and can no longer be activated. This cannot be undone.\n\nReason (optional):`,
      '',
    );
    if (reason === null) return;
    try {
      const res = await refundRoom({ id: room.id, reason: reason.trim() || undefined }).unwrap();
      setNotice(`Refunded ${res.slotsRefunded} slot(s) in room #${room.room_number}.`);
    } catch (err) {
      setError(err?.data?.error?.message || 'Refund failed.');
    }
  };

  if (!canView) {
    return <AccessDenied reason="Only the head-branch admin, MD, or Director can view this page." />;
  }

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/lss"
        title="Head Branch"
        subtitle={
          canAct
            ? 'Combine or refund pending rooms across all branches'
            : 'Read-only view of pending rooms across all branches'
        }
        action={(
          <button
            type="button"
            onClick={() => refetch()}
            aria-label="Refresh"
            className="w-10 h-10 rounded-2xl bg-white border border-navy/10 flex items-center justify-center text-navy/60 shadow-sm tactile-press"
            disabled={roomsFetching}
          >
            <RefreshCw size={16} className={roomsFetching ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        )}
      />

      {/* Summary strip */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-3xl p-4 card-shadow border border-navy/5 flex items-center gap-2 overflow-x-auto scrollbar-none">
          <StatPill label="Pending rooms"    value={totals.totalRooms}             tone="amber" />
          <StatPill label="Held slots"       value={totals.totalHeldSlots}         tone="navy" />
          <StatPill label="Combinable"       value={totals.totalCombineCandidates} tone="emerald" />
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
              You can see what's pending, but only the head-branch admin can combine or refund rooms.
            </p>
          </div>
        )}
      </div>

      {/* Groups */}
      <div className="px-4 mb-10">
        {roomsLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="animate-spin text-indigo" size={24} aria-hidden="true" />
          </div>
        ) : groupedByPlan.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 card-shadow border border-navy/5 text-center">
            <CalendarClock size={32} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-navy/40">No pending rooms</p>
            <p className="text-xs text-navy/30 mt-1">All filling rooms are within deadline.</p>
            <button
              type="button"
              onClick={() => navigate('/money/schemes/lss')}
              className="mt-4 px-4 py-2 rounded-full bg-navy text-white text-xs font-bold tactile-press"
            >
              Back to LSS
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {groupedByPlan.map((group) => (
              <PackageGroup
                key={group.planId}
                pkg={group.pkg}
                rooms={group.rooms}
                selectable={canAct}
                selectedIds={selectedIds}
                onToggleRoom={toggleRoom}
                onClearSelection={clearGroupSelection}
                onCombine={onCombine}
                onRefund={onRefund}
                busy={busy}
              />
            ))}
          </div>
        )}
      </div>
    </SchemePageWrapper>
  );
};

export default LssHeadBranchPage;
