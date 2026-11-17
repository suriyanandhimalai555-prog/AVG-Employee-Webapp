// frontend/src/pages/schemes/corrections/EntryCard.jsx
// Card for one entry of a member-based scheme (gold, trading, builders, land):
// summary row + edit / void / delete / payments.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import {
  Loader2,
  Edit2,
  Trash2,
  ShieldAlert,
  ArrowLeftRight,
  Home,
  Banknote,
} from 'lucide-react';
import { FormError } from '../components/FormError';
import { PAYMENT_SCHEMES, SCHEME_FIELDS } from './constants';
import { ENTRY_ROW } from './entryRowRegistry';
import { statusStyleFor } from './statusStyles';
import { GoldPaymentsPanel, BuildersPayoutsPanel, LandPaymentsPanel } from './PaymentPanels';
import { EntryEditForm } from './EntryEditForm';

// ─── Generic entry card (for all non-chit schemes) ────────────────────────────

export const EntryCard = ({ entry, schemeCode, branchId, actions }) => {
  const Row    = ENTRY_ROW[schemeCode];
  const fields = SCHEME_FIELDS[schemeCode] ?? [];

  const [editOpen,         setEditOpen]         = useState(false);
  const [voidOpen,         setVoidOpen]         = useState(false);
  const [deleteOpen,       setDeleteOpen]        = useState(false);
  const [rewardOpen,       setRewardOpen]        = useState(false);
  const [rewardChoice,     setRewardChoice]      = useState('');
  const [landProvided,     setLandProvided]      = useState(false);
  const [actionError,      setActionError]       = useState('');
  const [busy,             setBusy]              = useState(false);

  const isVoided         = entry.status === 'voided';
  const hasPayments      = PAYMENT_SCHEMES.has(schemeCode) && !isVoided;
  const canChangeReward  = schemeCode === 'builders_scheme'
    && ['house', 'cash', 'decision_pending'].includes(entry.status)
    && !!(entry.status === 'decision_pending' ? actions.chooseReward : actions.changeReward);

  const closeAll = () => {
    setEditOpen(false); setVoidOpen(false); setDeleteOpen(false); setRewardOpen(false);
    setActionError(''); setRewardChoice(''); setLandProvided(false);
  };

  const handleVoid = async () => {
    setBusy(true); setActionError('');
    try {
      const entityArgs = actions.entityKey(entry);
      await actions.void({ ...entityArgs, branchId }).unwrap();
      setVoidOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to void entry.');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true); setActionError('');
    try {
      const entityArgs = actions.entityKey(entry);
      await actions.delete({ ...entityArgs, branchId }).unwrap();
      setDeleteOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to delete entry.');
    } finally { setBusy(false); }
  };

  const handleChangeReward = async () => {
    if (!rewardChoice) { setActionError('Please select a reward option.'); return; }
    if (rewardChoice === 'house' && !landProvided) { setActionError('Please confirm that the customer has provided land.'); return; }
    setBusy(true); setActionError('');
    try {
      const entityArgs = actions.entityKey(entry);
      const mutFn = entry.status === 'decision_pending' ? actions.chooseReward : actions.changeReward;
      await mutFn({ ...entityArgs, choice: rewardChoice, landProvided, branchId }).unwrap();
      closeAll();
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to change reward.');
    } finally { setBusy(false); }
  };

  return (
    <div className={`bg-white rounded-2xl card-shadow border px-4 py-3 space-y-2 ${isVoided ? 'border-gray-200 opacity-60' : 'border-border'}`}>
      <div className="flex items-center gap-3">
        {Row && <Row e={entry} />}
        <div className="flex-shrink-0 text-right space-y-1">
          <span className={`block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyleFor(schemeCode, entry.status)}`}>
            {(entry.status || '').replace(/_/g, ' ')}
          </span>
          <div className="flex gap-1 justify-end">
            {canChangeReward && (
              <button type="button" onClick={() => { closeAll(); setRewardOpen(true); setRewardChoice(entry.status === 'decision_pending' ? '' : (entry.status === 'house' ? 'cash' : 'house')); }}
                className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500 tactile-press hover:bg-amber-100 hover:text-amber-700"
                aria-label="Change reward choice">
                <ArrowLeftRight size={12} />
              </button>
            )}
            {!isVoided && (
              <>
                <button type="button" onClick={() => { closeAll(); setEditOpen(true); }}
                  className="w-7 h-7 rounded-xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press hover:bg-indigo/10 hover:text-indigo"
                  aria-label="Edit">
                  <Edit2 size={12} />
                </button>
                <button type="button" onClick={() => { closeAll(); setVoidOpen(true); }}
                  className="w-7 h-7 rounded-xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press hover:bg-red-50 hover:text-red-600"
                  aria-label="Void">
                  <Trash2 size={12} />
                </button>
              </>
            )}
            <button type="button" onClick={() => { closeAll(); setDeleteOpen(true); }}
              className="w-7 h-7 rounded-xl bg-red-50 flex items-center justify-center text-red-400 tactile-press hover:bg-red-100 hover:text-red-700"
              aria-label="Delete permanently">
              <ShieldAlert size={12} />
            </button>
          </div>
        </div>
      </div>

      {editOpen && (
        <EntryEditForm
          entry={entry}
          schemeCode={schemeCode}
          branchId={branchId}
          fields={fields}
          actions={actions}
          onClose={() => setEditOpen(false)}
        />
      )}

      {hasPayments && !editOpen && (
        schemeCode === 'gold_scheme'
          ? <GoldPaymentsPanel entry={entry} branchId={branchId} />
          : schemeCode === 'builders_scheme'
            ? <BuildersPayoutsPanel entry={entry} branchId={branchId} />
            : schemeCode === 'land_scheme'
              ? <LandPaymentsPanel entry={entry} branchId={branchId} />
              : null // chit payments are handled inside ChitGroupCard → ChitMemberCard
      )}

      {rewardOpen && (
        <div className="border-t border-amber-100 pt-3 space-y-3">
          <p className="text-[9px] font-bold uppercase tracking-widest text-amber-700">Change Reward Choice</p>
          <p className="text-[10px] text-navy/50">
            Current: <span className="font-bold text-navy">{entry.status}</span>. Select the correct reward:
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => { setRewardChoice('house'); setLandProvided(false); }}
              className={`p-3 rounded-xl border-2 text-left transition-all ${rewardChoice === 'house' ? 'border-sky-500 bg-sky-50' : 'border-navy/10 bg-white'}`}>
              <div className="flex items-center gap-2">
                <Home size={14} className={rewardChoice === 'house' ? 'text-sky-600' : 'text-navy/30'} />
                <span className="text-xs font-bold text-navy">House</span>
              </div>
            </button>
            <button type="button" onClick={() => setRewardChoice('cash')}
              className={`p-3 rounded-xl border-2 text-left transition-all ${rewardChoice === 'cash' ? 'border-violet-500 bg-violet-50' : 'border-navy/10 bg-white'}`}>
              <div className="flex items-center gap-2">
                <Banknote size={14} className={rewardChoice === 'cash' ? 'text-violet-600' : 'text-navy/30'} />
                <span className="text-xs font-bold text-navy">Cash</span>
              </div>
            </button>
          </div>
          {rewardChoice === 'house' && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={landProvided} onChange={(e) => setLandProvided(e.target.checked)}
                className="w-4 h-4 rounded accent-sky-600" />
              <span className="text-xs font-medium text-navy">Customer has provided land</span>
            </label>
          )}
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleChangeReward} disabled={busy || !rewardChoice}
              className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ArrowLeftRight size={12} />}
              Confirm Change
            </button>
            <button type="button" onClick={closeAll}
              className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
              Cancel
            </button>
          </div>
        </div>
      )}

      {voidOpen && (
        <div className="border-t border-red-100 pt-3 space-y-3">
          <div className="bg-red-50 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">Void this entry?</p>
            <p className="text-[10px] text-red-600 mt-0.5">
              The record will be marked voided and any incentive credits will be clawed back. This cannot be undone.
            </p>
          </div>
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleVoid} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Confirm Void
            </button>
            <button type="button" onClick={() => setVoidOpen(false)}
              className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
              Cancel
            </button>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="border-t border-red-200 pt-3 space-y-3">
          <div className="bg-red-100 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-800">Delete permanently?</p>
            <p className="text-[10px] text-red-700 mt-0.5">
              This erases the record and all of its payments from the database and claws back every incentive.
              A snapshot is kept in the audit log. This cannot be undone.
            </p>
          </div>
          {actionError && <FormError error={actionError} />}
          <div className="flex gap-2">
            <button type="button" onClick={handleDelete} disabled={busy}
              className="flex-1 py-2.5 rounded-xl bg-red-700 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
              Confirm Permanent Delete
            </button>
            <button type="button" onClick={() => setDeleteOpen(false)}
              className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
