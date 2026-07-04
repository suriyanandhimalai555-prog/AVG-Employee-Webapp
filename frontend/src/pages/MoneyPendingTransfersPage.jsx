import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, X, Loader2, Info, ChevronRight,
  AlertCircle, ArrowUpRight
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyCollectionsQuery,
  useVerifyMoneyCollectionMutation,
  useGetMoneySourcesQuery,
} from '../store/api/apiSlice';
import { SourceInspector } from '../components/money/SourceInspector';

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const TransferCard = ({ transfer, onApprove, onReject, isVerifying, verifyingId, isIncoming }) => {
  const [rejectingThis, setRejectingThis] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [inspecting, setInspecting] = useState(false);

  const busy = isVerifying && verifyingId === transfer.id;

  return (
    <div className="bg-white rounded-3xl p-5 card-shadow border border-amber-100 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-bold text-navy">₹{parseFloat(transfer.amount).toLocaleString()}</p>
          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mt-0.5">Cash Transfer</p>
        </div>
        <div className="text-right space-y-1">
          <div>
            <p className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">From</p>
            <p className="text-xs font-bold text-navy mt-0.5">{transfer.submitter_name}</p>
            <p className="text-[9px] text-navy/30 capitalize">{transfer.submitter_role?.replace(/_/g, ' ')}</p>
          </div>
          {transfer.verifier_name && (
            <div>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">To</p>
              <p className="text-xs font-bold text-navy mt-0.5">{transfer.verifier_name}</p>
            </div>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3 bg-navy/2 rounded-2xl p-3">
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Project</p>
          <p className="text-xs font-bold text-navy mt-0.5 truncate">{transfer.project_name}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Date</p>
          <p className="text-xs font-bold text-navy mt-0.5">{formatDate(transfer.submitted_at)}</p>
        </div>
      </div>

      {/* Inspect sources */}
      <button
        onClick={() => setInspecting(true)}
        className="w-full p-3 rounded-2xl bg-indigo/5 border border-indigo/10 flex items-center justify-between text-indigo hover:bg-indigo/10 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm">
            <Info size={15} />
          </div>
          <p className="text-xs font-bold">
            View Source Collections ({transfer.source_collection_ids?.length || 0})
          </p>
        </div>
        <ChevronRight size={16} className="text-indigo/40 group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Actions — only for incoming transfers (where current user is the verifier) */}
      {isIncoming ? (
        <AnimatePresence>
          {rejectingThis ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-3"
            >
              <textarea
                autoFocus
                rows={2}
                placeholder="Reason for rejection..."
                className="w-full bg-red-50/50 border border-red-100 rounded-2xl p-4 text-xs font-medium text-red-900 placeholder:text-red-300 outline-none resize-none"
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => { setRejectingThis(false); setRejectNote(''); }}
                  className="flex-1 py-3 rounded-xl bg-navy/5 text-navy font-bold text-xs tactile-press"
                >
                  Cancel
                </button>
                <button
                  disabled={!rejectNote.trim() || busy}
                  onClick={() => onReject(transfer.id, rejectNote)}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-xs tactile-press shadow-lg shadow-red-500/20 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <><X size={14} /> Confirm Reject</>}
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => setRejectingThis(true)}
                className="flex-[0.3] py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center tactile-press disabled:opacity-50"
              >
                <X size={18} />
              </button>
              <button
                disabled={busy}
                onClick={() => onApprove(transfer.id)}
                className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 tactile-press shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> Approve Transfer</>}
              </button>
            </div>
          )}
        </AnimatePresence>
      ) : (
        <div className="flex items-center justify-center gap-2 py-3 bg-amber-50 rounded-xl border border-amber-100">
          <Loader2 size={14} className="text-amber-500" />
          <p className="text-xs font-bold text-amber-600">Awaiting approval from receiver</p>
        </div>
      )}

      <AnimatePresence>
        {inspecting && <SourceInspector transferId={transfer.id} onClose={() => setInspecting(false)} />}
      </AnimatePresence>
    </div>
  );
};

