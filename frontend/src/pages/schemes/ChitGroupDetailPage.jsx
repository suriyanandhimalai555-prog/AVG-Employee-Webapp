import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Trophy, Loader2, AlertCircle, CheckCircle2, XCircle,
  RotateCcw, CreditCard, ChevronDown, ChevronUp, Users,
  Send, Clock, ShieldCheck,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetChitGroupQuery,
  useGetChitEligibleMembersQuery,
  useGetChitMemberPaymentsQuery,
  useRecordChitPaymentMutation,
  useSelectChitWinnerMutation,
  useCancelChitMemberMutation,
  useReinstateChitMemberMutation,
  useMarkChitRefundMutation,
  useSendChitGroupToHeadBranchMutation,
} from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS } from '../../lib/schemeConstants';
import { ProofUploadField } from '../../components/money/ProofUploadField';
import { TransactionIdField } from '../../components/money/TransactionIdField';
import { CashBankSplitField } from '../../components/money/CashBankSplitField';
import { BackdateDateInput } from '../../components/BackdateDateInput';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';

const PACKAGES = {
  1: { full: 5000,  half: 2500  },
  2: { full: 10000, half: 5000  },
  3: { full: 15000, half: 7500  },
  4: { full: 20000, half: 10000 },
  5: { full: 25000, half: 12500 },
};

const STATUS_STYLES = {
  forming:         'text-blue-600 bg-blue-50',
  active:          'text-emerald-600 bg-emerald-50',
  completed:       'text-indigo bg-indigo/10',
  pending_combine: 'text-amber-700 bg-amber-50',
  combined_into:   'text-navy/50 bg-navy/5',
  expired:         'text-red-500 bg-red-50',
};

const STATUS_LABELS = {
  forming:         'Filling',
  active:          'Active',
  completed:       'Completed',
  pending_combine: 'Sent to Head Branch',
  combined_into:   'Combined',
  expired:         'Expired',
};

function computeWinnerAmount(fullAmount, month) {
  return fullAmount * (9 + month / 2);
}

function getExpectedAmount(member, pkg, month) {
  if (member.paying_half) return pkg.half;
  if (month >= 11)        return pkg.half;
  return pkg.full;
}

function daysUntilDeadline(fillDeadline) {
  if (!fillDeadline) return null;
  return Math.ceil((new Date(fillDeadline) - new Date()) / (1000 * 60 * 60 * 24));
}

// Builds a display-name map: customers who appear multiple times in the same
// group (duplicate cards) get "Name · Card N" labels; single-card customers
// stay as just "Name" so normal groups stay uncluttered.
function buildCardLabels(members) {
  const counts = new Map();
  for (const m of members) {
    counts.set(m.customer_id, (counts.get(m.customer_id) || 0) + 1);
  }
  const labels = new Map();
  for (const m of members) {
    const isDup = counts.get(m.customer_id) > 1;
    labels.set(m.id, isDup ? `${m.customer_name} · Card ${m.card_number}` : m.customer_name);
  }
  return labels;
}

