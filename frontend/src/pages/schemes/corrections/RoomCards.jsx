// frontend/src/pages/schemes/corrections/RoomCards.jsx
// Gold Coin and LSS: a room card that expands into its slots, with slot-level
// correct / void / delete and room-level permanent delete.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import React, { useState } from 'react';
import {
  Loader2,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Undo2,
  Users,
} from 'lucide-react';
import { useGetGoldCoinRoomQuery, useGetLssRoomQuery, useDeleteLssRoomMutation, useDeleteGoldCoinRoomMutation } from '../../../store/api/apiSlice';
import { formatCurrency } from '../../../lib/formatters';
import { FormError } from '../components/FormError';
import { SCHEME_FIELDS } from './constants';
import { ENTRY_ROW } from './entryRowRegistry';
import { statusStyleFor } from './statusStyles';
import { EntryEditForm } from './EntryEditForm';

// ─── Room Slots Panel — correct/void/delete individual slots inside a room ────
// Gold-coin and LSS entries are ROOMS; slot-level actions live here.
// This also fixes the pre-existing bug where the old code fed room IDs into
// slot-level mutations (room id ≠ slot id → "Slot not found").

const SLOT_STATUS_STYLES = {
  held:    'bg-blue-50 text-blue-600',
  won:     'bg-amber-50 text-amber-700',
  refunded:'bg-gray-100 text-gray-500',
  voided:  'bg-gray-100 text-gray-400',
};

