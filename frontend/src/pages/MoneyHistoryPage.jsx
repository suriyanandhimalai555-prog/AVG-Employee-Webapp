import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, XCircle, CheckCircle2, AlertCircle, Info, Loader2 } from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyCollectionsQuery,
  useVerifyMoneyCollectionMutation,
} from '../store/api/apiSlice';
import { SourceInspector } from '../components/money/SourceInspector';
import { PhotoProof } from '../components/money/PhotoProof';

const STATUS_COLORS = {
  pending: 'text-amber-500 bg-amber-50 border-amber-200',
  approved: 'text-emerald-500 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200'
};

const MODE_LABELS = {
  gpay: 'Google Pay',
  bank_receipt: 'Bank Receipt',
  cash: 'Cash in Hand',
  cash_transfer: 'Cash Transfer'
};

export const MoneyHistoryPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: collectionsResult, isLoading: isCollectionsLoading } = useGetMoneyCollectionsQuery();
  const collections = collectionsResult?.data || [];
  const [verifyCollection, { isLoading: isVerifying }] = useVerifyMoneyCollectionMutation();

  const [verifyingId, setVerifyingId] = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectingId, setRejectingId] = useState(null);
  const [inspectingId, setInspectingId] = useState(null);
  const [formError, setFormError] = useState(null);

  const handleApprove = async (id) => {
    setVerifyingId(id);
    try {
      await verifyCollection({ id, status: 'approved' }).unwrap();
    } catch (err) {
      setFormError(err?.data?.error?.message || 'Approval failed');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleReject = async (id) => {
    if (!rejectNote.trim()) return;
    setVerifyingId(id);
    try {
      await verifyCollection({ id, status: 'rejected', rejectionNote: rejectNote }).unwrap();
      setRejectingId(null);
      setRejectNote('');
    } catch (err) {
      setFormError(err?.data?.error?.message || 'Rejection failed');
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
      <div className="px-4 flex items-center mb-6">
        <button onClick={() => navigate('/money')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press">
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <h3 className="text-lg font-bold text-navy ml-4">My Collections</h3>
      </div>

      <div className="px-6 space-y-4">
        {isCollectionsLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
        ) : collections.length === 0 ? (
          <p className="text-center text-sm text-navy/40 py-8 font-medium">You haven't submitted or verified any collections.</p>
        ) : (
          collections.map(col => (
            <div key={col.id} className="bg-white p-5 rounded-3xl card-shadow border border-navy/5 space-y-3 relative overflow-hidden">
              {col.status === 'rejected' && <div className="absolute top-0 right-0 w-12 h-12 bg-red-500 blur-3xl opacity-20" />}
              {col.status === 'approved' && <div className="absolute top-0 right-0 w-12 h-12 bg-emerald-500 blur-3xl opacity-20" />}

              <div className="flex justify-between items-start relative z-10">
                <div>
                  <p className="text-lg font-bold text-navy">₹{parseFloat(col.amount).toLocaleString()}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40 mt-0.5">{col.client_name}</p>
                  {col.submitter_name && col.user_id !== user?.id && (
                    <p className="text-[10px] font-semibold text-indigo mt-1">From {col.submitter_name}</p>
                  )}
                </div>
                <div className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${STATUS_COLORS[col.status]}`}>
                  {col.status}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-navy/2 rounded-2xl p-3 relative z-10">
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Mode</p>
                  <p className="text-xs font-bold text-navy mt-0.5">{MODE_LABELS[col.mode]}</p>
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Project</p>
                  <p className="text-xs font-bold text-navy mt-0.5 truncate">{col.project_name}</p>
                </div>
              </div>

              {col.verifier_name && (
                <div className="px-3 py-2 bg-navy/2 rounded-xl border border-navy/5 flex items-center justify-between relative z-10">
                  <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Receiver</p>
                  <p className="text-[10px] font-bold text-navy">{col.verifier_name}</p>
                </div>
              )}

              {col.mode === 'cash_transfer' && (
                <button
                  onClick={() => setInspectingId(col.id)}
                  className="p-3 rounded-2xl bg-navy/2 border border-navy/5 flex items-center justify-center gap-2 text-[10px] font-bold text-navy/40 hover:bg-navy/5 transition-colors relative z-10"
                >
                  <Info size={14} /> View Origin Details
                </button>
              )}

              {col.photo_key && (
                <div className="relative z-10">
                  <PhotoProof photoKey={col.photo_key} />
                </div>
              )}

              {col.rejection_note && (
                <div className="p-3 rounded-xl bg-red-50/50 border border-red-100 flex items-start gap-2 relative z-10">
                  <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-[10px] font-medium text-red-700 leading-relaxed">{col.rejection_note}</p>
                </div>
              )}

              {/* Verification panel */}
              {col.status === 'pending' && col.assigned_verifier_id === user?.id && (
                <div className="relative z-10 border-t border-amber-100 pt-3 space-y-2">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-amber-500">Awaiting your review</p>
                  {rejectingId === col.id ? (
                    <div className="space-y-2">
                      <textarea
                        rows={2}
                        placeholder="Reason for rejection..."
                        value={rejectNote}
                        onChange={e => setRejectNote(e.target.value)}
                        className="w-full p-3 text-xs font-medium text-navy bg-navy/2 rounded-xl border border-navy/10 outline-none resize-none focus:ring-2 ring-red-200"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRejectingId(null); setRejectNote(''); }}
                          className="flex-1 py-2.5 text-xs font-bold text-navy/40 hover:text-navy transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          disabled={!rejectNote.trim() || isVerifying}
                          onClick={() => handleReject(col.id)}
                          className="flex-1 py-2.5 bg-red-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {isVerifying && verifyingId === col.id ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                          Confirm Reject
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        disabled={isVerifying}
                        onClick={() => handleApprove(col.id)}
                        className="flex-1 py-2.5 bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        {isVerifying && verifyingId === col.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                        Approve
                      </button>
                      <button
                        disabled={isVerifying}
                        onClick={() => setRejectingId(col.id)}
                        className="flex-1 py-2.5 bg-red-50 text-red-500 text-xs font-bold rounded-xl border border-red-200 flex items-center justify-center gap-1 disabled:opacity-50"
                      >
                        <XCircle size={14} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {inspectingId && <SourceInspector transferId={inspectingId} onClose={() => setInspectingId(null)} />}
      </AnimatePresence>
    </motion.div>
  );
};

export default MoneyHistoryPage;
