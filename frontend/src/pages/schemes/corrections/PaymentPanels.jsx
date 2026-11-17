// frontend/src/pages/schemes/corrections/PaymentPanels.jsx
// "Manage Payments" panels: one per scheme with recorded payments (gold, builders,
// chit, land), all built on the generic PaymentsPanel list.
// Part of the Corrections Center (../SchemeCorrectionsPage.jsx).

import { useState } from 'react';
import {
  Loader2,
  X,
  Undo2,
  CreditCard,
  PlusCircle,
} from 'lucide-react';
import {
  useGetGoldPaymentsQuery,
  useGetBuildersPayoutsQuery,
  useGetChitMemberPaymentsQuery,
  useCorrectGoldPaymentMutation,
  useUnpayGoldPaymentMutation,
  useAddGoldPaymentMutation,
  useCorrectBuildersPayoutMutation,
  useUnpayBuildersPayoutMutation,
  useRecordBuildersPayoutMutation,
  useCorrectChitPaymentMutation,
  useUnpayChitPaymentMutation,
  useRecordChitPaymentMutation,
  useGetLandBuybackQuery,
  useUnpayLandPayoutMutation,
  useUndoLandFullPaymentMutation,
  useUndoLandAdvanceMutation,
} from '../../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../../lib/formatters';
import { AddPaymentForm } from './AddPaymentForm';
import { PaymentRow } from './PaymentRow';

// ─── Payment sub-panels ───────────────────────────────────────────────────────

export const GoldPaymentsPanel = ({ entry, branchId }) => {
  // Pass branchId as query param — Management (branchId=null on JWT) requires this.
  const { data: payments = [], isLoading } = useGetGoldPaymentsQuery({ memberId: entry.id, branchId });
  const [correctGoldPayment] = useCorrectGoldPaymentMutation();
  const [unpayGoldPayment]   = useUnpayGoldPaymentMutation();
  const [addGoldPayment]     = useAddGoldPaymentMutation();
  return (
    <PaymentsPanel
      payments={payments}
      isLoading={isLoading}
      branchId={branchId}
      maxMonth={entry.total_months || 60}
      onAdd={(data) => addGoldPayment({
        memberId: entry.id,
        monthNumber: data.monthNumber,
        paidDate:    data.date,
        amount:      data.amount,
        paymentMode: data.paymentMode,
        proofKey:    data.proofKey,
        transactionId: data.transactionId,
        notes:       data.notes,
        branchId,
      })}
      onCorrect={(paymentId, data) => correctGoldPayment({ memberId: entry.id, paymentId, ...data, branchId })}
      onUnpay={(paymentId) => unpayGoldPayment({ memberId: entry.id, paymentId, branchId })}
      amountField="amount"
      dateField="paid_date"
      modeField="payment_mode"
      labelField={(p) => `Month ${p.month_number}`}
    />
  );
};

export const BuildersPayoutsPanel = ({ entry, branchId }) => {
  const { data: payouts = [], isLoading } = useGetBuildersPayoutsQuery({ planId: entry.id, branchId });
  const [correctBuildersPayout] = useCorrectBuildersPayoutMutation();
  const [unpayBuildersPayout]   = useUnpayBuildersPayoutMutation();
  const [recordBuildersPayout]  = useRecordBuildersPayoutMutation();
  return (
    <PaymentsPanel
      payments={payouts}
      isLoading={isLoading}
      branchId={branchId}
      maxMonth={60}
      onAdd={(data) => recordBuildersPayout({
        planId: entry.id,
        monthNumber: data.monthNumber,
        payoutDate:  data.date,
        amount:      data.amount,
        paymentMode: data.paymentMode,
        notes:       data.notes,
        branchId,
      })}
      onCorrect={(paymentId, data) => correctBuildersPayout({ planId: entry.id, payoutId: paymentId, ...data, branchId })}
      onUnpay={(paymentId) => unpayBuildersPayout({ planId: entry.id, payoutId: paymentId, branchId })}
      amountField="amount"
      dateField="payout_date"
      modeField="payment_mode"
      labelField={(p) => `Month ${p.month_number}`}
    />
  );
};

// ChitPaymentsPanel is used both by the top-level chit group panel (never shown
// anymore — chit now drills into members) and by ChitMemberCard below.
export const ChitPaymentsPanel = ({ entry, branchId }) => {
  const { data: payments = [], isLoading } = useGetChitMemberPaymentsQuery(
    { groupId: entry.group_id, memberId: entry.id, branchId },
    { skip: !entry.group_id }
  );
  const [correctChitPayment] = useCorrectChitPaymentMutation();
  const [unpayChitPayment]   = useUnpayChitPaymentMutation();
  const [recordChitPayment]  = useRecordChitPaymentMutation();
  return (
    <PaymentsPanel
      payments={payments}
      isLoading={isLoading}
      branchId={branchId}
      maxMonth={20}
      onAdd={(data) => recordChitPayment({
        groupId:     entry.group_id,
        memberId:    entry.id,
        monthNumber: data.monthNumber,
        paymentDate: data.date,
        amount:      data.amount,
        paymentMode: data.paymentMode,
        notes:       data.notes,
        branchId,
      })}
      onCorrect={(paymentId, data) => correctChitPayment({ groupId: entry.group_id, memberId: entry.id, paymentId, ...data, branchId })}
      onUnpay={(paymentId) => unpayChitPayment({ groupId: entry.group_id, memberId: entry.id, paymentId, branchId })}
      amountField="amount"
      dateField="payment_date"
      modeField="payment_mode"
      labelField={(p) => `Month ${p.month_number}`}
    />
  );
};

