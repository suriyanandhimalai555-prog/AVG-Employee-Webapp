import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { 
  Wallet, Plus, History, XCircle, CheckCircle2, ChevronRight, ArrowRight,
  Upload, Navigation, Send, DollarSign, Image as ImageIcon, MapPin, Loader2, BookOpen, Clock, AlertCircle,
  Briefcase, ArrowUpRight, Check, Info
} from 'lucide-react';
import { PageHeader } from '../components/attendance/PageHeader';
import { selectCurrentUser } from '../store/slices/authSlice';
import { 
  useGetMoneyProjectsQuery,
  useCreateMoneyProjectMutation,
  useSubmitMoneyCollectionMutation,
  useGetMoneyCollectionsQuery,
  useGetUserSuperiorsQuery,
  useGetMoneyUploadUrlMutation,
  useGetMoneyWalletQuery,
  useTransferMoneyMutation,
} from '../store/api/apiSlice';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { SourceInspector } from '../components/money/SourceInspector';

// Status colors
const STATUS_COLORS = {
  pending: 'text-amber-500 bg-amber-50 border-amber-200',
  approved: 'text-emerald-500 bg-emerald-50 border-emerald-200',
  rejected: 'text-red-500 bg-red-50 border-red-200'
};

const MODE_LABELS = {
  gpay: 'Google Pay',
  bank_receipt: 'Bank Receipt',
  cash: 'Cash in Hand'
};

export const MoneyManagementPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [view, setView] = useState('home'); // 'home', 'submit', 'history', 'wallet'
  
  // Create Project State (MD Only)
  const [newProjectName, setNewProjectName] = useState('');
  const [createProject, { isLoading: isCreatingProject }] = useCreateMoneyProjectMutation();

  // Queries
  const { data: projects = [] } = useGetMoneyProjectsQuery();
  const { data: superiors = [] } = useGetUserSuperiorsQuery(undefined, { skip: user?.role === 'md' });
  const { data: collectionsResult, isLoading: isCollectionsLoading } = useGetMoneyCollectionsQuery();
  
  const totals = collectionsResult?.totals || { pending: 0, approved: 0, rejected: 0 };
  const collections = collectionsResult?.data || [];

  // Submit Collection State
  const [submitCollection, { isLoading: isSubmitting }] = useSubmitMoneyCollectionMutation();
  const [getUploadUrl] = useGetMoneyUploadUrlMutation();
  
  const [formState, setFormState] = useState({
    projectId: '',
    amount: '',
    mode: 'cash',
    clientName: '',
    clientPhone: '',
    handedOverTo: ''
  });
  const [fieldPhoto, setFieldPhoto] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [inspectingId, setInspectingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const fileInputRef = useRef(null);

  // Wallet State
  const { data: walletItems = [], isLoading: isWalletLoading } = useGetMoneyWalletQuery(undefined, {
    skip: user?.role === 'md' // MD doesn't have a wallet in this simplified logic as they are the end point
  });
  const [selectedForTransfer, setSelectedForTransfer] = useState([]);
  const [transferTarget, setTransferTarget] = useState('');
  const [transferMoney, { isLoading: isTransferring }] = useTransferMoneyMutation();

  const toggleSelection = (id) => {
    setSelectedForTransfer(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleTransfer = async () => {
    if (!transferTarget || selectedForTransfer.length === 0) return;
    try {
      await transferMoney({
        targetUserId: transferTarget,
        collectionIds: selectedForTransfer
      }).unwrap();
      setSuccessMsg('Cash transferred successfully!');
      setSelectedForTransfer([]);
      setTransferTarget('');
      setTimeout(() => setView('home'), 1500);
    } catch (err) {
      setFormError(err.data?.error?.message || 'Transfer failed');
    }
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 6MB size limit
    const MAX_SIZE = 6 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      setFormError('File size too large. Maximum allowed is 6MB.');
      e.target.value = '';
      return;
    }

    setFormError('');
    const previewUrl = URL.createObjectURL(file);
    setFieldPhoto({ file, previewUrl });
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    try {
      await createProject({ name: newProjectName.trim() }).unwrap();
      setNewProjectName('');
    } catch (err) {
      alert(err.data?.error?.message || 'Failed to create project');
    }
  };

  const handleSubmitCollection = async (e) => {
    e.preventDefault();
    setFormError(null);
    setSuccessMsg(null);
    
    if (!formState.projectId || !formState.amount || !formState.clientName || !formState.clientPhone) {
      return setFormError('Please fill in all standard fields.');
    }

    if (formState.mode === 'cash' && !formState.handedOverTo) {
      return setFormError('You must select who you handed the cash to.');
    }

    if (formState.mode !== 'cash' && !fieldPhoto) {
      return setFormError('A photo receipt is required for GPay / Bank uploads.');
    }

    try {
      let photoKey = undefined;

      if (formState.mode !== 'cash' && fieldPhoto) {
        setIsUploading(true);
        const fileType = fieldPhoto.file.type || 'image/jpeg';
        const { uploadUrl, photoKey: uploadedKey } = await getUploadUrl({ mode: formState.mode, contentType: fileType }).unwrap();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: fieldPhoto.file,
          headers: { 'Content-Type': fileType },
        });
        if (!uploadResponse.ok) {
          throw new Error('Photo upload failed. Please try again.');
        }
        photoKey = uploadedKey;
      }

      await submitCollection({
        projectId: formState.projectId,
        amount: parseFloat(formState.amount),
        mode: formState.mode,
        clientName: formState.clientName,
        clientPhone: formState.clientPhone,
        handedOverTo: formState.mode === 'cash' ? formState.handedOverTo : undefined,
        photoKey
      }).unwrap();

      setSuccessMsg('Collection submitted successfully!');
      setTimeout(() => {
        setView('home');
        setFormState({ projectId: '', amount: '', mode: 'cash', clientName: '', clientPhone: '', handedOverTo: '' });
        setFieldPhoto(null);
        setSuccessMsg(null);
      }, 2000);
    } catch (err) {
      setFormError(err.data?.error?.message || err.message || 'Submission failed.');
    } finally {
      setIsUploading(false);
    }
  };

