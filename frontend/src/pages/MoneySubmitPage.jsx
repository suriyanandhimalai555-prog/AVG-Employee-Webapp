import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, XCircle, CheckCircle2, DollarSign, Image as ImageIcon,
  ChevronRight, Loader2, Send
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyProjectsQuery,
  useGetUserSuperiorsQuery,
  useSubmitMoneyCollectionMutation,
  useGetMoneyUploadUrlMutation,
} from '../store/api/apiSlice';

export const MoneySubmitPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: projects = [] } = useGetMoneyProjectsQuery();
  const { data: superiors = [] } = useGetUserSuperiorsQuery(undefined, { skip: user?.role === 'md' });
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
  const [formError, setFormError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const fileInputRef = useRef(null);

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
        if (!uploadResponse.ok) throw new Error('Photo upload failed. Please try again.');
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
        setFormState({ projectId: '', amount: '', mode: 'cash', clientName: '', clientPhone: '', handedOverTo: '' });
        setFieldPhoto(null);
        setSuccessMsg(null);
        navigate('/money');
      }, 2000);
    } catch (err) {
      setFormError(err.data?.error?.message || err.message || 'Submission failed.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="px-6 space-y-6 pb-32 pt-4"
    >
      <div className="flex items-center -ml-2 mb-2">
        <button onClick={() => navigate('/money')} className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press">
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <h3 className="text-lg font-bold text-navy ml-4">Submit Entry</h3>
      </div>

      <AnimatePresence>
        {(formError || successMsg) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={`p-4 rounded-2xl border flex items-center gap-3 ${formError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}
          >
            {formError ? <XCircle size={18} className="text-red-500"/> : <CheckCircle2 size={18} className="text-emerald-500" />}
            <p className={`text-xs font-bold ${formError ? 'text-red-700' : 'text-emerald-700'}`}>{formError || successMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmitCollection} className="space-y-6">
        <div className="space-y-4">
          <div className="p-1 bg-navy/5 rounded-2xl grid grid-cols-3 gap-1">
            {['gpay', 'bank_receipt', 'cash'].map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setFormState({...formState, mode: m})}
                className={`py-3 px-1 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${formState.mode === m ? 'bg-white shadow-sm text-indigo' : 'text-navy/40 hover:text-navy/60'}`}
              >
                {m.replace('_', ' ')}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div className="bg-white rounded-3xl p-5 border shadow-sm flex items-center">
            <DollarSign size={24} className="text-navy/20 mr-3" />
            <input
              type="number"
              min="1"
              required
              placeholder="Amount collected"
              className="w-full text-2xl font-bold bg-transparent text-navy outline-none placeholder:text-navy/20 font-mono"
              value={formState.amount}
              onChange={e => setFormState({...formState, amount: e.target.value})}
            />
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
            <select
              required
              className="w-full text-sm font-bold bg-transparent outline-none text-navy appearance-none"
              value={formState.projectId}
              onChange={e => setFormState({...formState, projectId: e.target.value})}
            >
              <option value="" disabled>Select Project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <div className="absolute right-4 top-1/2 mt-1 pointer-events-none"><ChevronRight size={16} className="text-navy/20 rotate-90" /></div>
          </div>

          {/* Mode specifics */}
          {formState.mode === 'cash' && (
            <div className="bg-white rounded-[24px] p-4 shadow-sm border relative">
              <p className="text-[9px] uppercase tracking-wider font-bold text-navy/30 mb-1">Handed Over To</p>
              <select
                required
                className="w-full text-sm font-bold bg-transparent outline-none text-navy appearance-none"
                value={formState.handedOverTo}
                onChange={e => setFormState({...formState, handedOverTo: e.target.value})}
              >
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
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="absolute inset-0 bg-navy/40 flex items-center justify-center opacity-100 transition-opacity">
                    <p className="text-white text-[10px] font-bold uppercase tracking-[0.2em] bg-navy/40 px-3 py-1.5 rounded-lg border border-white/20 backdrop-blur-md">Retake Photo</p>
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

        <button
          disabled={isSubmitting || isUploading}
          type="submit"
          className="w-full p-5 rounded-[24px] gradient-primary text-white font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50"
        >
          {isSubmitting || isUploading
            ? <><Loader2 size={20} className="animate-spin"/> Submitting...</>
            : <><Send size={20} /> Submit Collection</>}
        </button>
      </form>
    </motion.div>
  );
};

export default MoneySubmitPage;
