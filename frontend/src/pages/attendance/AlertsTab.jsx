import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Bell, Check, X, AlertCircle, Loader2, Info, ArrowUpRight, ChevronRight } from 'lucide-react';
import { PageHeader } from '../../components/attendance/PageHeader';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { 
  useGetMoneyCollectionsQuery,
  useVerifyMoneyCollectionMutation,
  useGetMoneyPhotoUrlQuery,
  useGetMoneySourcesQuery
} from '../../store/api/apiSlice';
import { Avatar } from '../../components/Avatar';
import { SourceInspector } from '../../components/money/SourceInspector';

const MODE_LABELS = {
  gpay: 'Google Pay',
  bank_receipt: 'Bank Receipt',
  cash: 'Cash',
  cash_transfer: 'Manager Transfer'
};

const PhotoViewer = ({ photoKey }) => {
  const { data: photoUrl, isLoading } = useGetMoneyPhotoUrlQuery(photoKey, { skip: !photoKey });
  
  if (!photoKey) return null;
  if (isLoading) return <div className="w-full aspect-video bg-navy/5 animate-pulse rounded-2xl" />;
  
  return (
    <div className="w-full aspect-video bg-navy/5 rounded-2xl overflow-hidden mt-3 border border-navy/10">
      <img src={photoUrl} alt="Receipt" className="w-full h-full object-contain" />
    </div>
  );
};

export const AlertsTab = () => {
  const user = useSelector(selectCurrentUser);
  const { data: collectionsResult, isLoading } = useGetMoneyCollectionsQuery({ status: 'pending' });
  const [verifyCollection, { isLoading: isVerifying }] = useVerifyMoneyCollectionMutation();
  
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectionNote, setRejectionNote] = useState('');
  const [inspectingId, setInspectingId] = useState(null);

  // Filter so we ONLY see alerts where the current user is the specific VERIFIER requested
  const pendingAlerts = (collectionsResult?.data || []).filter(c => c.assigned_verifier_id === user?.id);

  const handleVerify = async (id, status) => {
    if (status === 'rejected' && !rejectionNote.trim()) return alert('Rejection note is required.');
    try {
      await verifyCollection({ id, status, rejectionNote: status === 'rejected' ? rejectionNote.trim() : undefined }).unwrap();
      if (status === 'rejected') {
        setRejectingId(null);
        setRejectionNote('');
      }
    } catch (err) {
      alert(err.data?.error?.message || 'Action failed.');
    }
  };

  return (
    <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-32">
      <PageHeader user={user} title="Action Center" />
      
      <div className="px-6 mb-6">
        <h2 className="text-3xl font-bold text-navy tracking-tight">Alerts</h2>
        <p className="text-xs font-medium text-navy/40 mt-1">Pending verification requests</p>
      </div>

      <div className="px-6 space-y-4">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
        ) : pendingAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-3xl card-shadow border border-navy/5">
            <div className="w-20 h-20 rounded-[24px] bg-navy/5 flex items-center justify-center text-navy/20 mb-6">
              <Bell size={36} />
            </div>
            <h2 className="text-xl font-bold text-navy tracking-tight mb-2">No Alerts</h2>
            <p className="text-sm font-medium text-navy/40 text-center">You have no pending verification requests at this time.</p>
          </div>
        ) : (
          pendingAlerts.map(alert => (
            <div key={alert.id} className="bg-white p-5 rounded-3xl card-shadow border border-navy/5 space-y-4">
               <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-navy/5">
                      <Avatar url={alert.submitter_photo_key} name={alert.submitter_name} size={40} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-navy">{alert.submitter_name}</p>
                      <p className="text-[10px] font-bold tracking-wider uppercase text-navy/40 mt-0.5">{alert.client_name}</p>
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full border text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-amber-50 border-amber-200`}>
                    PENDING
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4 bg-navy/2 rounded-2xl p-4">
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Amount</p>
                    <p className="text-lg font-bold text-navy mt-0.5">₹{parseFloat(alert.amount).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Mode</p>
                    <p className="text-sm font-bold text-navy mt-0.5">{MODE_LABELS[alert.mode]}</p>
                  </div>
               </div>

               {alert.mode === 'cash_transfer' && (
                 <button 
                   onClick={() => setInspectingId(alert.id)}
                   className="w-full p-4 rounded-2xl bg-indigo/5 border border-indigo/10 flex items-center justify-between text-indigo hover:bg-indigo/10 transition-colors group"
                 >
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 rounded-xl bg-white flex items-center justify-center shadow-sm">
                       <Info size={16} />
                     </div>
                     <p className="text-xs font-bold">Inspect Sources ({alert.source_collection_ids?.length || 0})</p>
                   </div>
                   <ChevronRight size={18} className="text-indigo/40 group-hover:translate-x-1 transition-transform" />
                 </button>
               )}

               {alert.photo_key && <PhotoViewer photoKey={alert.photo_key} />}

               <AnimatePresence>
                 {rejectingId === alert.id ? (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
                     <textarea
                       autoFocus
                       placeholder="Reason for rejection..."
                       className="w-full bg-red-50/50 border border-red-100 rounded-2xl p-4 text-xs font-medium text-red-900 placeholder:text-red-300 outline-none resize-none"
                       value={rejectionNote}
                       onChange={e => setRejectionNote(e.target.value)}
                     />
                     <div className="flex gap-2">
                       <button disabled={isVerifying} onClick={() => {setRejectingId(null); setRejectionNote('');}} className="flex-1 py-3 rounded-xl bg-navy/5 text-navy font-bold text-xs tactile-press">Cancel</button>
                       <button disabled={isVerifying || !rejectionNote.trim()} onClick={() => handleVerify(alert.id, 'rejected')} className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-xs tactile-press shadow-lg shadow-red-500/20 disabled:opacity-50 flex justify-center items-center">
                         {isVerifying ? <Loader2 size={16} className="animate-spin" /> : 'Confirm Reject'}
                       </button>
                     </div>
                   </motion.div>
                 ) : (
                   <div className="flex gap-2">
                     <button disabled={isVerifying} onClick={() => setRejectingId(alert.id)} className="flex-[0.3] py-3 rounded-xl bg-red-50 border border-red-100 text-red-600 flex items-center justify-center tactile-press disabled:opacity-50">
                       <X size={18} />
                     </button>
                     <button disabled={isVerifying} onClick={() => handleVerify(alert.id, 'approved')} className="flex-1 py-3 rounded-xl bg-emerald-500 text-white font-bold text-sm flex items-center justify-center gap-2 tactile-press shadow-lg shadow-emerald-500/20 disabled:opacity-50">
                       <Check size={18} /> Approve Receipt
                     </button>
                   </div>
                 )}
               </AnimatePresence>
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
