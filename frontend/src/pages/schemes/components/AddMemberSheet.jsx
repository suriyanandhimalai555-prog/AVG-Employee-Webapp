// Bottom-sheet form for enrolling a new Trading Academy member.
// Extracted from TradingAcademyPage where it was defined inline (163 lines).
// Uses SuccessConfirmation for the post-submit screen.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Loader2, ChevronDown } from 'lucide-react';
import { useAddTradingMemberMutation, useCreatePendingEnrollmentMutation } from '../../../store/api/apiSlice';
import { CustomerPicker } from '../../../components/CustomerPicker';
import { PeriodDateInput } from '../../../components/PeriodDateInput';
import { TRADING_ROLE_LABELS, createFormSetter, getTodayISO } from '../../../lib/schemeConstants';
import { FormError } from './FormError';
import { FormField } from './FormField';
import { DepositToggle } from './DepositToggle';
import { SuccessConfirmation } from './SuccessConfirmation';
import { ProofUploadField } from '../../../components/money/ProofUploadField';
import { TransactionIdField } from '../../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../../components/money/CashBankSplitField';

// Trading Academy forms use focus:border-indigo (not ring-indigo/20) — kept local
const SHEET_INPUT_CLASS =
  'w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo bg-white';

// branchId — passed from TradingAcademyPage when user is management role;
// forwarded to CustomerPicker so searches + creates are scoped to the right branch.
export const AddMemberSheet = ({ onClose, employees, branchId }) => {
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    amount:         '',
    enrolledBy:     '',
    enrollmentDate: getTodayISO(),
    paymentMode:    'cash',
    notes:          '',
  });
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [split,        setSplit]        = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState(null);
  const [addMember, { isLoading }] = useAddTradingMemberMutation();
  const [createPending, { isLoading: creatingPending }] = useCreatePendingEnrollmentMutation();
  const [payMode, setPayMode] = useState('full');
  const [deposit, setDeposit] = useState('');
  const navigate = useNavigate();

  const set = createFormSetter(setForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!customer) { setError('Please select or create a customer'); return; }
    if (!form.amount || !form.enrolledBy) { setError('Amount and enrolled-by are required'); return; }
    const fullAmt   = parseFloat(form.amount);
    const payAmount = payMode === 'deposit' ? (parseFloat(deposit) || 0) : fullAmt;
    if (payMode === 'deposit' && !(payAmount > 0)) { setError('Enter the deposit amount.'); return; }
    if (payMode === 'deposit' && payAmount > fullAmt + 0.01) { setError('Deposit cannot exceed the enrollment amount.'); return; }
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - payAmount) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    try {
      if (payMode === 'deposit') {
        const res = await createPending({
          schemeCode: 'trading_academy',
          customerId: customer.id,
          referrerId: form.enrolledBy,
          branchId:   branchId || undefined,
          payload: { amount: fullAmt, enrolledBy: form.enrolledBy, notes: form.notes || undefined },
          firstPayment: {
            amount: payAmount, paymentMode: form.paymentMode, paidDate: form.enrollmentDate,
            proofKey: proofKey.length ? proofKey : undefined,
            transactionId: txnId.length ? txnId : undefined,
            cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
            bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
          },
        }).unwrap();
        navigate(`/money/schemes/pending/${res.pendingId}`);
        return;
      }
      const res = await addMember({
        customerId:     customer.id,
        amount:         parseFloat(form.amount),
        enrolledBy:     form.enrolledBy,
        enrollmentDate: form.enrollmentDate,
        paymentMode:    form.paymentMode,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        notes:          form.notes || undefined,
        branchId:       branchId || undefined,
      }).unwrap();
      setResult(res);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to add member');
    }
  };

  if (result) {
    return (
      <SuccessConfirmation
        title="Member Added"
        subtitle={result.member?.customer?.name}
        code={result.member?.customer?.customer_code}
        onDone={onClose}
      >
        {result.incentivesCreated > 0 && (
          <div className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl p-4">
            <p className="text-sm font-bold text-emerald-700">
              ✓ Incentives distributed to {result.incentivesCreated} team member{result.incentivesCreated > 1 ? 's' : ''}
            </p>
          </div>
        )}
      </SuccessConfirmation>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-lg font-bold text-navy">New Enrollment</p>
        <button type="button" onClick={onClose} className="p-2 rounded-xl bg-navy/5 tactile-press">
          <X size={18} className="text-navy/40" aria-hidden="true" />
        </button>
      </div>

      {/* Customer picker */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
          Customer *
        </label>
        <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)}
          branchId={branchId} />
      </div>

      {/* Amount */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
          Amount (₹) *
        </label>
        <input
          required
          type="number"
          min="1"
          step="0.01"
          value={form.amount}
          onChange={set('amount')}
          placeholder="e.g. 10000"
          className={SHEET_INPUT_CLASS}
        />
      </div>

      {/* Payment plan: full vs deposit */}
      <FormField label="Payment plan" required>
        <DepositToggle
          mode={payMode} onModeChange={setPayMode}
          deposit={deposit} onDepositChange={setDeposit}
          required={form.amount ? parseFloat(form.amount) : 0}
        />
      </FormField>

      {/* Enrolled By */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
          Enrolled By *
        </label>
        <div className="relative">
          <select
            required
            value={form.enrolledBy}
            onChange={set('enrolledBy')}
            className={`${SHEET_INPUT_CLASS} appearance-none pr-10`}
          >
            <option value="">— Select employee —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({TRADING_ROLE_LABELS[emp.role] || emp.role})
              </option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" aria-hidden="true" />
        </div>
      </div>

      {/* Date + Payment Mode */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
            Date *
          </label>
          <PeriodDateInput
            required
            value={form.enrollmentDate}
            onChange={set('enrollmentDate')}
            className={SHEET_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
            Mode *
          </label>
          <div className="relative">
            <select
              value={form.paymentMode}
              onChange={(e) => { set('paymentMode')(e); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
              className={`${SHEET_INPUT_CLASS} appearance-none pr-8`}
            >
              <option value="cash">Cash</option>
              <option value="gpay">GPay</option>
              <option value="bank_receipt">Bank</option>
              <option value="cash_bank">Cash + Bank</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" aria-hidden="true" />
          </div>
        </div>
      </div>

      <CashBankSplitField
        mode={form.paymentMode}
        cashAmount={split.cashAmount}
        bankAmount={split.bankAmount}
        onChange={setSplit}
        expectedTotal={(payMode === 'deposit' ? parseFloat(deposit) : parseFloat(form.amount)) || undefined}
        showError={showProofErr}
      />

      <ProofUploadField
        mode={form.paymentMode}
        proofKey={proofKey}
        onChange={setProofKey}
        showError={showProofErr}
      />

      <TransactionIdField
        mode={form.paymentMode}
        value={txnId}
        onChange={setTxnId}
        showError={showProofErr}
      />

      {/* Notes */}
      <div>
        <label className="block text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-1.5">
          Notes
        </label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={set('notes')}
          placeholder="Optional remarks"
          className={`${SHEET_INPUT_CLASS} resize-none`}
        />
      </div>

      <FormError error={error} />

      <button
        type="submit"
        disabled={isLoading || creatingPending}
        className="w-full py-4 bg-indigo text-white rounded-2xl font-bold tactile-press disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {(isLoading || creatingPending)
          ? <><Loader2 className="animate-spin" size={18} aria-hidden="true" /> {payMode === 'deposit' ? 'Saving deposit…' : 'Saving & distributing incentives…'}</>
          : (payMode === 'deposit' ? 'Save Deposit' : 'Add Member')}
      </button>
    </form>
  );
};
