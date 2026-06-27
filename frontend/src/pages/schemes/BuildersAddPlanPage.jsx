import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetBuildersPackagesQuery,
  useCreateBuildersPlanMutation,
  useGetGoldEmployeesQuery,
  useCreatePendingEnrollmentMutation,
} from '../../store/api/apiSlice';
import { DepositToggle } from './components/DepositToggle';
import { formatCurrency } from '../../lib/formatters';
import {
  SCHEME_INPUT_CLASS,
  createFormSetter,
  getTodayISO,
} from '../../lib/schemeConstants';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { SuccessConfirmation } from './components/SuccessConfirmation';
import { CustomerPicker } from '../../components/CustomerPicker';
import { BranchPicker } from '../../components/BranchPicker';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../components/money/CashBankSplitField';

const INITIAL_FORM = {
  packageNumber: '',
  lumpSumDate:   getTodayISO(),
  lumpSumMode:   'cash',
  referrerId:    '',
  notes:         '',
};

export const BuildersAddPlanPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [customer,     setCustomer]   = useState(null);
  const [form,         setForm]       = useState(INITIAL_FORM);
  const [proofKey,     setProofKey]   = useState([]);
  const [txnId,        setTxnId]      = useState([]);
  const [split,        setSplit]      = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);
  const [error,        setError]      = useState('');
  const [done,         setDone]       = useState(null);  // { plan, customer }

  const set = createFormSetter(setForm);

  const { data: packages } = useGetBuildersPackagesQuery();
  const { data: employees } = useGetGoldEmployeesQuery();
  const [createPlan, { isLoading }] = useCreateBuildersPlanMutation();
  const [createPending, { isLoading: creatingPending }] = useCreatePendingEnrollmentMutation();
  const [payMode, setPayMode] = useState('full');
  const [deposit, setDeposit] = useState('');

  // Derive package preview from selected package number
  const selectedPkg = form.packageNumber ? packages?.[form.packageNumber] : null;

  const isManagement = user?.role === 'management';
  const [branchId, setBranchId] = useState('');

  if (user?.role !== 'branch_admin' && !isManagement) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/builders" title="Enroll Plan" />
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">Branch Admin only</p>
            <p className="text-xs text-navy/40 mt-1">Only Branch Admins can enroll new plans.</p>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  const resetForm = () => {
    setCustomer(null);
    setForm(INITIAL_FORM);
    setError('');
    setDone(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!customer) { setError('Please select a customer.'); return; }
    if (!form.packageNumber) { setError('Please select a package.'); return; }
    if (!form.referrerId) { setError('Referrer is required to distribute incentives.'); return; }
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    const investAmt = selectedPkg?.investmentAmount ?? 0;
    const payAmount = payMode === 'deposit' ? (parseFloat(deposit) || 0) : investAmt;
    if (payMode === 'deposit' && !(payAmount > 0)) { setError('Enter the deposit amount.'); return; }
    if (payMode === 'deposit' && payAmount > investAmt + 0.01) { setError('Deposit cannot exceed the investment amount.'); return; }
    if (form.lumpSumMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.lumpSumMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - payAmount) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }

    try {
      if (payMode === 'deposit') {
        const res = await createPending({
          schemeCode: 'builders_scheme',
          customerId: customer.id,
          referrerId: form.referrerId,
          branchId:   isManagement ? branchId : undefined,
          payload: { packageNumber: Number(form.packageNumber), notes: form.notes || undefined },
          firstPayment: {
            amount: payAmount, paymentMode: form.lumpSumMode, paidDate: form.lumpSumDate,
            proofKey: proofKey.length ? proofKey : undefined,
            transactionId: txnId.length ? txnId : undefined,
            cashAmount: form.lumpSumMode === 'cash_bank' ? splitCash : undefined,
            bankAmount: form.lumpSumMode === 'cash_bank' ? splitBank : undefined,
          },
        }).unwrap();
        navigate(`/money/schemes/pending/${res.pendingId}${isManagement ? `?branchId=${branchId}` : ''}`);
        return;
      }
      const res = await createPlan({
        customerId:      customer.id,
        packageNumber:   Number(form.packageNumber),
        lumpSumDate:     form.lumpSumDate,
        lumpSumMode:     form.lumpSumMode,
        lumpSumProofKey: proofKey.length ? proofKey : undefined,
        lumpSumTransactionId: txnId.length ? txnId : undefined,
        lumpSumCashAmount: form.lumpSumMode === 'cash_bank' ? splitCash : undefined,
        lumpSumBankAmount: form.lumpSumMode === 'cash_bank' ? splitBank : undefined,
        referrerId:      form.referrerId || undefined,
        notes:           form.notes || undefined,
        branchId:        isManagement ? branchId : undefined,
      }).unwrap();
      setDone(res);
    } catch (err) {
      const msg = err?.data?.error?.message || err?.data?.message || 'Failed to enroll plan. Please try again.';
      setError(msg);
    }
  };

  if (done) {
    const inv = done.plan?.investment_amount;
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title="Plan Enrolled"
          subtitle={`${done.customer?.name || done.plan?.customer_name} · ${formatCurrency(inv)}`}
          code={`Cooling ends ${done.plan?.cooling_end_date}`}
          buttonLabel="View Plan"
          onDone={() => navigate(`/money/schemes/builders/${done.plan?.id}`)}
        >
          <button
            type="button"
            onClick={resetForm}
            className="w-full mt-3 py-3 rounded-2xl bg-sky-50 text-sky-700 text-sm font-bold border border-sky-100 tactile-press"
          >
            Enroll Another Plan
          </button>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/builders"
        title="Enroll Plan"
        subtitle="One-time lump sum · 60 months"
      />

      <form onSubmit={handleSubmit} className="px-4 space-y-5 mt-2">

        {/* Branch picker — management only */}
        {isManagement && (
          <FormField label="Branch" required>
            <BranchPicker value={branchId} onChange={setBranchId} />
          </FormField>
        )}

        {/* Customer picker */}
        <FormField label="Customer" required>
          <CustomerPicker
            value={customer}
            onChange={setCustomer}
            onClear={() => setCustomer(null)}
            branchId={isManagement ? branchId : undefined}
          />
        </FormField>

        {/* Package select */}
        <FormField label="Package" required>
          <select
            value={form.packageNumber}
            onChange={set('packageNumber')}
            className={SCHEME_INPUT_CLASS}
            required
          >
            <option value="">Select a package…</option>
            {packages && Object.entries(packages).map(([num, pkg]) => (
              <option key={num} value={num}>
                ₹{pkg.investmentAmount / 100_000}L — {formatCurrency(pkg.monthlyPayout)}/mo
              </option>
            ))}
          </select>
        </FormField>

        {/* Package preview card */}
        {selectedPkg && (
          <div className="bg-sky-50 border border-sky-100 rounded-2xl p-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-sky-600">Package Details</p>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Investment',       val: formatCurrency(selectedPkg.investmentAmount) },
                { label: 'Monthly M1–60',    val: formatCurrency(selectedPkg.monthlyPayout) },
                { label: 'Bonus M51–60',     val: `+${formatCurrency(selectedPkg.cashFinalMonthly)}/mo` },
                { label: 'M51–60 Total',     val: formatCurrency(selectedPkg.monthlyPayout + selectedPkg.cashFinalMonthly) },
                { label: 'House Worth',      val: formatCurrency(selectedPkg.houseWorth) },
              ].map(({ label, val }) => (
                <div key={label}>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-sky-600/60">{label}</p>
                  <p className="text-sm font-bold text-navy">{val}</p>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-sky-600/60 pt-1">
              Payouts begin 60 days after lump sum. Monthly continues all 60 months. For M51–60: monthly + bonus (or choose a house).
            </p>
          </div>
        )}

        {/* Lump sum date */}
        <FormField label="Lump Sum Date" required>
          <BackdateDateInput
            value={form.lumpSumDate}
            onChange={set('lumpSumDate')}
            className={SCHEME_INPUT_CLASS}
            required
          />
        </FormField>

        {/* Full payment vs deposit */}
        <FormField label="Payment plan" required>
          <DepositToggle
            mode={payMode} onModeChange={setPayMode}
            deposit={deposit} onDepositChange={setDeposit}
            required={selectedPkg?.investmentAmount || 0}
          />
        </FormField>

        {/* Payment mode */}
        <FormField label="Payment Mode">
          <PaymentModeSelect
            value={form.lumpSumMode}
            onChange={(val) => { setForm(f => ({ ...f, lumpSumMode: val })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
            variant="buttons"
            includeSplit
          />
        </FormField>

        <CashBankSplitField
          mode={form.lumpSumMode}
          cashAmount={split.cashAmount}
          bankAmount={split.bankAmount}
          onChange={setSplit}
          expectedTotal={(payMode === 'deposit' ? parseFloat(deposit) : selectedPkg?.investmentAmount) || undefined}
          showError={showProofErr}
        />

        <ProofUploadField
          mode={form.lumpSumMode}
          proofKey={proofKey}
          onChange={setProofKey}
          showError={showProofErr}
        />

        <TransactionIdField
          mode={form.lumpSumMode}
          value={txnId}
          onChange={setTxnId}
          showError={showProofErr}
        />

        {/* Referrer (required — drives one-time + monthly incentives) */}
        <FormField label="Referred By" required>
          <select
            value={form.referrerId}
            onChange={set('referrerId')}
            className={SCHEME_INPUT_CLASS}
            required
          >
            <option value="">Select referrer…</option>
            {(employees || []).map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} · {emp.role?.replace(/_/g, ' ').toUpperCase()}
              </option>
            ))}
          </select>
        </FormField>

        {/* Notes */}
        <FormField label="Notes (optional)">
          <textarea
            value={form.notes}
            onChange={set('notes')}
            rows={2}
            placeholder="Any additional notes…"
            className={`${SCHEME_INPUT_CLASS} resize-none`}
          />
        </FormField>

        <FormError error={error} />

        <button
          type="submit"
          disabled={isLoading || creatingPending}
          className="w-full py-4 rounded-2xl bg-sky-600 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press"
        >
          {(isLoading || creatingPending)
            ? (payMode === 'deposit' ? 'Saving deposit…' : 'Enrolling…')
            : (payMode === 'deposit' ? 'Save Deposit' : 'Enroll Plan')}
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default BuildersAddPlanPage;
