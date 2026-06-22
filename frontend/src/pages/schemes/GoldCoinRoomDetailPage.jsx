// Gold Coin Room detail.
//
// Shows the room metadata, its 16 slots, and any draws that have happened.
// Action buttons appear based on status + role:
//   filling/pending_combine + 16 slots → Activate (branch_admin / md / director)
//   active                              → Run Draw
//   pending_combine                     → Extend (head-branch admin)

import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Loader2, Trophy, CircleSlash, User, Clock, CheckCircle2, AlertTriangle, Edit2, UserMinus, Trash2, X, Check } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetGoldCoinRoomQuery,
  useActivateGoldCoinRoomMutation,
  useRunGoldCoinDrawMutation,
  useUndoGoldCoinDrawMutation,
  useSendGoldCoinRoomToHeadBranchMutation,
  useVoidGoldCoinRoomMutation,
  useRemoveGoldCoinSlotMutation,
  useCorrectGoldCoinSlotMutation,
  useGetGoldEmployeesQuery,
  useGetGoldCoinEligibilityBypassSettingQuery,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { CustomerPicker } from '../../components/CustomerPicker';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

const STATUS_STYLES = {
  filling:         { label: 'Filling',         className: 'bg-blue-50 text-blue-600',       Icon: Clock },
  pending_combine: { label: 'Pending combine', className: 'bg-amber-50 text-amber-700',     Icon: AlertTriangle },
  combined_into:   { label: 'Combined into another room', className: 'bg-navy/5 text-navy/60', Icon: User },
  expired:         { label: 'Expired',         className: 'bg-red-50 text-red-600',         Icon: AlertTriangle },
  active:          { label: 'Active',          className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  completed:       { label: 'Completed',       className: 'bg-indigo/10 text-indigo',       Icon: CheckCircle2 },
};

const WRITER_ROLES    = new Set(['branch_admin']);
const IC = 'w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20';
const PAYMENT_MODES   = ['cash', 'gpay', 'bank_receipt'];
const MODE_LABEL      = { cash: 'Cash', gpay: 'GPay', bank_receipt: 'Bank Receipt' };

// ─── Per-slot admin actions (Edit + Remove) ─────────────────────────────────

const SlotAdminActions = ({ slot, branchId }) => {
  const { data: employees = [] } = useGetGoldEmployeesQuery();
  const [correctSlot] = useCorrectGoldCoinSlotMutation();
  const [removeSlot]  = useRemoveGoldCoinSlotMutation();

  const [editOpen,   setEditOpen]   = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [form,  setForm]  = useState({
    customer:    null,
    referrerId:  slot.referrer_id || '',
    paymentMode: slot.payment_mode || 'cash',
    notes:       slot.notes || '',
  });

  const handleEdit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const payload = { id: slot.id, branchId };
      if (form.customer?.id)          payload.customerId  = form.customer.id;
      if (form.referrerId !== undefined) payload.referrerId = form.referrerId || null;
      if (form.paymentMode)           payload.paymentMode = form.paymentMode;
      if (form.notes !== undefined)   payload.notes       = form.notes;
      await correctSlot(payload).unwrap();
      setEditOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to save.'); }
    finally { setBusy(false); }
  };

  const handleRemove = async () => {
    setBusy(true); setError('');
    try {
      await removeSlot({ id: slot.id, branchId }).unwrap();
      setRemoveOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to remove.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="mt-1.5 space-y-2">
      {!editOpen && !removeOpen && (
        <div className="flex gap-2">
          <button type="button" onClick={() => setEditOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-navy/5 text-navy/50 text-[10px] font-bold hover:bg-indigo/10 hover:text-indigo tactile-press">
            <Edit2 size={10} /> Edit
          </button>
          <button type="button" onClick={() => setRemoveOpen(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-navy/5 text-navy/50 text-[10px] font-bold hover:bg-red-50 hover:text-red-600 tactile-press">
            <UserMinus size={10} /> Remove
          </button>
        </div>
      )}

      {editOpen && (
        <form onSubmit={handleEdit} className="bg-white border border-navy/10 rounded-xl p-3 space-y-2">
          <p className="text-[9px] font-bold uppercase text-navy/40 tracking-widest">Edit Member</p>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Customer</label>
            <CustomerPicker value={form.customer} onChange={c => setForm(f => ({ ...f, customer: c }))}
              branchId={branchId} placeholder={slot.customer_name || 'Search customer…'} />
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Referred by</label>
            <select value={form.referrerId} onChange={e => setForm(f => ({ ...f, referrerId: e.target.value }))}
              className={`${IC} text-xs appearance-none`}>
              <option value="">— No referrer —</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Mode</label>
            <select value={form.paymentMode} onChange={e => setForm(f => ({ ...f, paymentMode: e.target.value }))}
              className={`${IC} text-xs appearance-none`}>
              {PAYMENT_MODES.map(m => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className={`${IC} text-xs`} placeholder="Correction note…" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="flex-1 py-2 rounded-xl bg-stone-700 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </button>
            <button type="button" onClick={() => setEditOpen(false)}
              className="px-3 py-2 rounded-xl bg-navy/5 text-[10px] text-navy/60 font-bold tactile-press"><X size={10} /></button>
          </div>
        </form>
      )}

      {removeOpen && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-2">
          <p className="text-[10px] font-bold text-red-700">Remove this member from the room?</p>
          <p className="text-[9px] text-red-600">Slot will be refunded and their incentive credit clawed back.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleRemove} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <UserMinus size={10} />} Confirm Remove
            </button>
            <button type="button" onClick={() => setRemoveOpen(false)}
              className="px-3 py-2 rounded-xl bg-white text-[10px] text-navy/60 font-bold tactile-press border border-red-100">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const GoldCoinRoomDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);
  const canWrite = WRITER_ROLES.has(user?.role);
  const isAdmin  = isSchemeAdmin(user?.role);

  const { data: room, isLoading, error } = useGetGoldCoinRoomQuery(id);
  const [activate, { isLoading: activating }]   = useActivateGoldCoinRoomMutation();
  const [runDraw, { isLoading: drawing }]        = useRunGoldCoinDrawMutation();
  const [undoDraw, { isLoading: undoing }]       = useUndoGoldCoinDrawMutation();
  const [sendToHead, { isLoading: sending }]     = useSendGoldCoinRoomToHeadBranchMutation();
  const [voidRoom,  { isLoading: voiding }]      = useVoidGoldCoinRoomMutation();
  const [hideIneligible, setHideIneligible]      = useState(true);
  const [voidConfirm,    setVoidConfirm]         = useState(false);
  const [voidError,      setVoidError]           = useState('');

  // Management can bypass the 30-day eligibility wait via the Control Center toggle.
  // When ON, every held slot is treated as eligible client-side so the Eliminate button renders.
  const { data: bypassData } = useGetGoldCoinEligibilityBypassSettingQuery();
  const bypassEligibility = bypassData?.enabled === true;

  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const isEligible = (s) =>
    bypassEligibility || Date.now() - new Date(s.paid_at).getTime() >= THIRTY_DAYS_MS;
  const daysUntilEligible = (s) =>
    Math.max(1, Math.ceil((THIRTY_DAYS_MS - (Date.now() - new Date(s.paid_at).getTime())) / 86400000));

  const eligibleHeldCount = useMemo(
    () => (room?.slots ?? []).filter(s => s.status === 'held' && isEligible(s)).length,
    [room?.slots, bypassEligibility]
  );

  if (isLoading) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/gold-coin" title="Room" />
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-indigo" size={28} aria-hidden="true" />
        </div>
      </SchemePageWrapper>
    );
  }

  if (error || !room) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/gold-coin" title="Room not found" />
        <div className="px-4 text-center py-12 text-navy/40 text-sm">Could not load this room.</div>
      </SchemePageWrapper>
    );
  }

  const style = STATUS_STYLES[room.status] || STATUS_STYLES.filling;
  const StatusIcon = style.Icon;
  const heldSlots  = room.slots.filter(s => s.status === 'held').length;
  const canActivate    = canWrite && room.status === 'filling' && heldSlots === 16;
  const canSendToHead  = canWrite && room.status === 'filling' && heldSlots < 16;
  const canDraw        = canWrite && room.status === 'active';
  const canVoidRoom    = isAdmin && room.status !== 'voided' && room.status !== 'completed';

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

  const onVoidRoom = async () => {
    setVoidError('');
    try {
      await voidRoom({ id, branchId: room.branch_id }).unwrap();
      setVoidConfirm(false);
    } catch (err) { setVoidError(err?.data?.error?.message || 'Failed to void room.'); }
  };

  const onPickWinner = async (slot) => {
    const ok = window.confirm(
      `Eliminate slot ${slot.slot_number} (${slot.customer_name})?\n\n` +
      `This records the next draw with this slot as the winner. Cannot be undone.`
    );
    if (!ok) return;
    try {
      const result = await runDraw({ id, winningSlotId: slot.id }).unwrap();
      window.alert(`Slot ${result.winningSlotNumber} won draw ${result.draw.draw_number}.`);
    } catch (err) {
      window.alert(err?.data?.error?.message || 'Draw failed');
    }
  };

  const onUndoDraw = async (draw) => {
    const ok = window.confirm(
      `Undo Draw #${draw.draw_number}?\n\n` +
      `Slot ${draw.winning_slot_number} (${draw.winning_customer_name}) will return to "held".\n` +
      `The draw row will be deleted and a new winner can be picked.`
    );
    if (!ok) return;
    try {
      await undoDraw({ roomId: id, drawId: draw.id, branchId: room.branch_id }).unwrap();
      window.alert(`Draw #${draw.draw_number} has been undone.`);
    } catch (err) {
      window.alert(err?.data?.error?.message || 'Undo failed');
    }
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/gold-coin"
        title={`${room.package_name} · Room #${room.room_number}`}
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
              <p className="text-lg font-bold text-navy">{heldSlots}/16</p>
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Held slots</p>
            </div>
            <div>
              <p className="text-lg font-bold text-navy">{room.draws.length}/16</p>
              <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider">Draws done</p>
            </div>
            <div>
              <p className="text-lg font-bold text-amber-700">{formatCurrency(parseFloat(room.package_price))}</p>
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

      {/* Draw mode banner */}
      {canDraw && (
        <div className="px-4 mb-4">
          <div className="px-4 py-3 bg-indigo/10 border border-indigo/20 rounded-2xl text-xs font-semibold text-indigo">
            Draw mode active — tap "Eliminate" on the held slot you want to record as the next winner.
          </div>
        </div>
      )}

      {/* Void room — admin only */}
      {canVoidRoom && (
        <div className="px-4 mb-4">
          {!voidConfirm ? (
            <button type="button" onClick={() => setVoidConfirm(true)}
              className="w-full py-2.5 rounded-2xl border border-red-200 text-red-600 text-sm font-semibold tactile-press hover:bg-red-50">
              <Trash2 size={14} className="inline mr-1.5" /> Void Room
            </button>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-4 space-y-3">
              <p className="text-sm font-bold text-red-700">Void this entire room?</p>
              <p className="text-xs text-red-600">All {heldSlots} held slots will be refunded and their incentives clawed back. This cannot be undone.</p>
              {voidError && <p className="text-xs text-red-700 font-semibold">{voidError}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={onVoidRoom} disabled={voiding}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
                  {voiding ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Confirm Void
                </button>
                <button type="button" onClick={() => setVoidConfirm(false)}
                  className="px-4 py-2.5 rounded-xl bg-white border border-red-200 text-red-600 text-sm font-bold tactile-press">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Eligibility filter chip — only shown in draw mode */}
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
                return s.status !== 'held' || isEligible(s); // isEligible already honors bypassEligibility
              })
              .map((s) => {
              const isWon      = s.status === 'won';
              const isRefunded = s.status === 'refunded';
              const isHeld     = !isWon && !isRefunded;
              const eligible   = isEligible(s); // bypassEligibility folded in above
              const canPick    = canDraw && isHeld && eligible;
              return (
                <div key={s.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
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
                          className="px-3 py-1.5 rounded-full bg-indigo text-white text-[11px] font-bold tactile-press disabled:opacity-50"
                        >
                          Eliminate
                        </button>
                      )}
                    </div>
                  </div>
                  {isAdmin && isHeld && (
                    <SlotAdminActions slot={s} branchId={room.branch_id} />
                  )}
                  <PhotoProof photoKey={s.proof_key} />
                  <TransactionIdList transactionId={s.transaction_id} />
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
            {room.draws.map((d, idx) => {
              // Only the last draw in the list (highest draw_number) can be undone
              const isLatest = idx === room.draws.length - 1;
              return (
                <div key={d.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      Draw #{d.draw_number} · Slot {d.winning_slot_number}
                    </p>
                    <p className="text-[11px] text-navy/40">
                      {d.winning_customer_name} ({d.customer_code})
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <p className="text-[11px] font-medium text-navy/50">{formatDate(d.draw_date)}</p>
                    {isAdmin && isLatest && (
                      <button
                        onClick={() => onUndoDraw(d)}
                        disabled={undoing}
                        className="text-[11px] font-semibold text-red-500 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40 tactile-press"
                      >
                        Undo
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default GoldCoinRoomDetailPage;
