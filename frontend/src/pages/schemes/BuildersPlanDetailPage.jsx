import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
  Loader2, CheckCircle2, Home, Banknote,
  ChevronLeft, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetBuildersPlanQuery,
  useRecordBuildersPayoutMutation,
  useChooseBuildersRewardMutation,
  useCompleteBuildersPlanMutation,
  useGetBuildersPackagesQuery,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import {
  SCHEME_INPUT_CLASS,
  getTodayISO,
  SCHEME_MODE_LABELS,
  SCHEME_MODE_STYLES,
} from '../../lib/schemeConstants';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../components/money/CashBankSplitField';
import { PhotoProof } from '../../components/money/PhotoProof';
import { TransactionIdList } from '../../components/money/TransactionIdList';

// ─── Status presentation ──────────────────────────────────────────────────────

const STATUS_META = {
  cooling:          { label: 'Cooling Period',   cls: 'text-blue-600 bg-blue-50',    icon: '❄️' },
  active:           { label: 'Active',            cls: 'text-emerald-600 bg-emerald-50', icon: '✓' },
  decision_pending: { label: 'Choose Reward',    cls: 'text-amber-700 bg-amber-50',  icon: '⚡' },
  house:            { label: 'House — Building', cls: 'text-sky-700 bg-sky-50',      icon: '🏠' },
  cash:             { label: 'Cash Payouts',     cls: 'text-violet-700 bg-violet-50', icon: '💰' },
  completed:        { label: 'Completed',        cls: 'text-indigo bg-indigo/10',    icon: '🎉' },
  cancelled:        { label: 'Cancelled',        cls: 'text-red-500 bg-red-50',      icon: '✕' },
};

// ─── Record Payout Modal ──────────────────────────────────────────────────────

