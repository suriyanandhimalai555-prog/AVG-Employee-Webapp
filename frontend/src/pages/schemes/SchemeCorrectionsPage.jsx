// SchemeCorrectionsPage — management super-admin correction centre.
//
// Fixes applied vs. original:
//   1. Payment queries now pass branchId as a query param so Management
//      (branch_id = NULL on the account) can actually fetch payment rows.
//   2. "Add Payment" form in every payments panel lets Management record
//      a missed payment for any date; incentives flow through the existing
//      add-payment service methods (one source of truth — no duplication).
//   3. Chit scheme now drills into individual members inside each group so
//      they are correctable; original only showed group-level rows.
//
// Audit, incentive clawback on void/unpay, and the correction write path
// are all unchanged — they were already production-correct on the backend.

import React, { useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Loader2, Search, Edit2, Trash2, X, Check,
  ChevronDown, ChevronUp, ShieldAlert, History, Undo2, CreditCard,
  PlusCircle, Users, ArrowLeftRight, Home, Banknote,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useLazyGetSchemeBranchEntriesQuery,
  useGetGoldPaymentsQuery,
  useGetBuildersPayoutsQuery,
  useGetChitMemberPaymentsQuery,
  useGetChitGroupQuery,
  useGetGoldCoinRoomQuery,
  useGetLssRoomQuery,
  useCorrectGoldMemberMutation,
  useCorrectGoldPaymentMutation,
  useUnpayGoldPaymentMutation,
  useVoidGoldMemberMutation,
  useDeleteGoldMemberMutation,
  useAddGoldPaymentMutation,
  useCorrectTradingMemberMutation,
  useVoidTradingMemberMutation,
  useDeleteTradingMemberMutation,
  useCorrectBuildersPlanMutation,
  useCorrectBuildersPayoutMutation,
  useUnpayBuildersPayoutMutation,
  useVoidBuildersPlanMutation,
  useDeleteBuildersPlanMutation,
  useChangeBuildersRewardMutation,
  useChooseBuildersRewardMutation,
  useRecordBuildersPayoutMutation,
  useCorrectChitMemberMutation,
  useCorrectChitPaymentMutation,
  useUnpayChitPaymentMutation,
  useVoidChitMemberMutation,
  useDeleteChitMemberMutation,
  useRecordChitPaymentMutation,
  useCorrectGoldCoinSlotMutation,
  useVoidGoldCoinSlotMutation,
  useDeleteGoldCoinSlotMutation,
  useUndoGoldCoinDrawMutation,
  useCorrectLssSlotMutation,
  useVoidLssSlotMutation,
  useDeleteLssSlotMutation,
  useUndoLssDrawMutation,
  useCorrectLandBookingMutation,
  useVoidLandBookingMutation,
  useDeleteLandBookingMutation,
  useGetLandBuybackQuery,
  useUnpayLandPayoutMutation,
  useUndoLandFullPaymentMutation,
  useUndoLandAdvanceMutation,
  useGetSchemeAuditLogQuery,
  useGetGoldEmployeesQuery,
} from '../../store/api/apiSlice';
import { isSchemeAdmin, needsBranchSelection } from '../../lib/schemeAuth';
import { BranchPicker } from '../../components/BranchPicker';
import { CustomerPicker } from '../../components/CustomerPicker';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { GOLD_STATUS_STYLES } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormError } from './components/FormError';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../components/money/CashBankSplitField';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

// ─── Scheme list ──────────────────────────────────────────────────────────────

const SCHEMES = [
  { code: 'gold_scheme',       label: 'Gold Scheme' },
  { code: 'trading_academy',   label: 'Trading Academy' },
  { code: 'builders_scheme',   label: 'Builders Scheme' },
  { code: 'agila_chit_scheme', label: 'Agila Chit' },
  { code: 'gold_coin_scheme',  label: 'Gold Coin' },
  { code: 'lss_scheme',        label: 'LSS' },
  { code: 'land_scheme',       label: 'Land Sales' },
];

// Scheme codes that have per-entry recorded payments the admin can manage
const PAYMENT_SCHEMES = new Set(['gold_scheme', 'builders_scheme', 'agila_chit_scheme', 'land_scheme']);

