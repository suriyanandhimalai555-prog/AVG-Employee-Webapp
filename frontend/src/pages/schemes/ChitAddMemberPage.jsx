import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, Loader2, AlertCircle, UserPlus } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetChitGroupQuery,
  useAddChitMemberMutation,
  useGetGoldEmployeesQuery,
} from '../../store/api/apiSlice';
import { CustomerPicker } from '../../components/CustomerPicker';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { formatCurrency } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, getTodayISO } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { SuccessConfirmation } from './components/SuccessConfirmation';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';

export const ChitAddMemberPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const { id: groupId } = useParams();

  const { data: group, isLoading: loadingGroup } = useGetChitGroupQuery(groupId);
  const { data: employees = [] }                  = useGetGoldEmployeesQuery();
  const [addMember, { isLoading }]                = useAddChitMemberMutation();

  const [customer,     setCustomer]     = useState(null);
  const [referrerId,   setReferrerId]   = useState('');
  const [paymentDate,  setPaymentDate]  = useState(getTodayISO());
  const [paymentMode,  setPaymentMode]  = useState('cash');
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [showProofErr, setShowProofErr] = useState(false);
  const [error,        setError]        = useState(null);
  const [result,       setResult]       = useState(null);

  const fullAmount      = group ? parseFloat(group.full_amount) : 0;
  const commissionAmt   = referrerId ? fullAmount * 0.2 : 0;
  const referrerName    = employees.find(e => e.id === referrerId)?.name || '';
  const memberCount     = group?.members?.length || 0;
  const spotsLeft       = 20 - memberCount;

  const resetForm = () => {
    setCustomer(null);
    setReferrerId('');
    setPaymentDate(getTodayISO());
    setPaymentMode('cash');
    setProofKey([]);
    setTxnId([]);
    setShowProofErr(false);
    setError(null);
    setResult(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!customer) { setError('Please select or create a customer.'); return; }
    if (paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    try {
      const res = await addMember({
        groupId,
        customerId:            customer.id,
        referrerId:            referrerId || undefined,
        firstPaymentDate:      paymentDate,
        firstPaymentMode:      paymentMode,
        firstPaymentProofKey:  proofKey.length ? proofKey : undefined,
        firstPaymentTransactionId: txnId.length ? txnId : undefined,
      }).unwrap();
      setResult(res);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to add member.');
    }
  };

  if (user?.role !== 'branch_admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access Denied</p>
        <p className="text-xs font-medium text-navy/40 mt-1">Only Branch Admin can add members.</p>
      </div>
    );
  }

  if (loadingGroup) {
    return (
      <div className="flex justify-center p-16">
        <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
      </div>
    );
  }

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Group not found</p>
      </div>
    );
  }

  // Success screen — with "Add Another Member" button for fast bulk enrollment
  if (result) {
    const comm = result.commissionAmount || 0;
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title="Member Added"
          subtitle={customer?.name}
          code={group.group_name}
          onDone={() => navigate(`/money/schemes/agila-chit/${groupId}`)}
        >
          {/* Commission panel */}
          {comm > 0 ? (
            <div className="w-full bg-violet-50 border border-violet-100 rounded-3xl p-4 space-y-2 text-left">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600 text-center mb-3">
                Commission Credited
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-navy/60">Referral (20% of Month 1)</span>
                <span className="text-sm font-bold text-violet-700">{formatCurrency(comm)}</span>
              </div>
              <div className="flex items-center justify-between border-t border-violet-100 pt-2">
                <span className="text-xs font-medium text-navy/40">Credited to {referrerName}</span>
                <span className="text-xs font-bold text-emerald-600">✓ Done</span>
              </div>
            </div>
          ) : (
            <div className="w-full bg-navy/3 border border-navy/5 rounded-3xl p-4 text-center">
              <p className="text-xs font-medium text-navy/40">No referrer — no commission this enrollment.</p>
            </div>
          )}

          {/* Month-1 payment confirmation */}
          <div className="w-full bg-emerald-50 border border-emerald-100 rounded-3xl p-4 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy/60">Month 1 payment recorded</span>
              <span className="text-sm font-bold text-emerald-700">{formatCurrency(fullAmount)}</span>
            </div>
          </div>

          {/* Add Another button inline above Done */}
          <button
            onClick={resetForm}
            className="w-full py-3 bg-violet-600 text-white rounded-2xl font-bold tactile-press flex items-center justify-center gap-2"
          >
            <UserPlus size={16} aria-hidden="true" />
            Add Another Member
          </button>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={`/money/schemes/agila-chit/${groupId}`}
        title="Add Member"
        subtitle={`${group.group_name} · ${spotsLeft} spot${spotsLeft !== 1 ? 's' : ''} left`}
      />

      <form onSubmit={handleSubmit} className="px-4 space-y-5">

        {/* Group info strip */}
        <div className="bg-violet-50 border border-violet-100 rounded-2xl p-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Package</p>
            <p className="text-sm font-bold text-violet-700 mt-0.5">#{group.package_number}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Month 1</p>
            <p className="text-sm font-bold text-navy mt-0.5">{formatCurrency(fullAmount)}</p>
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Members</p>
            <p className="text-sm font-bold text-navy mt-0.5">{memberCount}/20</p>
          </div>
        </div>

        <FormField label="Customer" required>
          <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)} />
        </FormField>

        <FormField label="Referred By">
          <div className="relative">
            <select
              value={referrerId}
              onChange={e => setReferrerId(e.target.value)}
              className={`${SCHEME_INPUT_CLASS} appearance-none pr-10`}
            >
              <option value="">— None (no commission) —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role.replace(/_/g, ' ').toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </FormField>

        {/* Live commission preview — appears when a referrer is selected */}
        {referrerId && (
          <div className="flex items-center justify-between bg-violet-50 border border-violet-100 rounded-2xl px-4 py-3">
            <div>
              <p className="text-xs font-bold text-violet-700">Commission on enrollment</p>
              <p className="text-[10px] font-medium text-violet-500">20% of ₹{fullAmount.toLocaleString()} (Month-1)</p>
            </div>
            <p className="text-lg font-bold text-violet-700">{formatCurrency(commissionAmt)}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Month 1 Date" required>
            <BackdateDateInput
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              className={SCHEME_INPUT_CLASS}
            />
          </FormField>
        </div>

        <FormField label="Month 1 Payment Mode" required>
          <PaymentModeSelect
            value={paymentMode}
            onChange={(val) => { setPaymentMode(val); setProofKey([]); setTxnId([]); setShowProofErr(false); }}
            variant="buttons"
          />
          <p className="text-[10px] font-medium text-navy/30 mt-1.5">
            Month 1 ({formatCurrency(fullAmount)}) is recorded automatically on save.
          </p>
        </FormField>

        <ProofUploadField
          mode={paymentMode}
          proofKey={proofKey}
          onChange={setProofKey}
          showError={showProofErr}
        />

        <TransactionIdField
          mode={paymentMode}
          value={txnId}
          onChange={setTxnId}
          showError={showProofErr}
        />

        <FormError error={error} />

        <button
          type="submit"
          disabled={isLoading || spotsLeft <= 0}
          className="w-full py-4 bg-violet-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-violet-200"
        >
          {isLoading
            ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            : <Save size={18} aria-hidden="true" />}
          {spotsLeft <= 0 ? 'Group is full' : 'Enroll Member'}
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default ChitAddMemberPage;