export const SlotRow = ({ slot, branchId, schemeCode, slotActions, roomId }) => {
  const [editOpen,   setEditOpen]   = useState(false);
  const [voidOpen,   setVoidOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [undoOpen,   setUndoOpen]   = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const isWon      = slot.status === 'won';
  const isInactive = slot.status === 'voided' || slot.status === 'refunded';

  const closeAll = () => { setEditOpen(false); setVoidOpen(false); setDeleteOpen(false); setUndoOpen(false); setActionError(''); };

  const handleUndoWin = async () => {
    setBusy(true); setActionError('');
    try {
      // won_in_draw_id is the draw UUID that made this slot a winner
      await slotActions.undoDraw({ roomId, drawId: slot.won_in_draw_id, branchId }).unwrap();
      // RTK invalidates GoldCoinRoom / LssRoom → slot list refetches automatically
      setUndoOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to undo win.');
    } finally { setBusy(false); }
  };

  const handleVoid = async () => {
    setBusy(true); setActionError('');
    try {
      await slotActions.void({ id: slot.id, branchId }).unwrap();
      setVoidOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to void slot.');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true); setActionError('');
    try {
      await slotActions.delete({ id: slot.id, branchId }).unwrap();
      setDeleteOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to delete slot.');
    } finally { setBusy(false); }
  };

  const fields = SCHEME_FIELDS[schemeCode] ?? [];

  return (
    <div className={`bg-white rounded-xl px-3 py-2.5 border space-y-2 ${isInactive ? 'border-gray-200 opacity-60' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-navy truncate">{slot.customer_name || '—'}
            <span className="ml-1.5 text-[10px] text-navy/40">#{slot.slot_number}</span>
          </p>
          <p className="text-[10px] text-navy/40">{formatCurrency(slot.amount_paid)} · {slot.customer_code || ''}</p>
        </div>
        <div className="flex items-center gap-1">
          <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase ${SLOT_STATUS_STYLES[slot.status] ?? 'bg-navy/5 text-navy/40'}`}>
            {slot.status}
          </span>
          {!isInactive && !isWon && (
            <>
              <button type="button" onClick={() => { closeAll(); setEditOpen(true); }}
                className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press hover:bg-indigo/10 hover:text-indigo"
                aria-label="Edit slot"><Edit2 size={10} /></button>
              <button type="button" onClick={() => { closeAll(); setVoidOpen(true); }}
                className="w-6 h-6 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press hover:bg-red-50 hover:text-red-600"
                aria-label="Void slot"><Trash2 size={10} /></button>
            </>
          )}
          {/* Undo win — shown for WON slots; reverses the draw so the slot returns to held */}
          {isWon && !isInactive && (
            <button type="button" onClick={() => { closeAll(); setUndoOpen(true); }}
              className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 tactile-press hover:bg-amber-100 hover:text-amber-800"
              aria-label="Undo win" title="Undo win — return slot to held">
              <Undo2 size={10} />
            </button>
          )}
          <button type="button"
            onClick={() => { closeAll(); setDeleteOpen(true); }}
            disabled={isWon}
            className="w-6 h-6 rounded-lg bg-red-50 flex items-center justify-center text-red-400 tactile-press hover:bg-red-100 hover:text-red-700 disabled:opacity-30 disabled:pointer-events-none"
            aria-label="Delete permanently" title={isWon ? 'Won slots cannot be deleted' : 'Delete permanently'}>
            <ShieldAlert size={10} />
          </button>
        </div>
      </div>

      {editOpen && (
        <EntryEditForm
          entry={slot}
          schemeCode={schemeCode}
          branchId={branchId}
          fields={fields}
          actions={slotActions}
          onClose={() => setEditOpen(false)}
        />
      )}

      {voidOpen && (
        <div className="border-t border-red-100 pt-2 space-y-2">
          <p className="text-[10px] text-red-700 font-semibold">Void this slot? Incentive credits will be clawed back.</p>
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleVoid} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />} Confirm Void
            </button>
            <button type="button" onClick={() => setVoidOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="border-t border-red-200 pt-2 space-y-2">
          <p className="text-[10px] text-red-800 font-semibold">Delete permanently? Row is removed from DB and incentives clawed back. Snapshot kept in audit log.</p>
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleDelete} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-700 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <ShieldAlert size={10} />} Confirm Delete
            </button>
            <button type="button" onClick={() => setDeleteOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}

      {/* Undo win confirm panel — reverses the draw so the slot returns to 'held' */}
      {undoOpen && (
        <div className="border-t border-amber-100 pt-2 space-y-2">
          <p className="text-[10px] text-amber-800 font-semibold">Undo this win? The slot returns to held and the draw is removed — you can then edit or re-pick a winner.</p>
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleUndoWin} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-amber-500 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />} Confirm Undo Win
            </button>
            <button type="button" onClick={() => setUndoOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// Separate fetcher components avoid calling hooks conditionally.
export const GoldCoinRoomSlots = ({ roomId, expanded, branchId, slotActions }) => {
  const { data: room, isFetching } = useGetGoldCoinRoomQuery(roomId, { skip: !expanded });
  const slots = room?.slots ?? [];
  if (!expanded) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {isFetching && <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-navy/30" /></div>}
      {!isFetching && slots.length === 0 && <p className="text-xs text-navy/40 text-center py-2">No slots in this room.</p>}
      {!isFetching && slots.map((slot) => (
        <SlotRow key={slot.id} slot={slot} branchId={branchId} schemeCode="gold_coin_scheme" slotActions={slotActions} roomId={roomId} />
      ))}
    </div>
  );
};

export const LssRoomSlots = ({ roomId, expanded, branchId, slotActions }) => {
  const { data: room, isFetching } = useGetLssRoomQuery(roomId, { skip: !expanded });
  const slots = room?.slots ?? [];
  if (!expanded) return null;
  return (
    <div className="mt-2 space-y-1.5">
      {isFetching && <div className="flex justify-center py-3"><Loader2 size={16} className="animate-spin text-navy/30" /></div>}
      {!isFetching && slots.length === 0 && <p className="text-xs text-navy/40 text-center py-2">No slots in this room.</p>}
      {!isFetching && slots.map((slot) => (
        <SlotRow key={slot.id} slot={slot} branchId={branchId} schemeCode="lss_scheme" slotActions={slotActions} roomId={roomId} />
      ))}
    </div>
  );
};

export const RoomSlotsPanel = ({ entry, branchId, schemeCode, slotActions }) => {
  const [expanded, setExpanded] = useState(false);

  const isGC  = schemeCode === 'gold_coin_scheme';

  return (
    <div className="border-t border-border pt-2 mt-1">
      <button type="button" onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-[10px] font-bold text-navy/50 hover:text-indigo tactile-press">
        <Users size={11} />
        {expanded ? 'Hide Slots' : `Slots (${entry.slots_held ?? '…'})`}
        {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
      </button>

      {isGC
        ? <GoldCoinRoomSlots roomId={entry.id} expanded={expanded} branchId={branchId} slotActions={slotActions} />
        : <LssRoomSlots      roomId={entry.id} expanded={expanded} branchId={branchId} slotActions={slotActions} />
      }
    </div>
  );
};

// Room card for Gold Coin and LSS — identical display, both show a Delete Room button.
export const LssRoomCorrectionsCard = ({ entry, branchId, schemeCode, schemeActions }) => {
  const isLss      = schemeCode === 'lss_scheme';
  const isGoldCoin = schemeCode === 'gold_coin_scheme';
  // Both LSS and Gold Coin support room-level permanent delete + incentive clawback.
  const canDeleteRoom = isLss || isGoldCoin;
  const [deleteLssRoom] = useDeleteLssRoomMutation();
  const [deleteGcRoom]  = useDeleteGoldCoinRoomMutation();
  // Pick the scheme-specific mutation so the correct backend route is called.
  const deleteRoom = isGoldCoin ? deleteGcRoom : deleteLssRoom;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteErr,     setDeleteErr]     = useState('');
  const [deleting,      setDeleting]      = useState(false);

  const handleDeleteRoom = async () => {
    setDeleting(true); setDeleteErr('');
    try {
      await deleteRoom({ id: entry.id, branchId }).unwrap();
      setConfirmDelete(false);
    } catch (err) {
      setDeleteErr(err?.data?.error?.message || 'Failed to delete room.');
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl card-shadow border border-border px-4 py-3 space-y-2">
      <div className="flex items-center gap-3">
        {ENTRY_ROW[schemeCode] && React.createElement(ENTRY_ROW[schemeCode], { e: entry })}
        <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyleFor(schemeCode, entry.status)}`}>
          {(entry.status || '').replace(/_/g, ' ')}
        </span>
        {canDeleteRoom && !confirmDelete && (
          <button
            type="button"
            onClick={() => { setConfirmDelete(true); setDeleteErr(''); }}
            className="ml-auto p-1.5 rounded-lg bg-red-50 text-red-400 hover:text-red-600 tactile-press flex-shrink-0"
            title="Delete room permanently"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {confirmDelete && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
          <p className="text-xs font-bold text-red-700">Permanently delete this room?</p>
          <p className="text-[10px] text-red-600">All slots, draws, and incentives will be permanently removed. This cannot be undone.</p>
          {deleteErr && <p className="text-[10px] text-red-800 font-semibold">{deleteErr}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleDeleteRoom} disabled={deleting}
              className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />} Yes, Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)}
              className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}
      <RoomSlotsPanel
        entry={entry}
        branchId={branchId}
        schemeCode={schemeCode}
        slotActions={schemeActions}
      />
    </div>
  );
};