// ─── Shared field configs per scheme ─────────────────────────────────────────
const SCHEME_FIELDS = {
  gold_scheme: [
    { key: 'chitNumber',    label: 'Chit Number',   type: 'text',       entryKey: 'chit_number' },
    { key: 'customerId',    label: 'Customer',       type: 'customer',   entryKey: null },
    { key: 'referrerId',    label: 'Referred by',    type: 'referrer',   entryKey: 'referrer_id' },
    { key: 'monthlyAmount', label: 'Monthly Amount', type: 'number',     entryKey: 'monthly_amount' },
    { key: 'startDate',     label: 'Start Date',     type: 'date',       entryKey: 'start_date' },
    { key: 'totalMonths',   label: 'Total Months',   type: 'number',     entryKey: 'total_months' },
    { key: 'notes',         label: 'Notes',          type: 'textarea',   entryKey: 'notes' },
  ],
  trading_academy: [
    { key: 'customerId',      label: 'Customer',       type: 'customer', entryKey: null },
    { key: 'enrolledBy',      label: 'Enrolled by',    type: 'referrer', entryKey: 'enrolled_by' },
    { key: 'amount',          label: 'Amount',         type: 'number',   entryKey: 'amount' },
    { key: 'enrollmentDate',  label: 'Enrollment Date',type: 'date',     entryKey: 'enrollment_date' },
    { key: 'paymentMode',     label: 'Payment Mode',   type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountFormKey: 'amount', amountEntryKey: 'amount' },
    { key: 'notes',           label: 'Notes',          type: 'textarea', entryKey: 'notes' },
  ],
  builders_scheme: [
    { key: 'customerId',   label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',   label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'lumpSumDate',  label: 'Lump Sum Date',type: 'date',    entryKey: 'lump_sum_date' },
    { key: 'lumpSumMode',  label: 'Payment Mode',type: 'mode',     entryKey: 'lump_sum_mode', proofField: 'lumpSumProofKey', txnField: 'lumpSumTransactionId', cashField: 'lumpSumCashAmount', bankField: 'lumpSumBankAmount', cashEntryKey: 'lump_sum_cash_amount', bankEntryKey: 'lump_sum_bank_amount', amountEntryKey: 'investment_amount' },
    { key: 'notes',        label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  agila_chit_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  gold_coin_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'paymentMode', label: 'Payment Mode',type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountEntryKey: 'amount_paid' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  lss_scheme: [
    { key: 'customerId',  label: 'Customer',    type: 'customer', entryKey: null },
    { key: 'referrerId',  label: 'Referred by', type: 'referrer', entryKey: 'referrer_id' },
    { key: 'paymentMode', label: 'Payment Mode',type: 'mode',     entryKey: 'payment_mode', proofField: 'proofKey', txnField: 'transactionId', cashField: 'cashAmount', bankField: 'bankAmount', cashEntryKey: 'cash_amount', bankEntryKey: 'bank_amount', amountEntryKey: 'amount_paid' },
    { key: 'notes',       label: 'Notes',       type: 'textarea', entryKey: 'notes' },
  ],
  land_scheme: [
    { key: 'bookingRef',      label: 'Booking Ref',       type: 'text',     entryKey: 'booking_ref' },
    { key: 'bookingDate',     label: 'Booking Date',      type: 'date',     entryKey: 'booking_date' },
    { key: 'customerId',      label: 'Customer',          type: 'customer', entryKey: null },
    { key: 'referrerId',      label: 'Referred by',       type: 'referrer', entryKey: 'referrer_id' },
    // Land bookings use their own payment-mode enum, not cash/gpay/bank_receipt
    { key: 'paymentMode',     label: 'Payment Mode',      type: 'landMode', entryKey: 'payment_mode' },
    { key: 'advanceAmount',   label: 'Advance Amount',    type: 'number',   entryKey: 'advance_amount' },
    { key: 'advanceDate',     label: 'Advance Date',      type: 'date',     entryKey: 'advance_date' },
    { key: 'fullAmount',      label: 'Full Amount',       type: 'number',   entryKey: 'full_amount' },
    { key: 'fullPaymentDate', label: 'Full Payment Date', type: 'date',     entryKey: 'full_payment_date' },
    { key: 'loanTaken',       label: 'Loan Taken',        type: 'boolean',  entryKey: 'loan_taken' },
    { key: 'loanAmount',      label: 'Loan Amount',       type: 'number',   entryKey: 'loan_amount' },
    { key: 'notes',           label: 'Notes',             type: 'textarea', entryKey: 'notes' },
  ],
};

const SCHEME_PAYMENT_MODES = ['cash', 'gpay', 'bank_receipt', 'cash_bank'];
const MODE_LABEL = { cash: 'Cash', gpay: 'GPay', bank_receipt: 'Bank Receipt', cash_bank: 'Cash + Bank' };
const LAND_PAYMENT_MODES = ['full_payment', 'advance_full_payment'];
const LAND_MODE_LABEL = { full_payment: 'Full Payment', advance_full_payment: 'Advance + Full Payment' };

// ─── Scheme mutation hooks ────────────────────────────────────────────────────

function useSchemeActions() {
  const [correctGold]      = useCorrectGoldMemberMutation();
  const [voidGold]         = useVoidGoldMemberMutation();
  const [deleteGold]       = useDeleteGoldMemberMutation();
  const [correctTrading]   = useCorrectTradingMemberMutation();
  const [voidTrading]      = useVoidTradingMemberMutation();
  const [deleteTrading]    = useDeleteTradingMemberMutation();
  const [correctBuilders]      = useCorrectBuildersPlanMutation();
  const [voidBuilders]         = useVoidBuildersPlanMutation();
  const [deleteBuilders]       = useDeleteBuildersPlanMutation();
  const [changeRewardBuilders] = useChangeBuildersRewardMutation();
  const [chooseRewardBuilders] = useChooseBuildersRewardMutation();
  const [correctChit]      = useCorrectChitMemberMutation();
  const [voidChit]         = useVoidChitMemberMutation();
  const [deleteChit]       = useDeleteChitMemberMutation();
  const [correctGC]        = useCorrectGoldCoinSlotMutation();
  const [voidGC]           = useVoidGoldCoinSlotMutation();
  const [deleteGC]         = useDeleteGoldCoinSlotMutation();
  const [undoGCDraw]       = useUndoGoldCoinDrawMutation();
  const [correctLss]       = useCorrectLssSlotMutation();
  const [voidLss]          = useVoidLssSlotMutation();
  const [deleteLss]        = useDeleteLssSlotMutation();
  const [undoLssDraw]      = useUndoLssDrawMutation();
  const [correctLand]      = useCorrectLandBookingMutation();
  const [voidLand]         = useVoidLandBookingMutation();
  const [deleteLand]       = useDeleteLandBookingMutation();

  return {
    gold_scheme:       { correct: correctGold,    void: voidGold,    delete: deleteGold,    entityKey: (e) => ({ id: e.id }) },
    trading_academy:   { correct: correctTrading, void: voidTrading, delete: deleteTrading, entityKey: (e) => ({ id: e.id }) },
    builders_scheme:   { correct: correctBuilders, void: voidBuilders, delete: deleteBuilders, changeReward: changeRewardBuilders, chooseReward: chooseRewardBuilders, entityKey: (e) => ({ planId: e.id }) },
    agila_chit_scheme: { correct: correctChit,    void: voidChit,    delete: deleteChit,    entityKey: (e) => ({ groupId: e.group_id, memberId: e.id }) },
    gold_coin_scheme:  { correct: correctGC,  void: voidGC,  delete: deleteGC,  undoDraw: undoGCDraw,  entityKey: (e) => ({ id: e.id }) },
    lss_scheme:        { correct: correctLss, void: voidLss, delete: deleteLss, undoDraw: undoLssDraw, entityKey: (e) => ({ id: e.id }) },
    land_scheme:       { correct: correctLand,    void: voidLand,    delete: deleteLand,    entityKey: (e) => ({ id: e.id }) },
  };
}

// ─── Entry row renderers ──────────────────────────────────────────────────────

const BUILDERS_STATUS_STYLES = {
  cooling: 'bg-blue-50 text-blue-600', active: 'bg-emerald-50 text-emerald-700',
  decision_pending: 'bg-amber-50 text-amber-700', house: 'bg-sky-50 text-sky-700',
  cash: 'bg-violet-50 text-violet-700', completed: 'bg-indigo/10 text-indigo',
  cancelled: 'bg-red-50 text-red-500', voided: 'bg-gray-100 text-gray-500',
};
const GC_STATUS = {
  filling: 'bg-blue-50 text-blue-600', pending_combine: 'bg-amber-50 text-amber-700',
  combined_into: 'bg-navy/5 text-navy/60', expired: 'bg-red-50 text-red-600',
  active: 'bg-emerald-50 text-emerald-700', completed: 'bg-indigo/10 text-indigo',
  voided: 'bg-gray-100 text-gray-500',
};

const EntryRowGold     = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}<span className="ml-1.5 text-[10px] text-navy/40">#{e.chit_number}</span></p>
    <p className="text-[11px] text-navy/40">{formatCurrency(e.monthly_amount)}/mo · {e.months_paid}/{e.total_months} paid · {formatDate(e.start_date)}</p>
  </div>
);
const EntryRowTrading  = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">{formatDate(e.enrollment_date)} · {formatCurrency(e.amount)}</p>
  </div>
);
const EntryRowBuilders = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">Pkg {e.package_number} · {formatDate(e.lump_sum_date)}</p>
  </div>
);
const EntryRowGoldCoin = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || e.package_name || '—'}</p>
    <p className="text-[11px] text-navy/40">R{e.room_number} · {e.slots_held}/16 slots</p>
  </div>
);
const EntryRowLss      = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || e.plan_name || '—'}</p>
    <p className="text-[11px] text-navy/40">R{e.room_number} · {e.slots_held}/20 slots</p>
  </div>
);
const EntryRowLand     = ({ e }) => (
  <div className="flex-1 min-w-0">
    <p className="text-sm font-bold text-navy truncate">{e.customer_name || '—'}</p>
    <p className="text-[11px] text-navy/40">{formatDate(e.booking_date)} · {e.payment_mode?.replace(/_/g, ' ')}</p>
  </div>
);

