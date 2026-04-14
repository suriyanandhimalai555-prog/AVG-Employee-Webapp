import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, XCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { PageHeader } from '../components/attendance/PageHeader';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetMoneyProjectsQuery,
  useGetBranchesQuery,
  useMdAddCollectionEntryMutation,
} from '../store/api/apiSlice';

const newUuid = () =>
  crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const MdAddEntryPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: projects = [] } = useGetMoneyProjectsQuery();
  const { data: allBranches = [] } = useGetBranchesQuery();
  const [mdAddEntry, { isLoading: isMdEntrySubmitting }] = useMdAddCollectionEntryMutation();

  const [mdEntryForm, setMdEntryForm] = useState({
    branchId: '',
    projectId: '',
    date: new Date().toISOString().slice(0, 10),
    mode: 'gpay',
    amount: '',
    notes: '',
    idempotencyKey: newUuid(),
  });
  const [mdEntryError, setMdEntryError] = useState(null);
  const [mdEntrySuccess, setMdEntrySuccess] = useState(null);

  const handleMdEntrySubmit = async (e) => {
    e.preventDefault();
    setMdEntryError(null);
    setMdEntrySuccess(null);

    if (!mdEntryForm.branchId || !mdEntryForm.projectId || !mdEntryForm.amount || !mdEntryForm.date) {
      return setMdEntryError('Please fill in all required fields.');
    }
    const amt = parseFloat(mdEntryForm.amount);
    if (isNaN(amt) || amt <= 0) {
      return setMdEntryError('Amount must be a positive number.');
    }

    try {
      await mdAddEntry({
        branchId:       mdEntryForm.branchId,
        projectId:      mdEntryForm.projectId,
        date:           mdEntryForm.date,
        mode:           mdEntryForm.mode,
        amount:         amt,
        notes:          mdEntryForm.notes || undefined,
        // Each form instance gets one UUID; retries with the same key are idempotent
        idempotencyKey: mdEntryForm.idempotencyKey,
      }).unwrap();

      setMdEntrySuccess('Collection entry added successfully!');
      // Reset with a fresh idempotency key so the next submission is independent
      setMdEntryForm({
        branchId: '', projectId: '',
        date: new Date().toISOString().slice(0, 10),
        mode: 'gpay', amount: '', notes: '',
        idempotencyKey: newUuid(),
      });
      setTimeout(() => { navigate('/money'); }, 2000);
    } catch (err) {
      setMdEntryError(err?.data?.error?.message || 'Submission failed.');
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#f7f8fc]">
      <PageHeader user={user} title="Add Collection Entry" />
      <motion.div
        key="md_entry"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex-1 pt-4 pb-28"
      >
        {/* Back + title */}
        <div className="px-4 mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate('/money')}
            className="p-3 bg-white rounded-full shadow-sm text-navy hover:bg-navy/5 tactile-press shrink-0"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h2 className="text-2xl font-bold text-navy tracking-tight">Add Entry</h2>
            <p className="text-[11px] font-medium text-navy/40">Direct collection — auto approved</p>
          </div>
        </div>

        {/* Feedback banner */}
        {(mdEntryError || mdEntrySuccess) && (
          <div className={`mx-4 mb-5 p-4 rounded-2xl border flex items-center gap-3 ${mdEntryError ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
            {mdEntryError
              ? <XCircle size={16} className="text-red-500 shrink-0" />
              : <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />}
            <p className={`text-xs font-bold ${mdEntryError ? 'text-red-700' : 'text-emerald-700'}`}>
              {mdEntryError || mdEntrySuccess}
            </p>
          </div>
        )}

        <form onSubmit={handleMdEntrySubmit} className="px-4 space-y-4">
          {/* Branch */}
          <div className="bg-white rounded-[24px] p-5 card-shadow border border-navy/5 space-y-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Branch *</p>
            <select
              className="w-full p-3 bg-navy/3 rounded-2xl text-sm font-bold text-navy outline-none appearance-none border border-transparent focus:border-indigo/20 transition-all"
              value={mdEntryForm.branchId}
              onChange={e => setMdEntryForm(p => ({ ...p, branchId: e.target.value }))}
              required
            >
              <option value="">Select branch...</option>
              {allBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          {/* Project */}
          <div className="bg-white rounded-[24px] p-5 card-shadow border border-navy/5 space-y-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Project *</p>
            <select
              className="w-full p-3 bg-navy/3 rounded-2xl text-sm font-bold text-navy outline-none appearance-none border border-transparent focus:border-indigo/20 transition-all"
              value={mdEntryForm.projectId}
              onChange={e => setMdEntryForm(p => ({ ...p, projectId: e.target.value }))}
              required
            >
              <option value="">Select project...</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Date + Payment Type */}
          <div className="bg-white rounded-[24px] p-5 card-shadow border border-navy/5 space-y-4">
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Date *</p>
              <input
                type="date"
                className="w-full p-3 bg-navy/3 rounded-2xl text-sm font-bold text-navy outline-none border border-transparent focus:border-indigo/20 transition-all"
                value={mdEntryForm.date}
                onChange={e => setMdEntryForm(p => ({ ...p, date: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Payment Type *</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'gpay',         label: 'GPay', cls: 'bg-indigo/5 text-indigo' },
                  { value: 'bank_receipt', label: 'Bank', cls: 'bg-emerald-50 text-emerald-600' },
                  { value: 'cash',         label: 'Cash', cls: 'bg-amber-50 text-amber-600' },
                ].map(({ value, label, cls }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMdEntryForm(p => ({ ...p, mode: value }))}
                    className={`py-3 rounded-2xl text-xs font-bold transition-all ${mdEntryForm.mode === value ? cls + ' ring-2 ring-offset-1 ring-current' : 'bg-navy/5 text-navy/30'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div className="bg-white rounded-[24px] p-5 card-shadow border border-navy/5 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Amount (₹) *</p>
            <input
              type="number"
              min="0.01"
              step="0.01"
              className="w-full p-3 bg-navy/3 rounded-2xl text-xl font-black text-navy outline-none border border-transparent focus:border-indigo/20 transition-all"
              placeholder="0.00"
              value={mdEntryForm.amount}
              onChange={e => setMdEntryForm(p => ({ ...p, amount: e.target.value }))}
              required
            />
          </div>

          {/* Notes */}
          <div className="bg-white rounded-[24px] p-5 card-shadow border border-navy/5 space-y-2">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-navy/30 font-mono">Notes (optional)</p>
            <textarea
              className="w-full p-3 bg-navy/3 rounded-2xl text-sm text-navy outline-none border border-transparent focus:border-indigo/20 transition-all resize-none"
              placeholder="Add context or remarks..."
              rows={3}
              value={mdEntryForm.notes}
              onChange={e => setMdEntryForm(p => ({ ...p, notes: e.target.value }))}
            />
          </div>

          <button
            type="submit"
            disabled={isMdEntrySubmitting}
            className="w-full bg-gradient-to-br from-indigo to-indigo/80 text-white py-4 rounded-[24px] text-sm font-bold card-shadow tactile-press disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isMdEntrySubmitting ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {isMdEntrySubmitting ? 'Submitting...' : 'Add Collection Entry'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};
