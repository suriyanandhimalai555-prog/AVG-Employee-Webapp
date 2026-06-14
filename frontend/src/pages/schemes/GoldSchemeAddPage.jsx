import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Save, Loader2, AlertCircle } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useAddGoldMemberMutation, useGetGoldEmployeesQuery } from '../../store/api/apiSlice';
import { CustomerPicker } from '../../components/CustomerPicker';
import { BranchPicker } from '../../components/BranchPicker';
import { PeriodDateInput } from '../../components/PeriodDateInput';
import { formatCurrency } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, createFormSetter, getTodayISO } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { SuccessConfirmation } from './components/SuccessConfirmation';

export const GoldSchemeAddPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: employees = [] } = useGetGoldEmployeesQuery();
  const [addMember, { isLoading }] = useAddGoldMemberMutation();

  const isManagement = user?.role === 'management';
  const [branchId,  setBranchId]  = useState('');
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    chitNumber:       '',
    referrerId:       '',
    monthlyAmount:    '',
    startDate:        getTodayISO(),
    totalMonths:      12,
    firstPaymentMode: 'cash',
    notes:            '',
  });
  const [proofKey,    setProofKey]    = useState(null);
  const [showProofErr, setShowProofErr] = useState(false);
  const [error,  setError]  = useState(null);
  const [result, setResult] = useState(null);

  const set = createFormSetter(setForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!customer)       { setError('Please select or create a customer.'); return; }
    if (!form.referrerId){ setError('Referrer is required.'); return; }
    if (!form.chitNumber || !form.monthlyAmount || !form.startDate) {
      setError('Chit number, monthly amount, and start date are required.');
      return;
    }
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    if (form.firstPaymentMode !== 'cash' && !proofKey) {
      setShowProofErr(true);
      setError('Please upload payment proof for GPay/bank payments.');
      return;
    }
    try {
      const res = await addMember({
        chitNumber:            form.chitNumber.trim(),
        customerId:            customer.id,
        referrerId:            form.referrerId,
        monthlyAmount:         parseFloat(form.monthlyAmount),
        startDate:             form.startDate,
        totalMonths:           parseInt(form.totalMonths, 10),
        firstPaymentMode:      form.firstPaymentMode,
        firstPaymentProofKey:  proofKey || undefined,
        notes:                 form.notes.trim() || undefined,
        branchId:              isManagement ? branchId : undefined,
      }).unwrap();
      setResult(res);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save member.');
    }
  };

  if (user?.role !== 'branch_admin' && !isManagement) {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access Denied</p>
        <p className="text-xs font-medium text-navy/40 mt-1">Only Branch Admin can add members.</p>
      </div>
    );
  }

  if (result) {
    const comm         = result.commissionAmount || 0;
    const referrerName = employees.find(e => e.id === form.referrerId)?.name || 'Referrer';
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title="Member Added"
          subtitle={customer?.name}
          code={`Chit #${form.chitNumber}`}
          onDone={() => navigate('/money/schemes/gold')}
        >
          <div className="w-full bg-amber-50 border border-amber-100 rounded-3xl p-4 space-y-2 text-left">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600 text-center mb-3">
              Commission Credited
            </p>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy/60">New enrollment (20%)</span>
              <span className="text-sm font-bold text-amber-700">{formatCurrency(comm)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-amber-100 pt-2">
              <span className="text-xs font-medium text-navy/40">Credited to {referrerName}</span>
              <span className="text-xs font-bold text-emerald-600">✓ Done</span>
            </div>
            <p className="text-[10px] text-navy/30 pt-1">
              Renewal payments will earn 15% commission per month.
            </p>
          </div>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/gold"
        title="Add Member"
        subtitle="New gold scheme enrollment"
      />

      <form onSubmit={handleSubmit} className="px-4 space-y-5">

        {isManagement && (
          <FormField label="Branch" required>
            <BranchPicker value={branchId} onChange={setBranchId} />
          </FormField>
        )}

        <FormField label="Customer" required>
          <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)}
            branchId={isManagement ? branchId : undefined} />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Chit / S.No" required>
            <input
              type="text"
              placeholder="e.g. 4025"
              value={form.chitNumber}
              onChange={set('chitNumber')}
              className={SCHEME_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Start Date" required>
            <PeriodDateInput value={form.startDate} onChange={set('startDate')} className={SCHEME_INPUT_CLASS} required />
          </FormField>
        </div>

        <FormField label="Referred By" required>
          <div className="relative">
            <select
              value={form.referrerId}
              onChange={set('referrerId')}
              className={`${SCHEME_INPUT_CLASS} appearance-none pr-10`}
            >
              <option value="">— Select employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role.replace(/_/g, ' ').toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Monthly Amount (₹)" required>
            <input
              type="number"
              placeholder="1000"
              min="1"
              value={form.monthlyAmount}
              onChange={set('monthlyAmount')}
              className={SCHEME_INPUT_CLASS}
            />
          </FormField>
          <FormField label="Duration (months)" required>
            <input
              type="number"
              min="1"
              max="60"
              value={form.totalMonths}
              onChange={set('totalMonths')}
              className={SCHEME_INPUT_CLASS}
            />
          </FormField>
        </div>

        {/* Scheme value preview */}
        {form.monthlyAmount && form.totalMonths && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
            <p className="text-xs font-bold text-amber-700">Total scheme value</p>
            <p className="text-lg font-bold text-amber-700">
              {formatCurrency(parseFloat(form.monthlyAmount || 0) * parseInt(form.totalMonths || 12))}
            </p>
          </div>
        )}

        <FormField label="Month 1 Payment Mode" required>
          <PaymentModeSelect
            value={form.firstPaymentMode}
            onChange={(val) => { setForm(f => ({ ...f, firstPaymentMode: val })); setProofKey(null); setShowProofErr(false); }}
            variant="buttons"
          />
          <p className="text-[10px] font-medium text-navy/30 mt-1.5">
            Month 1 will be recorded automatically when you save.
          </p>
        </FormField>

        <ProofUploadField
          mode={form.firstPaymentMode}
          proofKey={proofKey}
          onChange={setProofKey}
          showError={showProofErr}
        />

        <FormField label="Notes">
          <textarea
            rows={2}
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={set('notes')}
            className={`${SCHEME_INPUT_CLASS} resize-none`}
          />
        </FormField>

        <FormError error={error} />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-indigo text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-indigo/20"
        >
          {isLoading
            ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            : <Save size={18} aria-hidden="true" />}
          Save Member
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default GoldSchemeAddPage;