const ENTRY_ROW = {
  gold_scheme: EntryRowGold, trading_academy: EntryRowTrading,
  builders_scheme: EntryRowBuilders,
  gold_coin_scheme: EntryRowGoldCoin, lss_scheme: EntryRowLss, land_scheme: EntryRowLand,
};

const statusStyleFor = (code, status) => {
  if (!status) return 'bg-navy/5 text-navy/40';
  if (status === 'voided') return 'bg-gray-100 text-gray-500';
  if (code === 'gold_scheme')     return GOLD_STATUS_STYLES[status] ?? 'bg-navy/5 text-navy/40';
  if (code === 'builders_scheme') return BUILDERS_STATUS_STYLES[status] ?? 'bg-navy/5 text-navy/40';
  if (code === 'gold_coin_scheme' || code === 'lss_scheme') return GC_STATUS[status] ?? 'bg-navy/5 text-navy/40';
  if (status === 'active' || status === 'forming') return 'bg-emerald-50 text-emerald-700';
  if (status === 'cancelled' || status === 'expired') return 'bg-red-50 text-red-500';
  if (status === 'completed') return 'bg-indigo/10 text-indigo';
  return 'bg-navy/5 text-navy/40';
};

// ─── Shared input class ───────────────────────────────────────────────────────

const IC = 'w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20';