export const MoneyPendingTransfersPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: collectionsResult, isLoading } = useGetMoneyCollectionsQuery({ status: 'pending' });
  const [verifyCollection, { isLoading: isVerifying }] = useVerifyMoneyCollectionMutation();
  const [verifyingId, setVerifyingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  const allTransfers = [...(collectionsResult?.data || [])].filter(c => c.mode === 'cash_transfer');

  // Incoming: transfers assigned to the current user for approval
  const incomingTransfers = allTransfers
    .filter(c => c.assigned_verifier_id === user?.id)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  // Outgoing: transfers the current user sent that are still pending
  const outgoingTransfers = allTransfers
    .filter(c => c.user_id === user?.id && c.assigned_verifier_id !== user?.id)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  // In-transit (MD-only): pending cash_transfers between other employees
  const inTransitTransfers = user?.role === 'md'
    ? allTransfers.filter(c => c.assigned_verifier_id !== user?.id && c.user_id !== user?.id)
        .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))
    : [];

  const totalPending = incomingTransfers.reduce((s, c) => s + parseFloat(c.amount), 0);

  const handleApprove = async (id) => {
    setVerifyingId(id);
    setActionError(null);
    try {
      await verifyCollection({ id, status: 'approved' }).unwrap();
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Approval failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleReject = async (id, rejectionNote) => {
    setVerifyingId(id);
    setActionError(null);
    try {
      await verifyCollection({ id, status: 'rejected', rejectionNote }).unwrap();
    } catch (err) {
      setActionError(err?.data?.error?.message || 'Rejection failed');
    } finally {
      setVerifyingId(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="pb-32 pt-4"
    >
      {/* Header */}
      <div className="px-4 flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/money')}
          className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"
        >
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-navy tracking-tight">Pending Transfers</h2>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">Cash handed over awaiting your acknowledgment</p>
        </div>
      </div>

      <div className="px-4 space-y-4">
        {/* Info note — transfers are not counted in collection totals */}
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
          <AlertCircle size={15} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-[10px] font-semibold text-amber-700 leading-relaxed">
            These cash transfers are <strong>not counted</strong> in the collection totals to avoid double-counting.
            Once you approve, the amount enters your wallet.
          </p>
        </div>

        {/* Total summary */}
        {incomingTransfers.length > 0 && (
          <div className="bg-white rounded-xl p-5 card-shadow border border-border flex items-center justify-between">
            <div>
              <p className="text-[9px] uppercase tracking-widest font-bold text-navy/30">Total Awaiting Your Approval</p>
              <p className="text-2xl font-bold text-navy mt-0.5">₹{totalPending.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
              <ArrowUpRight size={22} className="text-amber-600" />
            </div>
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-700">{actionError}</p>
          </div>
        )}

        {/* Transfer cards */}
        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="animate-spin text-navy/20" size={32} />
          </div>
        ) : (incomingTransfers.length === 0 && outgoingTransfers.length === 0 && inTransitTransfers.length === 0) ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-border">
            <div className="w-16 h-16 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
              <Check size={28} className="text-emerald-500" />
            </div>
            <p className="text-base font-bold text-navy mb-1">All Caught Up</p>
            <p className="text-xs font-medium text-navy/40 text-center">No pending cash transfers at this time.</p>
          </div>
        ) : (
          <>
            {incomingTransfers.length > 0 && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">Awaiting Your Approval</p>
                {incomingTransfers.map(transfer => (
                  <TransferCard
                    key={transfer.id}
                    transfer={transfer}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isVerifying={isVerifying}
                    verifyingId={verifyingId}
                    isIncoming
                  />
                ))}
              </div>
            )}

            {outgoingTransfers.length > 0 && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">Sent by You</p>
                {outgoingTransfers.map(transfer => (
                  <TransferCard
                    key={transfer.id}
                    transfer={transfer}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isVerifying={isVerifying}
                    verifyingId={verifyingId}
                    isIncoming={false}
                  />
                ))}
              </div>
            )}

            {inTransitTransfers.length > 0 && (
              <div className="space-y-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30">In Transit Between Staff</p>
                {inTransitTransfers.map(transfer => (
                  <TransferCard
                    key={transfer.id}
                    transfer={transfer}
                    onApprove={handleApprove}
                    onReject={handleReject}
                    isVerifying={isVerifying}
                    verifyingId={verifyingId}
                    isIncoming={false}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
};

export default MoneyPendingTransfersPage;