// ─── Land payments panel — advance / full-payment undo + per-month payout unpay ─
// Land doesn't fit the generic PaymentsPanel: advance and full payment are
// columns on the booking (not payment rows), and buyback payouts carry no
// payment mode and no per-row correct — only mark-paid / unpay.

export const LandUndoRow = ({ label, detail, canUndo, confirmText, onUndo }) => {
  const [open,  setOpen]  = useState(false);
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');

  const handleUndo = async () => {
    setBusy(true); setError('');
    try {
      await onUndo().unwrap();
      setOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to undo.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-navy/3 rounded-xl px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-navy">{label}</span>
          <span className="ml-2 text-[10px] text-navy/50">{detail}</span>
        </div>
        {canUndo && (
          <button type="button" onClick={() => setOpen((v) => !v)}
            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-navy/40 hover:text-red-600 tactile-press"
            aria-label={`Undo ${label}`}>
            <Undo2 size={10} />
          </button>
        )}
      </div>
      {open && (
        <div className="border-t border-red-100 pt-2 space-y-2">
          <p className="text-[10px] text-red-700 font-semibold">{confirmText}</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleUndo} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />} Confirm Undo
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

export const LandPaymentsPanel = ({ entry, branchId }) => {
  const [open, setOpen] = useState(false);
  const { data: payouts = [], isLoading } = useGetLandBuybackQuery(entry.id, { skip: !open });
  const [unpayPayout]     = useUnpayLandPayoutMutation();
  const [undoFullPayment] = useUndoLandFullPaymentMutation();
  const [undoAdvance]     = useUndoLandAdvanceMutation();

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[10px] font-bold text-navy/50 hover:text-indigo tactile-press mt-1">
        <CreditCard size={11} /> Manage Payments
      </button>
    );
  }

  const paidPayouts  = payouts.filter((p) => p.status === 'paid');
  const pendingCount = payouts.length - paidPayouts.length;

  return (
    <div className="border-t border-border pt-3 mt-1 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Payments</span>
        <button type="button" onClick={() => setOpen(false)} className="text-navy/30 hover:text-navy/60">
          <X size={12} />
        </button>
      </div>

      {entry.advance_amount != null && (
        <LandUndoRow
          label="Advance"
          detail={`${formatCurrency(entry.advance_amount)} · ${formatDate(entry.advance_date)}`}
          canUndo={entry.status === 'advance_paid'}
          confirmText="Remove the advance payment? The booking reverts to 'booked'."
          onUndo={() => undoAdvance({ id: entry.id, branchId })}
        />
      )}

      {entry.full_amount != null && (
        <LandUndoRow
          label="Full Payment"
          detail={`${formatCurrency(entry.full_amount)} · ${formatDate(entry.full_payment_date)}`}
          canUndo={entry.status === 'full_paid'}
          confirmText="Remove the full payment? The buyback payout schedule is deleted. Unpay all paid buyback months first."
          onUndo={() => undoFullPayment({ id: entry.id, branchId })}
        />
      )}

      {entry.advance_amount == null && entry.full_amount == null && (
        <p className="text-xs text-navy/40 text-center py-2">No payments recorded yet.</p>
      )}

      {isLoading && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-navy/30" /></div>}
      {paidPayouts.map((p) => (
        <LandUndoRow
          key={p.id}
          label={`Buyback M${p.month_number}`}
          detail={`${formatCurrency(p.amount)} · ${formatDate(p.paid_date)}${p.paid_by_name ? ` · ${p.paid_by_name}` : ''}`}
          canUndo
          confirmText="Unpay this buyback month? Its commission credits will be clawed back."
          onUndo={() => unpayPayout({ id: entry.id, month: p.month_number, branchId })}
        />
      ))}
      {!isLoading && payouts.length > 0 && (
        <p className="text-[10px] text-navy/40 text-center">
          {paidPayouts.length} paid · {pendingCount} pending buyback months
        </p>
      )}
    </div>
  );
};

// ─── Generic payments list: Manage Payments button → list + Add + Edit / Remove ─

export const PaymentsPanel = ({
  payments, isLoading, branchId, maxMonth,
  onAdd, onCorrect, onUnpay,
  amountField, dateField, modeField, labelField,
}) => {
  const [open,    setOpen]    = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-[10px] font-bold text-navy/50 hover:text-indigo tactile-press mt-1">
        <CreditCard size={11} /> Manage Payments ({payments.length || '…'})
      </button>
    );
  }

  return (
    <div className="border-t border-border pt-3 mt-1 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Payments</span>
        <div className="flex items-center gap-2">
          {!addOpen && (
            <button type="button" onClick={() => setAddOpen(true)}
              className="flex items-center gap-1 text-[9px] font-bold text-emerald-600 hover:text-emerald-700 tactile-press">
              <PlusCircle size={10} /> Add
            </button>
          )}
          <button type="button" onClick={() => { setOpen(false); setAddOpen(false); }}
            className="text-navy/30 hover:text-navy/60">
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Add payment form */}
      {addOpen && (
        <AddPaymentForm
          payments={payments}
          maxMonth={maxMonth}
          onAdd={onAdd}
          onClose={() => setAddOpen(false)}
        />
      )}

      {/* Existing payment rows */}
      {isLoading && <div className="flex justify-center py-2"><Loader2 size={16} className="animate-spin text-navy/30" /></div>}
      {!isLoading && payments.length === 0 && !addOpen && (
        <p className="text-xs text-navy/40 text-center py-2">No payments recorded yet.</p>
      )}
      {payments.map((p) => (
        <PaymentRow
          key={p.id}
          payment={p}
          branchId={branchId}
          amountField={amountField}
          dateField={dateField}
          modeField={modeField}
          label={labelField(p)}
          onCorrect={(data) => onCorrect(p.id, data)}
          onUnpay={() => onUnpay(p.id)}
        />
      ))}
    </div>
  );
};