// ─── Smart Payment Modal ──────────────────────────────────────────────────────
function PaymentModal({ member, group, onClose, groupId, displayName }) {
  const pkg = PACKAGES[group.package_number] || PACKAGES[1];
  const { data: payments = [], isLoading: loadingPayments } =
    useGetChitMemberPaymentsQuery({ groupId, memberId: member.id });

  const paidMonths   = new Set(payments.map(p => p.month_number));
  const firstUnpaid  = (() => { for (let m = 1; m <= 20; m++) if (!paidMonths.has(m)) return m; return null; })();

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [amount,        setAmount]        = useState('');
  const [paymentDate,   setPaymentDate]   = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode,   setPaymentMode]   = useState('cash');
  const [proofKey,      setProofKey]      = useState([]);
  const [txnId,         setTxnId]         = useState([]);
  const [split,         setSplit]         = useState({ cashAmount: '', bankAmount: '' });
  const [showProofErr,  setShowProofErr]  = useState(false);
  const [notes,         setNotes]         = useState('');
  const [error,         setError]         = useState(null);
  const [recordPayment, { isLoading }]    = useRecordChitPaymentMutation();

  useEffect(() => {
    if (!loadingPayments && firstUnpaid !== null && selectedMonth === null) {
      setSelectedMonth(firstUnpaid);
      setAmount(String(getExpectedAmount(member, pkg, firstUnpaid)));
    }
  }, [loadingPayments, firstUnpaid]); // eslint-disable-line

  const handleMonthChange = (m) => { setSelectedMonth(m); setAmount(String(getExpectedAmount(member, pkg, m))); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!selectedMonth) { setError('Select a month.'); return; }
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount.'); return; }
    if (paymentMode !== 'cash' && (!proofKey.length || !txnId.length)) {
      setShowProofErr(true);
      setError('Payment proof and transaction ID are required for GPay/bank payments.');
      return;
    }
    const splitCash = parseFloat(split.cashAmount) || 0;
    const splitBank = parseFloat(split.bankAmount) || 0;
    if (paymentMode === 'cash_bank' &&
        (splitCash <= 0 || splitBank <= 0 || Math.abs(splitCash + splitBank - parseFloat(amount)) > 0.01)) {
      setShowProofErr(true);
      setError('Cash + bank amounts must be filled and equal the payment amount.');
      return;
    }
    try {
      await recordPayment({ groupId, memberId: member.id, monthNumber: selectedMonth, amount: parseFloat(amount), paymentDate, paymentMode, proofKey: proofKey.length ? proofKey : undefined, transactionId: txnId.length ? txnId : undefined, cashAmount: paymentMode === 'cash_bank' ? splitCash : undefined, bankAmount: paymentMode === 'cash_bank' ? splitBank : undefined, notes: notes.trim() || undefined }).unwrap();
      onClose();
    } catch (err) { setError(err?.data?.error?.message || 'Failed to record payment.'); }
  };

  const allPaid = firstUnpaid === null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-navy">Record Payment</p>
            <p className="text-xs font-medium text-navy/50">{displayName || member.customer_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-navy/5 flex items-center justify-center text-navy/40">
            <XCircle size={16} aria-hidden="true" />
          </button>
        </div>

        {loadingPayments ? (
          <div className="flex justify-center py-6"><Loader2 className="animate-spin text-navy/20" size={24} aria-hidden="true" /></div>
        ) : allPaid ? (
          <div className="flex flex-col items-center py-6 gap-2">
            <CheckCircle2 size={28} className="text-emerald-500" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">All 20 months paid!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Month" required>
              <div className="grid grid-cols-5 gap-1.5">
                {Array.from({ length: 20 }, (_, i) => i + 1).map(m => {
                  const paid = paidMonths.has(m);
                  const sel  = selectedMonth === m;
                  return (
                    <button key={m} type="button" disabled={paid} onClick={() => handleMonthChange(m)}
                      className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                        paid ? 'bg-emerald-50 text-emerald-500 border-emerald-100 cursor-default' :
                        sel  ? 'bg-violet-600 text-white border-violet-600 shadow-sm' :
                               'bg-white text-navy/60 border-navy/10 hover:border-violet-200'
                      }`}>
                      {paid ? '✓' : m}
                    </button>
                  );
                })}
              </div>
              <p className="text-[10px] text-navy/30 mt-1">{paidMonths.size}/20 months paid · green = done</p>
            </FormField>

            <FormField label={`Amount${selectedMonth ? ` (expected ${formatCurrency(getExpectedAmount(member, pkg, selectedMonth))})` : ''}`} required>
              <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} className={SCHEME_INPUT_CLASS} placeholder="₹" />
            </FormField>

            <div className="grid grid-cols-2 gap-3">
              <FormField label="Date" required>
                <BackdateDateInput value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className={SCHEME_INPUT_CLASS} />
              </FormField>
              <FormField label="Notes">
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={SCHEME_INPUT_CLASS} />
              </FormField>
            </div>

            <FormField label="Mode" required>
              <PaymentModeSelect
                value={paymentMode}
                onChange={(val) => { setPaymentMode(val); setProofKey([]); setTxnId([]); setSplit({ cashAmount: '', bankAmount: '' }); setShowProofErr(false); }}
                variant="buttons"
                includeSplit
              />
            </FormField>

            <CashBankSplitField
              mode={paymentMode}
              cashAmount={split.cashAmount}
              bankAmount={split.bankAmount}
              onChange={setSplit}
              expectedTotal={amount ? parseFloat(amount) : undefined}
              showError={showProofErr}
            />

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
            <button type="submit" disabled={isLoading || !selectedMonth}
              className="w-full py-3 bg-violet-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press">
              {isLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <CreditCard size={16} aria-hidden="true" />}
              Save Payment
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── Winner Selection Modal ───────────────────────────────────────────────────
function WinnerModal({ group, groupId, onClose }) {
  const { data: eligible = [], isLoading: loadingEligible } = useGetChitEligibleMembersQuery(groupId);
  const [selectWinner, { isLoading }] = useSelectChitWinnerMutation();
  const [memberId, setMemberId] = useState('');
  const [notes, setNotes]       = useState('');
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);

  const pkg           = PACKAGES[group.package_number] || PACKAGES[1];
  const monthNumber   = group.current_month;
  const winnerAmt     = computeWinnerAmount(pkg.full, monthNumber);
  // Build per-member display labels: duplicate-customer cards get "Name · Card N"
  const eligibleLabels = buildCardLabels(eligible);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!memberId) { setError('Please select a member.'); return; }
    try {
      const res = await selectWinner({ groupId, memberId, notes: notes.trim() || undefined }).unwrap();
      setResult(res);
    } catch (err) { setError(err?.data?.error?.message || 'Failed to select winner.'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={!result ? onClose : undefined}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        {result ? (
          <div className="text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mx-auto">
              <Trophy size={32} className="text-amber-500" aria-hidden="true" />
            </div>
            <p className="text-lg font-bold text-navy">{result.customerName} wins!</p>
            <p className="text-sm text-navy/50">Month {result.monthNumber} winner</p>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 mb-1">Winner Amount</p>
              <p className="text-2xl font-bold text-amber-700">{formatCurrency(result.winnerAmount)}</p>
            </div>
            {result.groupCompleted && (
              <p className="text-xs font-bold text-indigo bg-indigo/5 rounded-xl p-2">Group completed after 20 months!</p>
            )}
            <button onClick={onClose} className="w-full py-3 bg-navy text-white text-sm font-bold rounded-2xl tactile-press">Done</button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-navy">Select Month {monthNumber} Winner</p>
                <p className="text-xs font-medium text-navy/50">Prize: {formatCurrency(winnerAmt)}</p>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-navy/5 flex items-center justify-center text-navy/40">
                <XCircle size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600">Month {monthNumber} Prize</p>
              <p className="text-xl font-bold text-amber-700 mt-1">{formatCurrency(winnerAmt)}</p>
              <p className="text-[10px] text-navy/40 mt-0.5">₹{pkg.full.toLocaleString()} × (9 + {monthNumber}/2)</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <FormField label={`Eligible Members (${loadingEligible ? '…' : eligible.length})`} required>
                {loadingEligible ? (
                  <div className="flex justify-center p-4"><Loader2 className="animate-spin text-navy/20" size={20} aria-hidden="true" /></div>
                ) : eligible.length === 0 ? (
                  <p className="text-xs text-navy/40 text-center py-3">No eligible members</p>
                ) : (
                  <select value={memberId} onChange={e => setMemberId(e.target.value)} className={`${SCHEME_INPUT_CLASS} appearance-none`}>
                    <option value="">— Select winner —</option>
                    {eligible.map(m => (
                      <option key={m.id} value={m.id}>{eligibleLabels.get(m.id)} ({m.customer_code})</option>
                    ))}
                  </select>
                )}
              </FormField>
              <FormField label="Notes">
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" className={SCHEME_INPUT_CLASS} />
              </FormField>
              <FormError error={error} />
              <button type="submit" disabled={isLoading || eligible.length === 0}
                className="w-full py-3 bg-amber-500 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press">
                {isLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Trophy size={16} aria-hidden="true" />}
                Confirm Winner
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Cancel Card Modal ────────────────────────────────────────────────────────
function CancelModal({ member, groupId, onClose, displayName }) {
  const [cancelMember, { isLoading }] = useCancelChitMemberMutation();
  const [month1, setMonth1] = useState('');
  const [month2, setMonth2] = useState('');
  const [error,  setError]  = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!month1) { setError('At least one due month is required.'); return; }
    try {
      await cancelMember({ groupId, memberId: member.id, cancelDueMonth1: parseInt(month1, 10), cancelDueMonth2: month2 ? parseInt(month2, 10) : undefined }).unwrap();
      onClose();
    } catch (err) { setError(err?.data?.error?.message || 'Failed to cancel card.'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-6 pb-10 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-red-600">Cancel Card</p>
            <p className="text-xs font-medium text-navy/50">{displayName || member.customer_name}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-navy/5 flex items-center justify-center text-navy/40">
            <XCircle size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-2xl p-3">
          <p className="text-xs text-red-700 font-medium">Enter the month(s) that caused the cancellation. Member must pay these to reinstate.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Due Month 1 *">
              <input type="number" min="1" max="20" value={month1} onChange={e => setMonth1(e.target.value)} className={SCHEME_INPUT_CLASS} placeholder="e.g. 2" />
            </FormField>
            <FormField label="Due Month 2 (if consecutive)">
              <input type="number" min="1" max="20" value={month2} onChange={e => setMonth2(e.target.value)} className={SCHEME_INPUT_CLASS} placeholder="optional" />
            </FormField>
          </div>
          <FormError error={error} />
          <button type="submit" disabled={isLoading}
            className="w-full py-3 bg-red-500 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press">
            {isLoading ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <XCircle size={16} aria-hidden="true" />}
            Cancel Card
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const ChitGroupDetailPage = () => {
  const user     = useSelector(selectCurrentUser);
  const { id }   = useParams();
  const navigate = useNavigate();

  const { data: group, isLoading } = useGetChitGroupQuery(id);
  const [reinstateMember]           = useReinstateChitMemberMutation();
  const [markRefund]                = useMarkChitRefundMutation();
  const [sendToHead, { isLoading: sending }] = useSendChitGroupToHeadBranchMutation();

  const [paymentTarget, setPaymentTarget] = useState(null);
  const [showWinner,    setShowWinner]    = useState(false);
  const [cancelTarget,  setCancelTarget]  = useState(null);
  const [expandWinners, setExpandWinners] = useState(false);
  const [actionError,   setActionError]   = useState(null);

  const isAdmin        = user?.role === 'branch_admin';
  const isHeadBranch   = user?.isHeadBranch === true;

  const handleReinstate = async (member) => {
    setActionError(null);
    try { await reinstateMember({ groupId: id, memberId: member.id }).unwrap(); }
    catch (err) { setActionError(err?.data?.error?.message || 'Reinstatement failed — ensure both due months are paid first.'); }
  };

  const handleMarkRefund = async (member) => {
    setActionError(null);
    try { await markRefund({ groupId: id, memberId: member.id }).unwrap(); }
    catch (err) { setActionError(err?.data?.error?.message || 'Failed to mark refund.'); }
  };

  const handleSendToHead = async () => {
    setActionError(null);
    if (!window.confirm('Send this group to the head branch?\n\nThe head branch admin will be able to combine it with other incomplete groups. You will no longer be able to add members or select winners.')) return;
    try { await sendToHead(id).unwrap(); }
    catch (err) { setActionError(err?.data?.error?.message || 'Failed to send to head branch.'); }
  };

  if (isLoading) return (
    <div className="flex justify-center p-16">
      <Loader2 className="animate-spin text-navy/20" size={32} aria-hidden="true" />
    </div>
  );
  if (!group) return (
    <div className="flex flex-col items-center justify-center p-12 pt-24">
      <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
      <p className="text-sm font-bold text-navy">Group not found</p>
    </div>
  );

  const pkg         = PACKAGES[group.package_number] || PACKAGES[1];
  // Build per-member display labels once; duplicate-customer cards get "Name · Card N"
  const memberLabelMap = buildCardLabels(group.members || []);
  const isForming   = group.status === 'forming';
  const isActive    = group.status === 'active';
  const isCompleted = group.status === 'completed';
  const isPending   = group.status === 'pending_combine';
  const isTerminal  = ['combined_into','expired'].includes(group.status);
  const isLocked    = isPending || isTerminal;

  const memberCount     = group.members?.length || 0;
  const currentMonth    = group.current_month;
  const monthsProgress  = group.winners?.length || 0;
  const daysLeft        = isForming ? daysUntilDeadline(group.fill_deadline) : null;

  // Gate checks
  const canSelectWinner = isAdmin && isActive && currentMonth <= 20 && group.eligibleForWin > 0;
  const canAddMember    = isAdmin && (isForming || isActive) && memberCount < 20;
  const canSendToHead   = isAdmin && isForming && !isHeadBranch;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/agila-chit"
        title={group.group_name}
        subtitle={`Package ${group.package_number} · ${formatCurrency(pkg.full)} / ${formatCurrency(pkg.half)}`}
      />

      {/* Status strip */}
      <div className="px-4 mb-4">
        <div className={`rounded-3xl p-4 card-shadow border ${isForming ? 'border-blue-100 bg-blue-50/30' : isPending ? 'border-amber-100 bg-amber-50/30' : 'border-border bg-white'}`}>
          <div className="grid grid-cols-4 divide-x divide-navy/10 mb-3">
            {[
              { label: 'Members', val: `${memberCount}/20` },
              { label: 'Status',  val: STATUS_LABELS[group.status] || group.status, cls: STATUS_STYLES[group.status] ? STATUS_STYLES[group.status].split(' ')[0] : '' },
              { label: isActive || isCompleted ? 'Month' : 'Spots Left', val: isActive || isCompleted ? `${isCompleted ? 20 : Math.max(currentMonth - 1, 1)}/20` : `${20 - memberCount}` },
              { label: 'Winners', val: monthsProgress, cls: 'text-amber-600' },
            ].map(({ label, val, cls }) => (
              <div key={label} className="text-center px-2">
                <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                <p className={`text-sm font-bold mt-0.5 ${cls || 'text-navy'}`}>{val}</p>
              </div>
            ))}
          </div>

          {/* Forming progress bar */}
          {isForming && (
            <>
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(memberCount / 20) * 100}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[9px] font-medium text-navy/40">
                  {memberCount}/20 members · winner selection begins at 20
                </p>
                {daysLeft !== null && (
                  <p className={`text-[9px] font-bold flex items-center gap-1 ${daysLeft <= 3 ? 'text-red-500' : 'text-blue-600'}`}>
                    <Clock size={9} aria-hidden="true" />
                    {daysLeft > 0 ? `${daysLeft}d to fill` : 'Deadline passed'}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Active progress bar */}
          {(isActive || isCompleted) && (
            <>
              <div className="h-1.5 bg-navy/5 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: `${Math.min((monthsProgress / 19) * 100, 100)}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[9px] font-medium text-navy/30">{monthsProgress} of 19 winner selections done</p>
                {isActive && <p className="text-[9px] font-bold text-violet-600">Next: Month {currentMonth}</p>}
              </div>
            </>
          )}

          {/* Pending / terminal banners */}
          {isPending && (
            <div className="flex items-center gap-2 mt-2 bg-amber-100 rounded-xl px-3 py-2">
              <ShieldCheck size={14} className="text-amber-700 shrink-0" aria-hidden="true" />
              <p className="text-[10px] font-bold text-amber-800">Sent to head branch · awaiting combine or expire decision</p>
            </div>
          )}
          {isTerminal && (
            <div className="flex items-center gap-2 mt-2 bg-navy/5 rounded-xl px-3 py-2">
              <p className="text-[10px] font-bold text-navy/50 uppercase tracking-wider">{STATUS_LABELS[group.status]}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      {isAdmin && !isLocked && (
        <div className="px-4 mb-4 flex gap-2 flex-wrap">
          {canSelectWinner && (
            <button onClick={() => setShowWinner(true)}
              className="flex-1 py-3 bg-amber-500 text-white text-xs font-bold rounded-2xl flex items-center justify-center gap-1.5 tactile-press shadow-md shadow-amber-100">
              <Trophy size={14} aria-hidden="true" />
              Select Month {currentMonth} Winner
            </button>
          )}
          {canAddMember && (
            <button onClick={() => navigate(`/money/schemes/agila-chit/${id}/add`)}
              className="py-3 px-4 bg-violet-600 text-white text-xs font-bold rounded-2xl flex items-center gap-1.5 tactile-press shadow-md shadow-violet-100">
              <Plus size={14} aria-hidden="true" />
              Add Member
            </button>
          )}
          {canSendToHead && (
            <button onClick={handleSendToHead} disabled={sending}
              className="py-3 px-4 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-2xl flex items-center gap-1.5 tactile-press disabled:opacity-50">
              <Send size={14} aria-hidden="true" />
              {sending ? 'Sending…' : 'Send to Head Branch'}
            </button>
          )}
        </div>
      )}

      {/* Forming instruction banner */}
      {isForming && memberCount < 20 && (
        <div className="px-4 mb-4">
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-start gap-2">
            <Users size={14} className="text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <p className="text-xs font-bold text-blue-800">Filling group — {memberCount}/20 members enrolled</p>
              <p className="text-[10px] font-medium text-blue-600 mt-0.5">
                Winner selection starts automatically when the 20th member is added.
                {canSendToHead && ' Use "Send to Head Branch" if you can\'t fill all 20.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {actionError && (
        <div className="px-4 mb-3">
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-2xl p-3">{actionError}</p>
        </div>
      )}

      {/* Members list */}
      <div className="px-4 mb-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-navy/40 mb-3">Members ({memberCount})</p>
        <div className="space-y-2">
          {(group.members || []).map((member, idx) => {
            const isCancelled = member.status === 'cancelled';
            const hasWon      = member.has_won;
            const totalPaid   = parseFloat(member.total_paid || 0);
            const monthsPaid  = member.months_paid || 0;
            const canRefund   = (isCompleted || group.status === 'expired') && isCancelled && !member.refund_credited_at;
            const expectedAmt = isActive ? getExpectedAmount(member, pkg, currentMonth) : pkg.full;

            return (
              <div key={member.id}
                className={`bg-white rounded-3xl p-4 card-shadow border ${isCancelled ? 'border-red-100' : hasWon ? 'border-amber-100' : 'border-border'}`}>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-navy">{memberLabelMap.get(member.id) || member.customer_name}</p>
                      {hasWon && <span className="shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold text-amber-700 bg-amber-50">Won M{member.won_month}</span>}
                      {isCancelled && <span className="shrink-0 px-2 py-0.5 rounded-lg text-[9px] font-bold text-red-600 bg-red-50">Cancelled</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <p className="text-[10px] font-medium text-navy/40">{member.customer_code}</p>
                      {member.referrer_name && (
                        <>
                          <span className="text-[10px] text-navy/20">·</span>
                          <p className="text-[10px] font-medium text-violet-500">via {member.referrer_name}</p>
                        </>
                      )}
                    </div>
                  </div>
                  <p className="text-[9px] font-bold text-navy/30 shrink-0">#{idx + 1}</p>
                </div>

                <div className="grid grid-cols-3 gap-2 my-3">
                  <div className="text-center bg-navy/[0.02] rounded-xl p-2">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-navy/30">Paid</p>
                    <p className="text-sm font-bold text-navy mt-0.5">{monthsPaid}/20</p>
                  </div>
                  <div className="text-center bg-navy/[0.02] rounded-xl p-2">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-navy/30">Total</p>
                    <p className="text-sm font-bold text-emerald-600 mt-0.5">{formatCurrency(totalPaid)}</p>
                  </div>
                  <div className="text-center bg-navy/[0.02] rounded-xl p-2">
                    <p className="text-[8px] font-bold uppercase tracking-wider text-navy/30">{hasWon ? 'Won' : 'Next Due'}</p>
                    <p className="text-sm font-bold mt-0.5">
                      {hasWon
                        ? <span className="text-amber-600">{formatCurrency(parseFloat(member.winner_amount || 0))}</span>
                        : <span className={member.paying_half ? 'text-violet-600' : 'text-navy'}>{isActive ? formatCurrency(expectedAmt) : '—'}</span>
                      }
                    </p>
                  </div>
                </div>

                {isCancelled && member.cancellation_due_month_1 && (
                  <div className="bg-red-50 border border-red-100 rounded-xl p-2 mb-3">
                    <p className="text-[10px] font-bold text-red-600">
                      Due to reinstate: Month {member.cancellation_due_month_1}{member.cancellation_due_month_2 ? ` & ${member.cancellation_due_month_2}` : ''}
                    </p>
                  </div>
                )}

                {isCancelled && (isCompleted || group.status === 'expired') && (
                  <div className={`rounded-xl p-2 mb-3 ${member.refund_credited_at ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'}`}>
                    <p className="text-[10px] font-bold">
                      {member.refund_credited_at
                        ? <span className="text-emerald-700">Refund credited: {formatCurrency(totalPaid)}</span>
                        : <span className="text-amber-700">Refund pending: {formatCurrency(totalPaid)}</span>
                      }
                    </p>
                  </div>
                )}

                {isAdmin && !isLocked && (
                  <div className="flex gap-2">
                    {!isCancelled && (
                      <button onClick={() => setPaymentTarget(member)}
                        className="flex-1 py-2 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1 tactile-press">
                        <CreditCard size={12} aria-hidden="true" />
                        Record Payment
                      </button>
                    )}
                    {!isCancelled && !hasWon && isActive && (
                      <button onClick={() => setCancelTarget(member)}
                        className="py-2 px-3 bg-red-50 text-red-600 text-[10px] font-bold rounded-xl flex items-center gap-1 tactile-press">
                        <XCircle size={12} aria-hidden="true" />
                        Cancel
                      </button>
                    )}
                    {isCancelled && (
                      <>
                        <button onClick={() => setPaymentTarget(member)}
                          className="py-2 px-3 bg-violet-50 text-violet-700 text-[10px] font-bold rounded-xl flex items-center gap-1 tactile-press">
                          <CreditCard size={12} aria-hidden="true" />
                          Pay Due
                        </button>
                        <button onClick={() => handleReinstate(member)}
                          className="flex-1 py-2 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1 tactile-press">
                          <RotateCcw size={12} aria-hidden="true" />
                          Reinstate
                        </button>
                      </>
                    )}
                    {canRefund && (
                      <button onClick={() => handleMarkRefund(member)}
                        className="flex-1 py-2 bg-emerald-50 text-emerald-700 text-[10px] font-bold rounded-xl flex items-center justify-center gap-1 tactile-press">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        Mark Refund Paid
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {memberCount === 0 && (
            <div className="flex flex-col items-center justify-center p-8 bg-white rounded-3xl card-shadow border border-border">
              <Users size={24} className="text-navy/20 mb-2" aria-hidden="true" />
              <p className="text-xs font-bold text-navy">No members yet</p>
              {isAdmin && <p className="text-[10px] font-medium text-navy/40 mt-1">Tap "Add Member" to start enrolling.</p>}
            </div>
          )}
        </div>
      </div>

      {/* Winners history */}
      {(group.winners || []).length > 0 && (
        <div className="px-4 mb-4">
          <button onClick={() => setExpandWinners(v => !v)} className="flex items-center justify-between w-full mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-navy/40">Winners History ({group.winners.length})</p>
            {expandWinners ? <ChevronUp size={14} className="text-navy/30" aria-hidden="true" /> : <ChevronDown size={14} className="text-navy/30" aria-hidden="true" />}
          </button>
          {expandWinners && (
            <div className="bg-white rounded-3xl card-shadow border border-amber-100 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[360px] text-left">
                  <thead>
                    <tr className="border-b border-amber-50 bg-amber-50/50">
                      <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">Month</th>
                      <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">Winner</th>
                      <th className="px-4 py-2.5 text-[9px] font-bold uppercase tracking-widest text-amber-700 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.winners.map(w => (
                      <tr key={w.id} className="border-b border-amber-50/50">
                        <td className="px-4 py-2.5 text-xs font-bold text-violet-600">M{w.month_number}</td>
                        <td className="px-4 py-2.5 text-xs font-medium text-navy">{w.customer_name}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-amber-700 text-right">{formatCurrency(parseFloat(w.winner_amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals — pass displayName so duplicate-card modals show "Name · Card N" */}
      {paymentTarget && <PaymentModal member={paymentTarget} group={group} groupId={id} onClose={() => setPaymentTarget(null)} displayName={memberLabelMap.get(paymentTarget.id)} />}
      {showWinner    && <WinnerModal group={group} groupId={id} onClose={() => setShowWinner(false)} />}
      {cancelTarget  && <CancelModal member={cancelTarget} groupId={id} onClose={() => setCancelTarget(null)} displayName={memberLabelMap.get(cancelTarget.id)} />}
    </SchemePageWrapper>
  );
};

export default ChitGroupDetailPage;