// ─── AddPaymentForm — inline "Record missed payment" form inside PaymentsPanel ─

const AddPaymentForm = ({ payments, onAdd, onClose, maxMonth }) => {
  // Pre-fill to the next missing month (max existing + 1, or 1 if none recorded).
  const nextMonth = payments.length > 0
    ? Math.max(...payments.map((p) => p.month_number ?? 0)) + 1
    : 1;

  const [form, setForm] = useState({
    monthNumber: String(Math.min(nextMonth, maxMonth || 60)),
    amount:      '',
    date:        new Date().toISOString().slice(0, 10),
    paymentMode: 'cash',
    notes:       '',
  });
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState('');
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [split,        setSplit]        = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.amount || !form.date) { setError('Amount and date are required.'); return; }
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - parseFloat(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    setBusy(true); setError('');
    try {
      await onAdd({
        monthNumber: parseInt(form.monthNumber, 10),
        amount:      parseFloat(form.amount),
        date:        form.date,
        paymentMode: form.paymentMode,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        notes:       form.notes || undefined,
      }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to record payment.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border border-emerald-100 bg-emerald-50/40 rounded-xl px-3 py-3 mt-2 space-y-2.5">
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">Record Missed Payment</span>
        <button type="button" onClick={onClose} className="text-navy/30 hover:text-navy/60"><X size={12} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Month #</label>
          <input
            type="number" min={1} max={maxMonth || 60}
            value={form.monthNumber}
            onChange={(e) => setForm((f) => ({ ...f, monthNumber: e.target.value }))}
            className={IC}
          />
        </div>
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Amount</label>
          <input
            type="number" step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            className={IC}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Date Paid</label>
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className={IC}
          />
        </div>
        <div>
          <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Mode</label>
          <select
            value={form.paymentMode}
            onChange={(e) => { setForm((f) => ({ ...f, paymentMode: e.target.value })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
            className={`${IC} appearance-none`}
          >
            {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </div>
      </div>
      <CashBankSplitField
        mode={form.paymentMode}
        cashAmount={split.cashAmount}
        bankAmount={split.bankAmount}
        onChange={setSplit}
        expectedTotal={form.amount ? parseFloat(form.amount) : undefined}
        showError={showProofErr}
      />
      <ProofUploadField
        mode={form.paymentMode}
        proofKey={proofKey}
        onChange={(keys) => { setProofKey(keys); if (keys?.length) setShowProofErr(false); }}
        showError={showProofErr}
      />
      <TransactionIdField
        mode={form.paymentMode}
        value={txnId}
        onChange={setTxnId}
        showError={showProofErr}
      />
      <div>
        <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Notes (optional)</label>
        <input
          type="text"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={IC}
          placeholder="Correction note…"
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button
        type="submit" disabled={busy}
        className="w-full py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5"
      >
        {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
        Save Payment
      </button>
    </form>
  );
};

// ─── Payment sub-panels ───────────────────────────────────────────────────────

const GoldPaymentsPanel = ({ entry, branchId }) => {
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

const BuildersPayoutsPanel = ({ entry, branchId }) => {
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
const ChitPaymentsPanel = ({ entry, branchId }) => {
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

const LandUndoRow = ({ label, detail, canUndo, confirmText, onUndo }) => {
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

const LandPaymentsPanel = ({ entry, branchId }) => {
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
    <div className="border-t border-navy/5 pt-3 mt-1 space-y-2">
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

const PaymentsPanel = ({
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
    <div className="border-t border-navy/5 pt-3 mt-1 space-y-2">
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

// ─── Single editable payment row ─────────────────────────────────────────────

const PaymentRow = ({ payment, branchId, amountField, dateField, modeField, label, onCorrect, onUnpay }) => {
  const [editOpen,  setEditOpen]  = useState(false);
  const [unpayOpen, setUnpayOpen] = useState(false);
  const [busy,      setBusy]      = useState(false);
  const [error,     setError]     = useState('');
  const [form, setForm] = useState({
    amount:      payment[amountField] ? String(payment[amountField]) : '',
    date:        payment[dateField]   ? payment[dateField].slice(0, 10) : '',
    paymentMode: payment[modeField]   || 'cash',
    notes:       payment.notes        || '',
  });
  const [proofKey,     setProofKey]     = useState([]);
  // Normalize legacy scalar (pre-migration single string) → array for the new multi-id field
  const [txnId,        setTxnId]        = useState(
    Array.isArray(payment.transaction_id)
      ? payment.transaction_id
      : (payment.transaction_id ? [payment.transaction_id] : [])
  );
  // Pre-fill the cash_bank split from the existing row so an unrelated edit keeps it valid
  const [split,        setSplit]        = useState({
    cashAmount: payment.cash_amount != null ? String(payment.cash_amount) : '',
    bankAmount: payment.bank_amount != null ? String(payment.bank_amount) : '',
  });
  const [showProofErr, setShowProofErr] = useState(false);

  const handleCorrect = async (e) => {
    e.preventDefault();
    if (form.paymentMode && form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for non-cash payment corrections.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - parseFloat(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    setBusy(true); setError('');
    try {
      await onCorrect({
        amount:      form.amount      ? parseFloat(form.amount) : undefined,
        [dateField]: form.date        || undefined,
        paymentMode: form.paymentMode || undefined,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: form.paymentMode && form.paymentMode !== 'cash' ? (txnId.length ? txnId : undefined) : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        notes:       form.notes       ?? undefined,
        branchId,
      }).unwrap();
      setEditOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to save.'); }
    finally { setBusy(false); }
  };

  const handleUnpay = async () => {
    setBusy(true); setError('');
    try {
      await onUnpay().unwrap();
      setUnpayOpen(false);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to unmark.'); }
    finally { setBusy(false); }
  };

  return (
    <div className="bg-navy/3 rounded-xl px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-bold text-navy">{label}</span>
          <span className="ml-2 text-[10px] text-navy/50">
            {formatCurrency(payment[amountField])} · {formatDate(payment[dateField])} · {payment[modeField]?.replace(/_/g, ' ')}
          </span>
        </div>
        <div className="flex gap-1">
          <button type="button" onClick={() => { setEditOpen((v) => !v); setUnpayOpen(false); }}
            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-navy/40 hover:text-indigo tactile-press" aria-label="Edit payment">
            <Edit2 size={10} />
          </button>
          <button type="button" onClick={() => { setUnpayOpen((v) => !v); setEditOpen(false); }}
            className="w-6 h-6 rounded-lg bg-white flex items-center justify-center text-navy/40 hover:text-red-600 tactile-press" aria-label="Unmark as paid">
            <Undo2 size={10} />
          </button>
        </div>
      </div>
      <PhotoProof photoKey={payment.proof_key} />
      <TransactionIdList transactionId={payment.transaction_id} />

      {editOpen && (
        <form onSubmit={handleCorrect} className="border-t border-navy/10 pt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Amount</label>
              <input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                className={IC} step="0.01" />
            </div>
            <div>
              <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Date</label>
              <input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className={IC} />
            </div>
          </div>
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Mode</label>
            <select value={form.paymentMode} onChange={(e) => { setForm((f) => ({ ...f, paymentMode: e.target.value })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
              className={`${IC} appearance-none`}>
              {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          </div>
          <CashBankSplitField
            mode={form.paymentMode}
            cashAmount={split.cashAmount}
            bankAmount={split.bankAmount}
            onChange={setSplit}
            expectedTotal={form.amount ? parseFloat(form.amount) : undefined}
            showError={showProofErr}
          />
          <ProofUploadField
            mode={form.paymentMode}
            proofKey={proofKey}
            onChange={(keys) => { setProofKey(keys); if (keys?.length) setShowProofErr(false); }}
            showError={showProofErr}
          />
          <TransactionIdField
            mode={form.paymentMode}
            value={txnId}
            onChange={setTxnId}
            showError={showProofErr}
          />
          <div>
            <label className="text-[8px] font-bold uppercase text-navy/40 block mb-1">Notes</label>
            <input type="text" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className={IC} placeholder="Correction note…" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={busy}
              className="flex-1 py-2 rounded-xl bg-stone-700 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
            </button>
            <button type="button" onClick={() => setEditOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press"><X size={10} /></button>
          </div>
        </form>
      )}

      {unpayOpen && (
        <div className="border-t border-red-100 pt-2 space-y-2">
          <p className="text-[10px] text-red-700 font-semibold">Remove this payment? Incentive credits for it will be clawed back.</p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleUnpay} disabled={busy}
              className="flex-1 py-2 rounded-xl bg-red-600 text-white text-[10px] font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1">
              {busy ? <Loader2 size={10} className="animate-spin" /> : <Undo2 size={10} />} Confirm Remove
            </button>
            <button type="button" onClick={() => setUnpayOpen(false)} className="px-3 py-2 rounded-xl bg-navy/5 text-navy/60 text-[10px] font-bold tactile-press">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Rich entry edit form ─────────────────────────────────────────────────────

const EntryEditForm = ({ entry, schemeCode, branchId, fields, actions, onClose }) => {
  const { data: employees = [] } = useGetGoldEmployeesQuery(branchId, { skip: !branchId });

  const initForm = () => {
    const f = {};
    fields.forEach((field) => {
      if (field.type === 'customer') {
        f[field.key] = null;
      } else if (field.type === 'boolean') {
        // '' = leave unchanged — sending the current value would trip server
        // guards on entries where the field doesn't apply yet (e.g. land loan
        // fields before a full payment is recorded).
        f[field.key] = '';
      } else if (field.entryKey && entry[field.entryKey] != null) {
        f[field.key] = field.type === 'date'
          ? String(entry[field.entryKey]).slice(0, 10)
          : String(entry[field.entryKey]);
      } else {
        f[field.key] = '';
      }
    });
    return f;
  };

  const [form, setForm] = useState(initForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const modeField = fields.find(f => f.type === 'mode');
  const [entryProofKey,     setEntryProofKey]     = useState([]);
  const [entryTxnId,        setEntryTxnId]        = useState([]);
  // Pre-fill the cash_bank split from the existing entry so unrelated edits keep it valid
  const [entrySplit,        setEntrySplit]        = useState(() => ({
    cashAmount: modeField && entry[modeField.cashEntryKey] != null ? String(entry[modeField.cashEntryKey]) : '',
    bankAmount: modeField && entry[modeField.bankEntryKey] != null ? String(entry[modeField.bankEntryKey]) : '',
  }));
  const [showEntryProofErr, setShowEntryProofErr] = useState(false);

  const entityArgs = actions.entityKey(entry);

  // Expected total the cash_bank split must equal: the live editable amount when present
  // (trading), otherwise the entry's fixed amount column (slots / builders lump sum).
  const entryExpectedTotal = modeField
    ? (modeField.amountFormKey && form[modeField.amountFormKey] !== ''
        ? parseFloat(form[modeField.amountFormKey])
        : (entry[modeField.amountEntryKey] != null ? parseFloat(entry[modeField.amountEntryKey]) : undefined))
    : undefined;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (modeField && form[modeField.key] && form[modeField.key] !== 'cash'
        && (!entryProofKey.length || (modeField.txnField && !entryTxnId.length))) {
      setShowEntryProofErr(true);
      setError('Payment proof and transaction ID are required when changing mode to GPay/Bank.');
      return;
    }
    const splitCash = parseFloat(entrySplit.cashAmount) || 0;
    const splitBank = parseFloat(entrySplit.bankAmount) || 0;
    if (modeField && form[modeField.key] === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 ||
         (entryExpectedTotal != null && Math.abs(splitCash + splitBank - entryExpectedTotal) > 0.01))) {
      setShowEntryProofErr(true);
      setError('Cash + bank amounts must be filled and equal the entry amount.');
      return;
    }
    setBusy(true); setError('');
    try {
      const payload = { branchId };
      if (modeField && form[modeField.key] === 'cash_bank') {
        payload[modeField.cashField] = splitCash;
        payload[modeField.bankField] = splitBank;
      }
      fields.forEach((field) => {
        const val = form[field.key];
        if (field.type === 'customer') {
          if (val?.id) payload.customerId = val.id;
        } else if (field.type === 'referrer') {
          // Always send: null clears an existing referrer (triggers incentive claw-back)
          payload[field.key] = (val === '' || val == null) ? null : val;
        } else if (field.type === 'number') {
          if (val !== '') payload[field.key] = parseFloat(val);
        } else if (field.type === 'boolean') {
          if (val !== '') payload[field.key] = val === 'yes';
        } else if (val !== '') {
          payload[field.key] = val || null;
        }
      });
      if (modeField && entryProofKey.length) {
        payload[modeField.proofField] = entryProofKey;
      }
      if (modeField && modeField.txnField && entryTxnId.length) {
        payload[modeField.txnField] = entryTxnId;
      }
      await actions.correct({ ...entityArgs, ...payload }).unwrap();
      onClose();
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save correction.');
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-navy/5 pt-3 space-y-3">
      <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">Correct Entry</p>
      {fields.map((field) => {
        // For referrer fields: always include the entry's current referrer as an option even
        // if they're inactive or from a different branch — so the pre-selected UUID always matches.
        let empOptions = employees;
        if (field.type === 'referrer' && field.entryKey) {
          const currentId = entry[field.entryKey];
          const nameKey = field.entryKey === 'enrolled_by' ? 'enrolled_by_name' : 'referrer_name';
          const inList = employees.some((e) => e.id === currentId);
          if (currentId && !inList) {
            empOptions = [{ id: currentId, name: entry[nameKey] || 'Current referrer', role: '' }, ...employees];
          }
        }
        return (
        <div key={field.key}>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1">{field.label}</label>
          {field.type === 'customer' && (
            <CustomerPicker
              value={form[field.key]}
              onChange={(c) => setForm((f) => ({ ...f, [field.key]: c }))}
              branchId={branchId}
              placeholder={entry.customer_name || 'Search / create customer…'}
            />
          )}
          {field.type === 'referrer' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              <option value="">— No referrer —</option>
              {empOptions.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}{emp.role ? ` (${emp.role})` : ''}</option>
              ))}
            </select>
          )}
          {field.type === 'text' && (
            <input type="text" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} />
          )}
          {field.type === 'number' && (
            <input type="number" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} step="0.01" />
          )}
          {field.type === 'date' && (
            <input type="date" value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={IC} />
          )}
          {field.type === 'mode' && (
            <select value={form[field.key]} onChange={(e) => { setForm((f) => ({ ...f, [field.key]: e.target.value })); setEntryProofKey([]); setEntryTxnId(''); setEntrySplit({ cashAmount: '', bankAmount: '' }); setShowEntryProofErr(false); }}
              className={`${IC} appearance-none`}>
              {SCHEME_PAYMENT_MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
            </select>
          )}
          {field.type === 'mode' && (
            <CashBankSplitField
              mode={form[field.key]}
              cashAmount={entrySplit.cashAmount}
              bankAmount={entrySplit.bankAmount}
              onChange={setEntrySplit}
              expectedTotal={entryExpectedTotal}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'mode' && form[field.key] && form[field.key] !== 'cash' && (
            <ProofUploadField
              mode={form[field.key]}
              proofKey={entryProofKey}
              onChange={(keys) => { setEntryProofKey(keys); if (keys?.length) setShowEntryProofErr(false); }}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'mode' && field.txnField && (
            <TransactionIdField
              mode={form[field.key]}
              value={entryTxnId}
              onChange={setEntryTxnId}
              showError={showEntryProofErr}
            />
          )}
          {field.type === 'landMode' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              {LAND_PAYMENT_MODES.map((m) => <option key={m} value={m}>{LAND_MODE_LABEL[m]}</option>)}
            </select>
          )}
          {field.type === 'boolean' && (
            <select value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              className={`${IC} appearance-none`}>
              <option value="">— unchanged —</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          )}
          {field.type === 'textarea' && (
            <textarea value={form[field.key]} onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
              rows={2} className={`${IC} resize-none`} placeholder="Correction note…" />
          )}
        </div>
        );
      })}
      {error && <FormError error={error} />}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
          className="flex-1 py-2.5 rounded-xl bg-stone-700 text-white text-xs font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-1.5">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Save Correction
        </button>
        <button type="button" onClick={onClose}
          className="px-4 py-2.5 rounded-xl bg-navy/5 text-navy/60 text-xs font-bold tactile-press">
          <X size={12} />
        </button>
      </div>
    </form>
  );
};

// ─── Chit member card (within ChitGroupCard drill-down) ────────────────────────

const CHIT_MEMBER_STATUS = {
  active:    'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-500',
  voided:    'bg-gray-100 text-gray-500',
};

const ChitMemberCard = ({ member, groupId, branchId, chitActions }) => {
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
    <div className={`bg-navy/3 rounded-2xl px-4 py-3 space-y-2 border ${isVoided ? 'border-gray-200 opacity-60' : 'border-navy/5'}`}>
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

const ChitGroupCard = ({ entry, branchId, chitActions }) => {
  const [expanded, setExpanded] = useState(false);

  // Fetch the full group (with members array) only when expanded.
  const { data: group, isFetching } = useGetChitGroupQuery(
    { groupId: entry.id, branchId },
    { skip: !expanded }
  );

  const members = group?.members ?? [];

  return (
    <div className="bg-white rounded-2xl card-shadow border border-navy/5 px-4 py-3 space-y-3">
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
        <div className="border-t border-navy/5 pt-3 space-y-2">
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

// ─── Generic entry card (for all non-chit schemes) ────────────────────────────

const EntryCard = ({ entry, schemeCode, branchId, actions }) => {
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
    <div className={`bg-white rounded-2xl card-shadow border px-4 py-3 space-y-2 ${isVoided ? 'border-gray-200 opacity-60' : 'border-navy/5'}`}>
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

const SlotRow = ({ slot, branchId, schemeCode, slotActions, roomId }) => {
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
    <div className={`bg-white rounded-xl px-3 py-2.5 border space-y-2 ${isInactive ? 'border-gray-200 opacity-60' : 'border-navy/5'}`}>
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
const GoldCoinRoomSlots = ({ roomId, expanded, branchId, slotActions }) => {
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

const LssRoomSlots = ({ roomId, expanded, branchId, slotActions }) => {
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

const RoomSlotsPanel = ({ entry, branchId, schemeCode, slotActions }) => {
  const [expanded, setExpanded] = useState(false);

  const isGC  = schemeCode === 'gold_coin_scheme';

  return (
    <div className="border-t border-navy/5 pt-2 mt-1">
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

// ─── Audit history ────────────────────────────────────────────────────────────

const ACTION_STYLES = {
  void:   'bg-red-50 text-red-600',
  unpay:  'bg-amber-50 text-amber-700',
  remove: 'bg-orange-50 text-orange-600',
  edit:   'bg-blue-50 text-blue-700',
  delete: 'bg-red-100 text-red-700',
};

const AuditHistory = ({ schemeCode }) => {
  const [open, setOpen] = useState(false);
  const { data: auditRows, isLoading } = useGetSchemeAuditLogQuery(
    { schemeCode, limit: 50 },
    { skip: !open || !schemeCode }
  );

  return (
    <div className="border-t border-navy/5 pt-4 mt-6">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 text-xs font-bold text-navy/50 tactile-press hover:text-navy/80">
        <History size={14} />
        Correction Audit History
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      {open && (
        <div className="mt-3 space-y-2">
          {isLoading && <div className="flex justify-center py-4"><Loader2 className="animate-spin text-navy/30" size={20} /></div>}
          {!isLoading && (!auditRows || auditRows.length === 0) && (
            <p className="text-xs text-navy/40 text-center py-4">No corrections recorded yet.</p>
          )}
          {!isLoading && auditRows?.map((row) => (
            <div key={row.id} className="bg-white rounded-xl px-4 py-3 border border-navy/5 space-y-1">
              <div className="flex items-center justify-between">
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${ACTION_STYLES[row.action] ?? 'bg-navy/5 text-navy/40'}`}>
                  {row.action}
                </span>
                <span className="text-[10px] text-navy/40">{formatDate(row.created_at)}</span>
              </div>
              <p className="text-xs font-medium text-navy">{row.entity_type} · {row.actor_name}</p>
              {row.old_values?.notes !== row.new_values?.notes && row.new_values?.notes && (
                <p className="text-[10px] text-navy/40">
                  Notes: <span className="line-through">{row.old_values?.notes || '—'}</span>{' → '}{row.new_values?.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

// Per-scheme keys to search across when filtering loaded entries.
const SEARCH_KEYS = {
  gold_scheme:       ['customer_name', 'customer_code', 'customer_phone', 'chit_number'],
  trading_academy:   ['customer_name', 'customer_code', 'customer_phone'],
  builders_scheme:   ['customer_name', 'customer_code'],
  agila_chit_scheme: ['group_name'],
  gold_coin_scheme:  ['room_number', 'package_name'],
  lss_scheme:        ['room_number', 'plan_name'],
  land_scheme:       ['customer_name', 'customer_code', 'booking_ref', 'site_number', 'site_name'],
};

export const SchemeCorrectionsPage = () => {
  const user = useSelector(selectCurrentUser);

  const [schemeCode, setSchemeCode] = useState('gold_scheme');
  const [branchId,   setBranchId]   = useState('');
  const [startDate,  setStartDate]  = useState('');
  const [endDate,    setEndDate]    = useState('');
  const [search,     setSearch]     = useState('');
  const [filterError, setFilterError] = useState('');

  const [getEntries, { data, isFetching }] = useLazyGetSchemeBranchEntriesQuery();
  const actions     = useSchemeActions();
  const chitActions = actions.agila_chit_scheme;

  if (!isSchemeAdmin(user?.role)) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/control-center" title="Corrections" />
        <div className="px-4 pt-8 text-center">
          <ShieldAlert size={28} className="text-navy/20 mx-auto mb-2" />
          <p className="text-sm font-bold text-navy">Access restricted</p>
          <p className="text-xs text-navy/40 mt-1">Only MD or Management can access the corrections center.</p>
        </div>
      </SchemePageWrapper>
    );
  }

  const handleApply = () => {
    setFilterError('');
    if (!branchId) { setFilterError('Please select a branch.'); return; }
    setSearch('');
    getEntries({ code: schemeCode, branchId, startDate: startDate || undefined, endDate: endDate || undefined });
  };

  const entries       = data?.entries ?? [];
  const schemeActions = actions[schemeCode];
  const isChit        = schemeCode === 'agila_chit_scheme';
  const isRoomScheme  = schemeCode === 'gold_coin_scheme' || schemeCode === 'lss_scheme';

  // Client-side search filter across the already-loaded entries.
  const q = search.trim().toLowerCase();
  const visible = q
    ? entries.filter((e) =>
        (SEARCH_KEYS[schemeCode] ?? []).some((k) => String(e[k] ?? '').toLowerCase().includes(q))
      )
    : entries;

  return (
    <SchemePageWrapper>
      <SchemePageHeader backTo="/control-center" title="Corrections" subtitle="Edit or void scheme entries" />

      <div className="px-4 space-y-3 mb-4">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Scheme</label>
          <select value={schemeCode} onChange={(e) => { setSchemeCode(e.target.value); setSearch(''); }}
            className="w-full px-4 py-3 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 appearance-none">
            {SCHEMES.map((s) => <option key={s.code} value={s.code}>{s.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">Branch *</label>
          <BranchPicker value={branchId} onChange={setBranchId} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20" />
          </div>
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-navy/40 block mb-1.5">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 bg-navy/3 rounded-xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20" />
          </div>
        </div>

        {filterError && <p className="text-xs text-red-600 font-medium">{filterError}</p>}

        <button type="button" onClick={handleApply} disabled={isFetching}
          className="w-full py-3.5 rounded-2xl bg-stone-700 text-white text-sm font-bold disabled:opacity-50 tactile-press flex items-center justify-center gap-2">
          {isFetching
            ? <><Loader2 size={16} className="animate-spin" /> Loading…</>
            : <><Search size={16} /> Load Entries</>}
        </button>
      </div>

      {data && (
        <div className="px-4 space-y-3">
          {/* In-scheme search filter */}
          {entries.length > 0 && (
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, chit #…"
                className="w-full pl-8 pr-3 py-2.5 bg-navy/3 rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20"
              />
            </div>
          )}

          {visible.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
              <p className="text-sm font-bold text-navy">{q ? 'No matches' : 'No entries found'}</p>
              <p className="text-xs text-navy/40 mt-1">{q ? 'Try a different search term.' : 'Try different filters.'}</p>
            </div>
          ) : (
            <>
              <p className="text-[9px] font-bold uppercase tracking-widest text-navy/40">
                {q ? `${visible.length} of ${entries.length}` : visible.length}{' '}
                {visible.length === 1 ? 'entry' : 'entries'}
              </p>
              {visible.map((entry) =>
                isChit ? (
                  // Chit shows groups; drill into members for individual corrections.
                  <ChitGroupCard
                    key={entry.id}
                    entry={entry}
                    branchId={branchId}
                    chitActions={chitActions}
                  />
                ) : isRoomScheme ? (
                  // Gold-coin / LSS show rooms; slot-level actions live in RoomSlotsPanel.
                  <div key={entry.id} className="bg-white rounded-2xl card-shadow border border-navy/5 px-4 py-3 space-y-2">
                    <div className="flex items-center gap-3">
                      {ENTRY_ROW[schemeCode] && React.createElement(ENTRY_ROW[schemeCode], { e: entry })}
                      <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${statusStyleFor(schemeCode, entry.status)}`}>
                        {(entry.status || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <RoomSlotsPanel
                      entry={entry}
                      branchId={branchId}
                      schemeCode={schemeCode}
                      slotActions={schemeActions}
                    />
                  </div>
                ) : (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    schemeCode={schemeCode}
                    branchId={branchId}
                    actions={schemeActions}
                  />
                )
              )}
            </>
          )}
          <AuditHistory schemeCode={schemeCode} />
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default SchemeCorrectionsPage;