const PayoutModal = ({ plan, packages, onClose, onSuccess }) => {
  const [recordPayout, { isLoading }] = useRecordBuildersPayoutMutation();

  const nextMonth      = (plan.current_month || 0) + 1;
  const isBonusMonth   = nextMonth > 50 && plan.reward_choice !== 'house';
  // M1-60: regular monthly payout every month
  // M51-60 (cash path): regular continues PLUS additional bonus on top
  const expectedAmt    = isBonusMonth
    ? parseFloat(plan.monthly_payout) + parseFloat(plan.cash_final_monthly)
    : parseFloat(plan.monthly_payout);

  const [form, setForm] = useState({
    monthNumber:  nextMonth,
    amount:       expectedAmt,
    payoutDate:   getTodayISO(),
    paymentMode:  'cash',
    notes:        '',
  });
  const [proofKey,     setProofKey]     = useState([]);
  const [txnId,        setTxnId]        = useState([]);
  const [split,        setSplit]        = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr, setShowProofErr] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (form.paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - Number(form.amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payout amount.');
      return;
    }
    try {
      const res = await recordPayout({
        planId:      plan.id,
        monthNumber: form.monthNumber,
        amount:      Number(form.amount),
        payoutDate:  form.payoutDate,
        paymentMode: form.paymentMode,
        proofKey: proofKey.length ? proofKey : undefined,
        transactionId: txnId.length ? txnId : undefined,
        cashAmount: form.paymentMode === 'cash_bank' ? splitCash : undefined,
        bankAmount: form.paymentMode === 'cash_bank' ? splitBank : undefined,
        notes:       form.notes || undefined,
      }).unwrap();
      onSuccess(res);
    } catch (err) {
      const msg = err?.data?.error?.message || err?.data?.message || 'Failed to record payout.';
      setError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-base font-bold text-navy">Record Payout — Month {nextMonth}</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Month number (read-only — sequential) */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40 mb-1">Month</p>
            <input
              type="number"
              value={form.monthNumber}
              readOnly
              className={`${SCHEME_INPUT_CLASS} bg-navy/[0.03]`}
            />
          </div>

          {/* Amount */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40 mb-1">
              Amount{' '}
              <span className="text-navy/30 normal-case font-medium">
                (expected {formatCurrency(expectedAmt)}
                {isBonusMonth && ` = ${formatCurrency(parseFloat(plan.monthly_payout))} + ${formatCurrency(parseFloat(plan.cash_final_monthly))} bonus`}
                )
              </span>
            </p>
            <input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              min="1"
              step="0.01"
              className={SCHEME_INPUT_CLASS}
              required
            />
          </div>

          {/* Payout date */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40 mb-1">Payout Date</p>
            <BackdateDateInput
              value={form.payoutDate}
              onChange={e => setForm(f => ({ ...f, payoutDate: e.target.value }))}
              className={SCHEME_INPUT_CLASS}
              required
            />
          </div>

          {/* Payment mode */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40 mb-2">Mode</p>
            <PaymentModeSelect
              value={form.paymentMode}
              onChange={(val) => { setForm(f => ({ ...f, paymentMode: val })); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
              variant="buttons"
              includeSplit
            />
          </div>

          <CashBankSplitField
            mode={form.paymentMode}
            cashAmount={split.cashAmount}
            bankAmount={split.bankAmount}
            onChange={setSplit}
            expectedTotal={form.amount ? Number(form.amount) : undefined}
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

          <FormError error={error} />

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press"
          >
            {isLoading ? 'Recording…' : `Record Month ${nextMonth} Payout`}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Choose Reward Modal ──────────────────────────────────────────────────────

const ChooseRewardModal = ({ plan, onClose, onSuccess }) => {
  const [chooseReward, { isLoading }] = useChooseBuildersRewardMutation();
  const [choice,       setChoice]     = useState('');
  const [landProvided, setLandProvided] = useState(false);
  const [error,        setError]      = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!choice) { setError('Please select a reward option.'); return; }
    if (choice === 'house' && !landProvided) {
      setError('Please confirm that the customer has provided land.');
      return;
    }
    try {
      const res = await chooseReward({
        planId:      plan.id,
        choice,
        landProvided,
      }).unwrap();
      onSuccess(res);
    } catch (err) {
      const msg = err?.data?.error?.message || err?.data?.message || 'Failed to record choice.';
      setError(msg);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-navy/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full bg-white rounded-t-3xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <p className="text-base font-bold text-navy">Choose Reward — Month 50</p>
          <button type="button" onClick={onClose} className="text-navy/40 text-xl font-bold leading-none">×</button>
        </div>

        <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-start gap-2">
          <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-xs font-medium text-amber-700">
            This choice is permanent. House: monthly payouts continue for months 51–60 at the same rate, then the house is delivered. Cash: monthly payouts continue for months 51–60 with an additional bonus.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* House option */}
          <button
            type="button"
            onClick={() => setChoice('house')}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
              choice === 'house' ? 'border-sky-500 bg-sky-50' : 'border-navy/10 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Home size={20} className={choice === 'house' ? 'text-sky-600' : 'text-navy/30'} aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-navy">House</p>
                <p className="text-xs text-navy/50">
                  Worth {formatCurrency(plan.house_worth)} · Customer must provide land
                </p>
              </div>
            </div>
          </button>

          {/* Land confirmation (house only) */}
          {choice === 'house' && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={landProvided}
                onChange={e => setLandProvided(e.target.checked)}
                className="w-5 h-5 rounded accent-sky-600"
              />
              <span className="text-sm font-medium text-navy">
                Customer has confirmed land is provided
              </span>
            </label>
          )}

          {/* Cash option */}
          <button
            type="button"
            onClick={() => setChoice('cash')}
            className={`w-full p-4 rounded-2xl border-2 text-left transition-all ${
              choice === 'cash' ? 'border-violet-500 bg-violet-50' : 'border-navy/10 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <Banknote size={20} className={choice === 'cash' ? 'text-violet-600' : 'text-navy/30'} aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-navy">Cash</p>
                <p className="text-xs text-navy/50">
                  {formatCurrency(plan.monthly_payout)}/mo continues + {formatCurrency(plan.cash_final_monthly)}/mo bonus
                  {' '}= {formatCurrency(parseFloat(plan.monthly_payout) + parseFloat(plan.cash_final_monthly))}/mo total
                </p>
              </div>
            </div>
          </button>

          <FormError error={error} />

          <button
            type="submit"
            disabled={isLoading || !choice}
            className="w-full py-4 rounded-2xl bg-amber-600 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press"
          >
            {isLoading ? 'Saving…' : `Confirm ${choice === 'house' ? 'House' : choice === 'cash' ? 'Cash' : 'Reward'}`}
          </button>
        </form>
      </div>
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export const BuildersPlanDetailPage = () => {
  const { id }   = useParams();
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [showPayoutModal,  setShowPayoutModal]  = useState(false);
  const [showRewardModal,  setShowRewardModal]  = useState(false);

  const [completePlan, { isLoading: isCompleting }] = useCompleteBuildersPlanMutation();
  const [completeError, setCompleteError] = useState('');

  const { data: plan, isLoading, error } = useGetBuildersPlanQuery(id);
  const { data: packages } = useGetBuildersPackagesQuery();

  if (isLoading) {
    return (
      <SchemePageWrapper>
        <div className="flex justify-center items-center py-20">
          <Loader2 className="animate-spin text-sky-500" size={32} aria-hidden="true" />
        </div>
      </SchemePageWrapper>
    );
  }

  if (error || !plan) {
    return (
      <SchemePageWrapper>
        <div className="px-4 pt-10 text-center">
          <p className="text-sm font-bold text-navy">Plan not found.</p>
          <button
            onClick={() => navigate('/money/schemes/builders')}
            className="mt-4 text-xs font-bold text-sky-600 underline"
          >
            ← Back to Builders
          </button>
        </div>
      </SchemePageWrapper>
    );
  }

  const isBranchAdmin = user?.role === 'branch_admin';
  const statusMeta    = STATUS_META[plan.status] || { label: plan.status, cls: 'bg-navy/5 text-navy/40', icon: '' };
  const progress      = Math.min(((plan.current_month || 0) / 60) * 100, 100);
  const nextMonth     = (plan.current_month || 0) + 1;
  const payouts       = plan.payouts || [];

  const canRecordPayout = isBranchAdmin
    && ['cooling', 'active', 'cash', 'house'].includes(plan.status)
    && plan.current_month < 60;
  const canChooseReward = isBranchAdmin && plan.status === 'decision_pending';
  const canComplete     = isBranchAdmin && plan.status === 'house' && plan.current_month >= 60;

  const handleComplete = async () => {
    setCompleteError('');
    try {
      await completePlan(plan.id).unwrap();
    } catch (err) {
      const msg = err?.data?.error?.message || err?.data?.message || 'Failed to complete plan.';
      setCompleteError(msg);
    }
  };

  return (
    <SchemePageWrapper>
      {/* Header */}
      <div className="px-4 mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/money/schemes/builders')}
          className="w-9 h-9 rounded-2xl bg-navy/5 flex items-center justify-center text-navy/50 tactile-press flex-shrink-0"
          aria-label="Back"
        >
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-navy truncate">{plan.customer_name}</h2>
          <p className="text-[11px] font-medium text-navy/40">{plan.customer_code}</p>
        </div>
        <span className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${statusMeta.cls}`}>
          {statusMeta.label}
        </span>
      </div>

      {/* Decision pending alert */}
      {plan.status === 'decision_pending' && (
        <div className="px-4 mb-4">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-amber-700">Month 50 Complete — Choose Reward</p>
              <p className="text-xs text-amber-600 mt-0.5">
                The customer must now decide: receive a constructed house (monthly payouts continue for months 51–60 at the same rate, then house is delivered) or continue monthly cash payouts for months 51–60 with an additional bonus.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Plan details card */}
      <div className="px-4 mb-4">
        <div className="bg-white rounded-3xl p-5 card-shadow border border-navy/5">
          {/* Progress bar */}
          {plan.current_month > 0 && (
            <div className="mb-4">
              <div className="flex justify-between text-[10px] font-bold text-navy/40 mb-1.5">
                <span>Month {plan.current_month} of 60</span>
                <span>{60 - plan.current_month} remaining</span>
              </div>
              <div className="h-2 bg-navy/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-500 rounded-full transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              { label: 'Package',          val: packages?.[plan.package_number]
                  ? `₹${plan.investment_amount / 100_000}L (Pkg ${plan.package_number})`
                  : `Package ${plan.package_number}` },
              { label: 'Investment',       val: formatCurrency(plan.investment_amount) },
              { label: 'Monthly M1–60',     val: formatCurrency(plan.monthly_payout) },
              { label: 'Bonus M51–60',      val: `+${formatCurrency(plan.cash_final_monthly)}/mo` },
              ...(plan.reward_choice === 'house' || plan.status === 'house' || plan.status === 'decision_pending'
                ? [{ label: 'House Worth', val: formatCurrency(plan.house_worth) }]
                : []),
              { label: 'Lump Sum',         val: `${formatDate(plan.lump_sum_date)} · ${SCHEME_MODE_LABELS[plan.lump_sum_mode] || plan.lump_sum_mode}` },
              { label: 'Payout Starts',    val: formatDate(plan.payout_start_date) },
              ...(plan.reward_choice ? [{ label: 'Reward',      val: plan.reward_choice === 'house' ? '🏠 House' : '💰 Cash' }] : []),
              ...(plan.referrer_name ? [{ label: 'Referred by', val: plan.referrer_name }] : []),
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30">{label}</p>
                <p className="text-sm font-semibold text-navy mt-0.5">{val}</p>
              </div>
            ))}
          </div>

          {/* Notes */}
          {plan.notes && (
            <div className="mt-4 pt-3 border-t border-navy/5">
              <p className="text-[9px] font-bold uppercase tracking-wider text-navy/30 mb-0.5">Notes</p>
              <p className="text-xs text-navy/60">{plan.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="px-4 mb-4 space-y-2">
        {canRecordPayout && (
          <button
            type="button"
            onClick={() => setShowPayoutModal(true)}
            className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            Record Month {nextMonth} Payout
          </button>
        )}
        {canChooseReward && (
          <button
            type="button"
            onClick={() => setShowRewardModal(true)}
            className="w-full py-3.5 rounded-2xl bg-amber-500 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2"
          >
            <AlertCircle size={16} aria-hidden="true" />
            Choose Reward (House or Cash)
          </button>
        )}
        {canComplete && (
          <>
            <button
              type="button"
              onClick={handleComplete}
              disabled={isCompleting}
              className="w-full py-3.5 rounded-2xl bg-sky-600 text-white text-sm font-bold shadow-md tactile-press flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Home size={16} aria-hidden="true" />
              {isCompleting ? 'Completing…' : 'Mark House Delivered'}
            </button>
            {completeError && (
              <p className="text-xs text-red-600 text-center mt-1">{completeError}</p>
            )}
          </>
        )}
      </div>

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
            Payout History · {payouts.length}/60
          </p>
          <div className="bg-white rounded-2xl border border-navy/5 card-shadow overflow-hidden">
            <div className="grid grid-cols-4 text-[9px] font-bold uppercase tracking-wider text-navy/30 px-4 py-2.5 bg-navy/[0.02] border-b border-navy/5">
              <span>Month</span>
              <span className="text-right">Amount</span>
              <span className="text-right">Date</span>
              <span className="text-right">Mode</span>
            </div>
            <div className="divide-y divide-navy/5 max-h-72 overflow-y-auto">
              {[...payouts].reverse().map(p => (
                <div key={p.id} className="px-4 py-2.5">
                  <div className="grid grid-cols-4">
                    <span className="text-xs font-bold text-navy">M{p.month_number}</span>
                    <span className="text-xs font-bold text-emerald-600 text-right">
                      {formatCurrency(parseFloat(p.amount))}
                    </span>
                    <span className="text-[10px] text-navy/50 text-right">{formatDate(p.payout_date)}</span>
                    <span className={`text-[9px] font-bold text-right ${SCHEME_MODE_STYLES[p.payment_mode] || ''}`}>
                      {SCHEME_MODE_LABELS[p.payment_mode] || p.payment_mode}
                    </span>
                  </div>
                  {p.payment_mode === 'cash_bank' && (
                    <p className="text-[10px] font-medium text-navy/50 mt-1">
                      Cash <span className="font-bold text-amber-600">{formatCurrency(p.cash_amount)}</span>
                      {' · '}Bank <span className="font-bold text-emerald-600">{formatCurrency(p.bank_amount)}</span>
                    </p>
                  )}
                  <PhotoProof photoKey={p.proof_key} />
                  <TransactionIdList transactionId={p.transaction_id} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {payouts.length === 0 && plan.status === 'cooling' && (
        <div className="px-4 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 text-center">
            <p className="text-sm font-bold text-blue-700">In Cooling Period</p>
            <p className="text-xs text-blue-500 mt-1">
              First payout can be recorded from {formatDate(plan.payout_start_date)}.
            </p>
          </div>
        </div>
      )}

      {/* Modals */}
      {showPayoutModal && (
        <PayoutModal
          plan={plan}
          packages={packages}
          onClose={() => setShowPayoutModal(false)}
          onSuccess={() => setShowPayoutModal(false)}
        />
      )}
      {showRewardModal && (
        <ChooseRewardModal
          plan={plan}
          onClose={() => setShowRewardModal(false)}
          onSuccess={() => setShowRewardModal(false)}
        />
      )}
    </SchemePageWrapper>
  );
};

export default BuildersPlanDetailPage;
