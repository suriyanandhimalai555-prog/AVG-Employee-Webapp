// frontend/src/pages/schemes/corrections/ChitCards.jsx
// Agila Chit: a group card that expands into its members, each correctable on its own.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import {
  Loader2,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { useGetChitGroupQuery } from '../../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { FormError } from '../components/FormError';
import { SCHEME_FIELDS } from './constants';
import { statusStyleFor } from './statusStyles';
import { ChitPaymentsPanel } from './PaymentPanels';
import { EntryEditForm } from './EntryEditForm';

// ─── Chit member card (within ChitGroupCard drill-down) ────────────────────────

const CHIT_MEMBER_STATUS = {
  active:    'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-500',
  voided:    'bg-gray-100 text-gray-500',
};

export const ChitMemberCard = ({ member, groupId, branchId, chitActions }) => {
  // Attach group_id so ChitPaymentsPanel and entityKey can use it
  const memberWithGroup = { ...member, group_id: groupId };
  const [editOpen,   setEditOpen]   = useState(false);
  const [voidOpen,   setVoidOpen]   = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  const isVoided = member.status === 'voided';
  const fields   = SCHEME_FIELDS.agila_chit_scheme;

  const closeAll = () => { setEditOpen(false); setVoidOpen(false); setDeleteOpen(false); setActionError(''); };

  const handleVoid = async () => {
    setBusy(true); setActionError('');
    try {
      await chitActions.void({ groupId, memberId: member.id, branchId }).unwrap();
      setVoidOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to void member.');
    } finally { setBusy(false); }
  };

  const handleDelete = async () => {
    setBusy(true); setActionError('');
    try {
      await chitActions.delete({ groupId, memberId: member.id, branchId }).unwrap();
      setDeleteOpen(false);
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Failed to delete member.');
    } finally { setBusy(false); }
  };

  return (
    <div className={`bg-navy/3 rounded-2xl px-4 py-3 space-y-2 border ${isVoided ? 'border-gray-200 opacity-60' : 'border-border'}`}>
      {/* Member header */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{member.customer_name || '—'}</p>
          <p className="text-[11px] text-navy/40">
            {member.months_paid}/20 paid · {formatCurrency(member.total_paid)} collected
            {member.has_won && <span className="ml-1.5 text-amber-600 font-semibold">· Won M{member.won_month}</span>}
          </p>
        </div>
        <div className="flex-shrink-0 text-right space-y-1">
          <span className={`block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${CHIT_MEMBER_STATUS[member.status] ?? 'bg-navy/5 text-navy/40'}`}>
            {member.status}
          </span>
          <div className="flex gap-1 justify-end">
            {!isVoided && (
              <>
                <button type="button" onClick={() => { closeAll(); setEditOpen(true); }}
                  className="w-7 h-7 rounded-xl bg-white flex items-center justify-center text-navy/50 tactile-press hover:bg-indigo/10 hover:text-indigo"
                  aria-label="Edit member">
                  <Edit2 size={12} />
                </button>
                <button type="button" onClick={() => { closeAll(); setVoidOpen(true); }}
                  className="w-7 h-7 rounded-xl bg-white flex items-center justify-center text-navy/50 tactile-press hover:bg-red-50 hover:text-red-600"
                  aria-label="Void member">
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

      {/* Edit member fields */}
      {editOpen && (
        <EntryEditForm
          entry={memberWithGroup}
          schemeCode="agila_chit_scheme"
          branchId={branchId}
          fields={fields}
          actions={chitActions}
          onClose={() => setEditOpen(false)}
        />
      )}

      {/* Payments panel (only when not editing, not voided) */}
      {!isVoided && !editOpen && (
        <ChitPaymentsPanel entry={memberWithGroup} branchId={branchId} />
      )}

      {/* Void confirmation */}
      {voidOpen && (
        <div className="border-t border-red-100 pt-3 space-y-3">
          <div className="bg-red-50 rounded-xl px-3 py-2.5">
            <p className="text-xs font-bold text-red-700">Void this member?</p>
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

      {/* Delete confirmation */}
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

// ─── Chit group card — shows group info + expandable member list ───────────────
// Replaces the original EntryRowChit which only showed group-level data and gave
// no way to reach individual members for correction.

export const ChitGroupCard = ({ entry, branchId, chitActions }) => {
  const [expanded, setExpanded] = useState(false);

  // Fetch the full group (with members array) only when expanded.
  const { data: group, isFetching } = useGetChitGroupQuery(
    { groupId: entry.id, branchId },
    { skip: !expanded }
  );

  const members = group?.members ?? [];

  return (
    <div className="bg-white rounded-2xl card-shadow border border-border px-4 py-3 space-y-3">
      {/* Group header row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{entry.group_name || '—'}</p>
          <p className="text-[11px] text-navy/40">
            {entry.member_count}/20 members · started {formatDate(entry.start_date)}
          </p>
        </div>
        <div className="flex-shrink-0 text-right space-y-1">
          <span className={`block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyleFor('agila_chit_scheme', entry.status)}`}>
            {(entry.status || '').replace(/_/g, ' ')}
          </span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[10px] font-bold text-navy/50 hover:text-indigo tactile-press mt-1"
          >
            <Users size={11} />
            {expanded ? 'Hide' : 'Members'}
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Members list */}
      {expanded && (
        <div className="border-t border-border pt-3 space-y-2">
          {isFetching && (
            <div className="flex justify-center py-4">
              <Loader2 size={18} className="animate-spin text-navy/30" />
            </div>
          )}
          {!isFetching && members.length === 0 && (
            <p className="text-xs text-navy/40 text-center py-3">No members in this group yet.</p>
          )}
          {!isFetching && members.map((member) => (
            <ChitMemberCard
              key={member.id}
              member={member}
              groupId={entry.id}
              branchId={branchId}
              chitActions={chitActions}
            />
          ))}
        </div>
      )}
    </div>
  );
};