// ─── MD DASHBOARD VIEW ───
  if (user?.role === 'md') {
    return (
      <div className="flex flex-col">
        <PageHeader user={user} title="Financial Oversight" />
        <motion.div key="md_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-10 pt-4">
          
          <div className="px-6 mb-6">
            <h2 className="text-3xl font-bold text-navy tracking-tight">Finances</h2>
            <p className="text-xs font-medium text-navy/40 mt-1">Global collections overview</p>
          </div>

        {/* Global Totals Grid */}
        <div className="px-6 mb-8 grid grid-cols-3 gap-3">
          <div className="bg-white rounded-3xl p-4 card-shadow flex flex-col items-center">
            <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center mb-2"><CheckCircle2 size={16} /></div>
            <p className="text-lg font-bold text-navy">₹{totals.approved.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Approved</p>
          </div>
          <div className="bg-white rounded-3xl p-4 card-shadow flex flex-col items-center">
             <div className="w-8 h-8 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center mb-2"><Clock size={16} /></div>
            <p className="text-lg font-bold text-navy">₹{totals.pending.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Pending</p>
          </div>
          <div className="bg-white rounded-3xl p-4 card-shadow flex flex-col items-center">
             <div className="w-8 h-8 rounded-full bg-red-50 text-red-500 flex items-center justify-center mb-2"><XCircle size={16} /></div>
            <p className="text-lg font-bold text-navy">₹{totals.rejected.toLocaleString()}</p>
            <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30">Rejected</p>
          </div>
        </div>

        {/* Create Project */}
        <div className="px-6 mb-8">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">Manage Projects</p>
          <form onSubmit={handleAddProject} className="bg-white rounded-[24px] p-2 flex items-center card-shadow relative">
             <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center text-navy/40 ml-1">
               <BookOpen size={18} />
             </div>
             <input
                type="text"
                placeholder="E.g. Phase 2 Expansion, Client Setup"
                className="flex-1 bg-transparent border-none focus:ring-0 text-sm font-medium text-navy placeholder:text-navy/30 px-3 outline-none"
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
             />
             <button disabled={isCreatingProject} className="w-10 h-10 rounded-xl bg-indigo text-white flex items-center justify-center tactile-press disabled:opacity-50 relative mr-1">
               {isCreatingProject ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
             </button>
          </form>
        </div>

        {/* Global Collections List */}
        <div className="px-6 space-y-4">
           <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">Operations Log</p>
           {isCollectionsLoading ? (
              <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
           ) : collections.length === 0 ? (
              <p className="text-center text-sm text-navy/40 py-8 font-medium">No recorded money flows yet.</p>
           ) : (
             <div className="space-y-3">
               {collections.map(col => (
                 <div key={col.id} className="bg-white p-4 rounded-3xl card-shadow border border-navy/5 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                       <div className="flex items-center gap-3">
                         <div className="w-10 h-10 rounded-full overflow-hidden bg-navy/5">
                           <Avatar url={col.submitter_photo_key} name={col.submitter_name} size={40} />
                         </div>
                         <div>
                           <p className="text-xs font-bold text-navy">{col.submitter_name}</p>
                           <p className="text-[10px] font-bold tracking-wider uppercase text-navy/40 mt-0.5">{col.client_name}</p>
                         </div>
                       </div>
                       <div className={`px-2 py-1 rounded-lg border text-[9px] font-bold uppercase tracking-wider ${STATUS_COLORS[col.status]}`}>
                         {col.status}
                       </div>
                    </div>
                    <div className="h-px bg-navy/5 w-full"/>
                    <div className="flex justify-between items-center">
                       <div>
                         <p className="text-sm font-bold text-navy">₹{parseFloat(col.amount).toLocaleString()}</p>
                         <p className="text-[10px] font-medium text-navy/40 mt-0.5">{col.project_name}</p>
                       </div>
                       <div className="text-right">
                         <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40">{col.mode.replace('_', ' ')}</p>
                         {col.verifier_name && <p className="text-[9px] font-medium text-navy/40 mt-0.5">Verifier: {col.verifier_name}</p>}
                       </div>
                    </div>
                    {col.mode === 'cash_transfer' && (
                      <button 
                        onClick={() => setInspectingId(col.id)}
                        className="w-full p-3 rounded-2xl bg-navy/2 border border-navy/5 flex items-center justify-center gap-2 text-[10px] font-bold text-navy/40 hover:bg-navy/5 transition-colors"
                      >
                        <Info size={14} /> Inspect Transfer Sources
                      </button>
                    )}
                 </div>
               ))}
             </div>
           )}
        </div>
        <AnimatePresence>
          {inspectingId && <SourceInspector transferId={inspectingId} onClose={() => setInspectingId(null)} />}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

  // ─── NON-MD WORKFORCE VIEW ───
  return (
    <div className="relative">
      <PageHeader user={user} title="Collections" />
      <motion.div key="worker_money" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1 pb-10 pt-4">

      {view === 'home' && (
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="px-6 mb-8">
             <h2 className="text-3xl font-bold text-navy tracking-tight">Money</h2>
             <p className="text-xs font-medium text-navy/40 mt-1">Submit & track collections</p>
          </div>

          <div className="px-6 grid grid-cols-1 gap-4 mb-8">
            <button onClick={() => setView('submit')} className="bg-gradient-to-br from-indigo to-indigo/80 p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left">
               <div className="absolute -right-6 -bottom-6 w-32 h-32 bg-white/10 rounded-full blur-2xl group-hover:bg-white/20 transition-all duration-500" />
               <div className="relative z-10 w-3/4">
                 <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white mb-4">
                   <Plus size={24} />
                 </div>
                 <p className="text-xl font-bold text-white mb-1">New Entry</p>
                 <p className="text-xs font-medium text-white/70">Record a new payment collection</p>
               </div>
               <div className="relative z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mt-2 group-hover:bg-white/20 transition-colors">
                 <ArrowRight size={20} className="text-white" />
               </div>
            </button>

            <button onClick={() => setView('history')} className="bg-white p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-navy/5">
               <div className="relative z-10 w-3/4">
                 <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy mb-4 group-hover:scale-110 transition-transform">
                   <History size={24} />
                 </div>
                 <p className="text-xl font-bold text-navy mb-1">Transactions</p>
                 <p className="text-xs font-medium text-navy/40">View your collection history</p>
               </div>
               <div className="relative z-10 w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center mt-2 group-hover:bg-navy/10 transition-colors">
                 <ArrowRight size={20} className="text-navy/40" />
               </div>
            </button>

            {user?.role !== 'md' && (
              <button onClick={() => setView('wallet')} className="bg-white p-6 rounded-[32px] card-shadow flex items-start justify-between relative overflow-hidden tactile-press group text-left border border-navy/5">
                 <div className="relative z-10 w-3/4">
                   <div className="w-12 h-12 rounded-2xl bg-indigo/5 flex items-center justify-center text-indigo mb-4 group-hover:scale-110 transition-transform">
                     <Briefcase size={24} />
                   </div>
                   <p className="text-xl font-bold text-navy mb-1">My Wallet</p>
                   <p className="text-xs font-medium text-navy/40">₹{walletItems.reduce((sum, item) => sum + parseFloat(item.amount), 0).toLocaleString()} available to transfer</p>
                 </div>
                 <div className="relative z-10 w-10 h-10 rounded-full bg-indigo/5 flex items-center justify-center mt-2 group-hover:bg-indigo/10 transition-colors">
                   <ArrowRight size={20} className="text-indigo/40" />
                 </div>
              </button>
            )}
          </div>
        </motion.div>
      )}

      {view === 'wallet' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
           <div className="px-4 flex items-center justify-between mb-6">
             <div className="flex items-center">
               <button onClick={() => setView('home')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"><ArrowRight className="rotate-180" size={20} /></button>
               <h3 className="text-lg font-bold text-navy ml-4">My Wallet</h3>
             </div>
             
             {selectedForTransfer.length > 0 && (
               <div className="bg-indigo text-white px-4 py-2 rounded-2xl text-xs font-bold shadow-lg flex items-center gap-2">
                 ₹{walletItems.filter(i => selectedForTransfer.includes(i.id)).reduce((s, i) => s + parseFloat(i.amount), 0).toLocaleString()}
               </div>
             )}
           </div>

           {(formError || successMsg) && (
              <div className={`mx-6 mb-6 p-4 rounded-2xl border flex items-center gap-3 ${formError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                {formError ? <XCircle size={18} className="text-red-500"/> : <CheckCircle2 size={18} className="text-emerald-500" />}
                <p className={`text-xs font-bold ${formError ? 'text-red-700' : 'text-emerald-700'}`}>{formError || successMsg}</p>
              </div>
           )}

           <div className="px-6 space-y-4">
             {selectedForTransfer.length > 0 && (
               <div className="bg-white rounded-[32px] p-6 shadow-sm border border-indigo/10 space-y-4 mb-6">
                 <p className="text-[10px] uppercase tracking-widest font-bold text-navy/30">Transfer to Manager</p>
                 <div className="flex flex-col gap-4">
                   <div className="relative">
                     <select 
                       className="w-full p-4 bg-navy/2 rounded-2xl text-sm font-bold text-navy outline-none appearance-none border border-transparent focus:border-indigo/20 transition-all"
                       value={transferTarget}
                       onChange={e => setTransferTarget(e.target.value)}
                     >
                       <option value="">Select receiver...</option>
                       {superiors.map(s => (
                         <option key={s.id} value={s.id}>{s.name} ({s.role.replace('_', ' ')})</option>
                       ))}
                     </select>
                     <ChevronRight size={16} className="absolute right-4 top-1/2 -translate-y-1/2 rotate-90 text-navy/20 pointer-events-none" />
                   </div>
                   <button 
                     onClick={handleTransfer}
                     disabled={!transferTarget || isTransferring}
                     className="w-full bg-indigo text-white p-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-indigo/20 disabled:opacity-50 transition-all"
                   >
                     {isTransferring ? <Loader2 className="animate-spin" size={18} /> : <ArrowUpRight size={18} />}
                     Transfer {selectedForTransfer.length} items
                   </button>
                 </div>
               </div>
             )}

             <p className="text-[10px] uppercase tracking-widest font-bold text-navy/30 mb-2">Approved Funds</p>
             {isWalletLoading ? (
               <div className="flex justify-center p-10"><Loader2 className="animate-spin text-navy/20" size={32} /></div>
             ) : walletItems.length === 0 ? (
               <div className="bg-white/50 border border-dashed border-navy/10 rounded-3xl p-10 text-center">
                 <p className="text-sm font-medium text-navy/30">Your wallet is empty.</p>
               </div>
             ) : (
               <div className="grid grid-cols-1 gap-3">
                 {walletItems.map(item => (
                   <button 
                     key={item.id} 
                     onClick={() => toggleSelection(item.id)}
                     className={`bg-white p-4 rounded-[28px] border transition-all text-left flex items-center justify-between ${selectedForTransfer.includes(item.id) ? 'border-indigo shadow-md shadow-indigo/5 ring-1 ring-indigo/20' : 'border-navy/5 hover:border-navy/10 shadow-sm'}`}
                   >
                     <div className="flex gap-4 items-center">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${selectedForTransfer.includes(item.id) ? 'bg-indigo text-white' : 'bg-navy/5 text-navy/30'}`}>
                          {selectedForTransfer.includes(item.id) ? <Check size={20} /> : <DollarSign size={20} />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-navy">₹{parseFloat(item.amount).toLocaleString()}</p>
                          <p className="text-[10px] font-medium text-navy/40 truncate w-32">
                            {item.mode === 'cash' ? `From ${item.client_name}` : `Transfer from ${item.submitter_name}`}
                          </p>
                        </div>
                     </div>
                     <div className="text-right">
                       <p className="text-[9px] font-bold text-indigo bg-indigo/5 px-2 py-1 rounded-lg uppercase tracking-tighter">
                         {item.project_name}
                       </p>
                     </div>
                   </button>
                 ))}
               </div>
             )}
           </div>
        </motion.div>
      )}

      {view === 'history' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
           <div className="px-4 flex items-center">
             <button onClick={() => setView('home')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"><ArrowRight className="rotate-180" size={20} /></button>
             <h3 className="text-lg font-bold text-navy ml-4">My Collections</h3>
           </div>
           
           <div className="px-6 mt-6 space-y-4">
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
                     {col.rejection_note && (
                       <div className="p-3 rounded-xl bg-red-50/50 border border-red-100 flex items-start gap-2 relative z-10">
                         <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                         <p className="text-[10px] font-medium text-red-700 leading-relaxed">{col.rejection_note}</p>
                       </div>
                     )}
                  </div>
                ))
             )}
           </div>
        </motion.div>
      )}

      {view === 'submit' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="px-6 space-y-6">
           <div className="flex items-center -ml-2 mb-2">
             <button onClick={() => setView('home')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"><ArrowRight className="rotate-180" size={20} /></button>
             <h3 className="text-lg font-bold text-navy ml-4">Submit Entry</h3>
           </div>

           <AnimatePresence>
             {(formError || successMsg) && (
               <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={`p-4 rounded-2xl border flex items-center gap-3 ${formError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                 {formError ? <XCircle size={18} className="text-red-500"/> : <CheckCircle2 size={18} className="text-emerald-500" />}
                 <p className={`text-xs font-bold ${formError ? 'text-red-700' : 'text-emerald-700'}`}>{formError || successMsg}</p>
               </motion.div>
             )}
           </AnimatePresence>

           <form onSubmit={handleSubmitCollection} className="space-y-6">
              
              <div className="space-y-4">
                 <div className="p-1 bg-navy/5 rounded-2xl grid grid-cols-3 gap-1">
                   {['gpay', 'bank_receipt', 'cash'].map(m => (
                     <button key={m} type="button" onClick={() => setFormState({...formState, mode: m})} className={`py-3 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${formState.mode === m ? 'bg-white shadow-sm text-indigo' : 'text-navy/40 hover:text-navy/60'}`}>
                       {m.replace('_', ' ')}
                     </button>
                   ))}
                 </div>

                 {/* Amount */}
                 <div className="bg-white rounded-3xl p-5 border shadow-sm flex items-center">
                    <DollarSign size={24} className="text-navy/20 mr-3" />
                    <input type="number" min="1" required placeholder="Amount collected" className="w-full text-2xl font-bold bg-transparent text-navy outline-none placeholder:text-navy/20 font-mono" value={formState.amount} onChange={e => setFormState({...formState, amount: e.target.value})} />
                 </div>

                 {/* Client Info */}
                 <div className="grid grid-cols-2 gap-3">
                   <div className="bg-white rounded-[24px] p-4 shadow-sm border">
                     <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30 mb-1">Client Name</p>
                     <input type="text" required placeholder="Name" className="w-full text-sm font-bold bg-transparent outline-none text-navy placeholder:text-navy/20" value={formState.clientName} onChange={e => setFormState({...formState, clientName: e.target.value})} />
                   </div>
                   <div className="bg-white rounded-[24px] p-4 shadow-sm border">
                     <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30 mb-1">Client Phone</p>
                     <input type="tel" required placeholder="Phone" className="w-full text-sm font-bold bg-transparent outline-none text-navy placeholder:text-navy/20" value={formState.clientPhone} onChange={e => setFormState({...formState, clientPhone: e.target.value})} />
                   </div>
                 </div>

                 {/* Project */}
                 <div className="bg-white rounded-[24px] p-4 shadow-sm border relative">
                    <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30 mb-1">Assigned Project</p>
                    <select required className="w-full text-sm font-bold bg-transparent outline-none text-navy appearance-none" value={formState.projectId} onChange={e => setFormState({...formState, projectId: e.target.value})}>
                      <option value="" disabled>Select Project</option>
                      {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 mt-1 pointer-events-none"><ChevronRight size={16} className="text-navy/20 rotate-90" /></div>
                 </div>

                 {/* Mode specifics */}
                 {formState.mode === 'cash' && (
                   <div className="bg-white rounded-[24px] p-4 shadow-sm border relative">
                      <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30 mb-1">Handed Over To</p>
                      <select required className="w-full text-sm font-bold bg-transparent outline-none text-navy appearance-none" value={formState.handedOverTo} onChange={e => setFormState({...formState, handedOverTo: e.target.value})}>
                        <option value="" disabled>Select Manager</option>
                        {superiors.map(mgr => <option key={mgr.id} value={mgr.id}>{mgr.name} ({mgr.role.replace('_', ' ')})</option>)}
                      </select>
                      <div className="absolute right-4 top-1/2 mt-1 pointer-events-none"><ChevronRight size={16} className="text-navy/20 rotate-90" /></div>
                   </div>
                 )}

                 {formState.mode !== 'cash' && (
                   <div className="bg-white rounded-3xl p-6 shadow-sm border flex flex-col items-center justify-center">
                      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={handlePhotoCapture} className="hidden" />
                      {fieldPhoto ? (
                        <div className="relative rounded-2xl overflow-hidden w-full aspect-video border border-navy/10 group bg-navy/5">
                           <img src={fieldPhoto.previewUrl} alt="Receipt" className="w-full h-full object-contain" />
                           <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-navy/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <p className="text-white text-xs font-bold uppercase tracking-wider">Retake Photo</p>
                           </button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="w-full py-8 border-2 border-dashed border-indigo/20 rounded-2xl flex flex-col items-center justify-center gap-3 text-indigo hover:bg-indigo/5 transition-colors tactile-press">
                          <ImageIcon size={32} className="opacity-50" />
                          <p className="text-xs font-bold tracking-wide">Upload Receipt/Screenshot</p>
                        </button>
                      )}
                   </div>
                 )}
              </div>

              <button disabled={isSubmitting || isUploading || isCollectionsLoading} type="submit" className="w-full p-5 rounded-[24px] gradient-indigo text-white font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50">
                {isSubmitting || isUploading ? <><Loader2 size={20} className="animate-spin"/> Submitting...</> : <><Send size={20} /> Submit Collection</>}
              </button>
           </form>
         </motion.div>
      )}
      </motion.div>
      <AnimatePresence>
        {inspectingId && <SourceInspector transferId={inspectingId} onClose={() => setInspectingId(null)} />}
      </AnimatePresence>
    </div>
  );
};
