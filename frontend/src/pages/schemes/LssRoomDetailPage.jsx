// LSS Room detail.
//
// Shows the room metadata, its 20 slots, and any draws that have happened.
// Each draw records a payout_amount (plan × (1.5 + level × 0.025)).
// Action buttons appear based on status + role:
//   filling + 20 slots → Activate (branch_admin)
//   filling < 20 slots → Send to head branch (branch_admin)
//   active             → Run Draw
//   pending_combine    → (head-branch admin handles from the head page)

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Trophy, CircleSlash, User, Clock, CheckCircle2, AlertTriangle } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLssRoomQuery,
  useActivateLssRoomMutation,
  useRunLssDrawMutation,
  useSendLssRoomToHeadBranchMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

const SLOTS_PER_ROOM = 20;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const STATUS_STYLES = {
  filling:         { label: 'Filling',         className: 'bg-blue-50 text-blue-600',       Icon: Clock },
  pending_combine: { label: 'Pending combine', className: 'bg-amber-50 text-amber-700',     Icon: AlertTriangle },
  combined_into:   { label: 'Combined into another room', className: 'bg-navy/5 text-navy/60', Icon: User },
  expired:         { label: 'Expired',         className: 'bg-red-50 text-red-600',         Icon: AlertTriangle },
  active:          { label: 'Active',          className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  completed:       { label: 'Completed',       className: 'bg-indigo/10 text-indigo',       Icon: CheckCircle2 },
};

const WRITER_ROLES = new Set(['branch_admin']);

const isEligible = (s) => Date.now() - new Date(s.paid_at).getTime() >= THIRTY_DAYS_MS;
const daysUntilEligible = (s) =>
  Math.max(1, Math.ceil((THIRTY_DAYS_MS - (Date.now() - new Date(s.paid_at).getTime())) / 86400000));

export const LssRoomDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);
  const canWrite = WRITER_ROLES.has(user?.role);

  const { data: room, isLoading, error } = useGetLssRoomQuery(id);
  const [activate,   { isLoading: activating }] = useActivateLssRoomMutation();
  const [runDraw,    { isLoading: drawing }]    = useRunLssDrawMutation();
  const [sendToHead, { isLoading: sending }]    = useSendLssRoomToHeadBranchMutation();
  const [hideIneligible, setHideIneligible]     = useState(true);

  const eligibleHeldCount = useMemo(
    () => (room?.slots ?? []).filter(s => s.status === 'held' && isEligible(s)).length,
    [room?.slots]
  );

  if (isLoading) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/lss" title="Room" />
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
        </div>
      </SchemePageWrapper>
    );
  }

  if (error || !room) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/lss" title="Room not found" />
        <div className="px-4 text-center py-12 text-navy/40 text-sm">Could not load this room.</div>
      </SchemePageWrapper>
    );
  }

  const style     = STATUS_STYLES[room.status] || STATUS_STYLES.filling;
  const StatusIcon = style.Icon;
  const heldSlots  = room.slots.filter(s => s.status === 'held').length;
  const canActivate   = canWrite && room.status === 'filling' && heldSlots === SLOTS_PER_ROOM;
  const canSendToHead = canWrite && room.status === 'filling' && heldSlots < SLOTS_PER_ROOM;
  const canDraw       = canWrite && room.status === 'active';

  // Next draw number = draws done + 1; used to show projected payout
  const nextDrawNumber   = room.draws.length + 1;
  const planPrice        = parseFloat(room.plan_price);
  const nextPayoutAmount = planPrice * (1.5 + nextDrawNumber * 0.025);

  const onActivate = async () => {
    try {
      await activate({ id }).unwrap();
    } catch (err) {
      alert(err?.data?.error?.message || 'Activation failed');
    }
  };

  const onSendToHead = async () => {
    const ok = window.confirm(
      `Send Room #${room.room_number} to the head branch?\n\n` +
      `This makes it available for combining. New slot sales will open a fresh room.`
    );
    if (!ok) return;
    try {
      await sendToHead(id).unwrap();
    } catch (err) {
      const msg = err?.data?.error?.message || '';
      if (msg.includes('ROOM_INVALID_TRANSITION') || msg.includes('pending_combine')) {
        alert('This room has already been sent to the head branch.');
      } else {
        alert(msg || 'Could not send room to head branch');
      }
    }
  };

  const onPickWinner = async (slot) => {
    const ok = window.confirm(
      `Eliminate slot ${slot.slot_number} (${slot.customer_name})?\n\n` +
      `Draw #${nextDrawNumber} — payout: ${formatCurrency(nextPayoutAmount)}\n\n` +
      `This records the next draw with this slot as the winner. Cannot be undone.`
    );
    if (!ok) return;
    try {
      const result = await runDraw({ id, winningSlotId: slot.id }).unwrap();
      window.alert(
        `Slot ${result.winningSlotNumber} won draw ${result.draw.draw_number}.\n` +
        `Payout: ${formatCurrency(result.payoutAmount)}`
      );
    } catch (err) {
      window.alert(err?.data?.error?.message || 'Draw failed');
    }
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/lss"
        title={`${room.plan_name} · Room #${room.room_number}`}
        subtitle={`${room.branch_name}${room.is_combined ? ' · combined room' : ''}`}
      />

      {/* Status + key facts */}
      <div className="px-4 mb-5">
        <div className="bg-white rounded-2xl p-4 card-shadow border border-navy/5">
          <div className="flex items-center justify-between mb-3">
            <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${style.className}`}>
              <StatusIcon size={12} aria-hidden="true" />
              {style.label}
            </div>
            <p className="text-xs font-medium text-navy/40">
              Created {formatDate(room.created_at)}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-navy">{heldSlots}/{SLOTS_PER_ROOM}</p>
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Held slots</p>
            </div>
            <div>
              <p className="text-lg font-bold text-navy">{room.draws.length}/{SLOTS_PER_ROOM}</p>
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Draws done</p>
            </div>
            <div>
              <p className="text-lg font-bold text-violet-700">{formatCurrency(planPrice)}</p>
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Slot price</p>
            </div>
          </div>
          {room.fill_deadline && room.status === 'filling' && (
            <p className="text-[11px] text-navy/40 mt-3 text-center">
              Fill deadline: {formatDate(room.fill_deadline)}
            </p>
          )}
          {room.first_draw_date && (
            <p className="text-[11px] text-navy/40 mt-1 text-center">
              First draw: {formatDate(room.first_draw_date)}
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      {canActivate && (
        <div className="px-4 mb-5">
          <button
            type="button"
            onClick={onActivate}
            disabled={activating}
            className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-semibold text-sm tactile-press disabled:opacity-50"
          >
            {activating ? 'Activating…' : 'Activate room'}
          </button>
        </div>
      )}

      {canSendToHead && (
        <div className="px-4 mb-5">
          <button
            type="button"
            onClick={onSendToHead}
            disabled={sending}
            className="w-full py-3 rounded-2xl bg-amber-500 text-white font-semibold text-sm tactile-press disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send to head branch'}
          </button>
          <p className="text-[10px] text-navy/40 text-center mt-1.5">
            Room will become available for combining at the head branch
          </p>
        </div>
      )}

      {/* Draw mode banner with next projected payout */}
      {canDraw && (
        <div className="px-4 mb-4">
          <div className="px-4 py-3 bg-violet-50 border border-violet-200 rounded-2xl">
            <p className="text-xs font-semibold text-violet-800">
              Draw mode active — tap "Eliminate" on the held slot you want to record as the next winner.
            </p>
            <p className="text-xs text-violet-600 mt-1">
              Draw #{nextDrawNumber} payout: <span className="font-bold">{formatCurrency(nextPayoutAmount)}</span>
            </p>
          </div>
        </div>
      )}

      {/* Eligibility filter chip */}
      {canDraw && (
        <div className="px-4 mb-4">
          <button
            type="button"
            onClick={() => setHideIneligible((v) => !v)}
            className={`px-4 py-2 rounded-full text-xs font-semibold tactile-press ${
              hideIneligible
                ? 'bg-navy text-white'
                : 'bg-white text-navy/60 border border-navy/10'
            }`}
          >
            {hideIneligible
              ? `Eligible only (${eligibleHeldCount}/${heldSlots})`
              : `Show all (${heldSlots} held)`}
          </button>
        </div>
      )}

      {/* Slots */}
      <div className="px-4 mb-6">
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-3">Slots</p>
        <div className="bg-white rounded-2xl card-shadow border border-navy/5 divide-y divide-navy/5 overflow-hidden">
          {room.slots.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-navy/40">No slots yet.</p>
          ) : (
            room.slots
              .filter((s) => {
                if (!canDraw || !hideIneligible) return true;
                return s.status !== 'held' || isEligible(s);
              })
              .map((s) => {
                const isWon      = s.status === 'won';
                const isRefunded = s.status === 'refunded';
                const isHeld     = !isWon && !isRefunded;
                const eligible   = isEligible(s);
                const canPick    = canDraw && isHeld && eligible;
                return (
                  <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isWon       ? 'bg-emerald-100 text-emerald-700'
                        : isRefunded ? 'bg-red-100 text-red-600'
                        :              'bg-navy/5 text-navy/70'
                      }`}>
                        {s.slot_number}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">{s.customer_name}</p>
                        <p className="text-[11px] text-navy/40 truncate">
                          {s.customer_code} · {s.source_branch_name}
                          {s.referrer_name && ` · via ${s.referrer_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isWon && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold">
                          <Trophy size={12} className="text-emerald-600" />
                          <span className="text-emerald-700">Won</span>
                        </div>
                      )}
                      {isRefunded && (
                        <div className="flex items-center gap-1 text-[11px] font-semibold">
                          <CircleSlash size={12} className="text-red-500" />
                          <span className="text-red-600">Refunded</span>
                        </div>
                      )}
                      {isHeld && !canPick && !canDraw && (
                        <span className="text-[11px] font-semibold text-navy/40">Held</span>
                      )}
                      {isHeld && !canPick && canDraw && eligible && (
                        <span className="text-[11px] font-semibold text-navy/40">Held</span>
                      )}
                      {isHeld && canDraw && !eligible && (
                        <span className="text-[11px] font-semibold text-amber-500/80">
                          Eligible in {daysUntilEligible(s)}d
                        </span>
                      )}
                      {canPick && (
                        <button
                          type="button"
                          onClick={() => onPickWinner(s)}
                          disabled={drawing}
                          className="px-3 py-1.5 rounded-full bg-violet-600 text-white text-[11px] font-bold tactile-press disabled:opacity-50"
                        >
                          Eliminate
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* Draw history */}
      {room.draws.length > 0 && (
        <div className="px-4 mb-10">
          <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-3">Draw history</p>
          <div className="bg-white rounded-2xl card-shadow border border-navy/5 divide-y divide-navy/5 overflow-hidden">
            {room.draws.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-navy">
                    Draw #{d.draw_number} · Slot {d.winning_slot_number}
                  </p>
                  <p className="text-[11px] text-navy/40">
                    {d.winning_customer_name} ({d.customer_code})
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-violet-700">{formatCurrency(parseFloat(d.payout_amount))}</p>
                  <p className="text-[11px] font-medium text-navy/50">{formatDate(d.draw_date)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default LssRoomDetailPage;
