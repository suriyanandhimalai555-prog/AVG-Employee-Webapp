// BranchFormModal — create or edit a branch (name + shift times).
// Pass branch=null to create; pass a branch object to edit (pre-fills the form).
// Props:
//   isOpen  — boolean
//   branch  — branch row or null (null = create mode)
//   onClose — () => void
import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { GlassModal } from '../GlassModal';
import {
  useCreateBranchMutation,
  useUpdateBranchMutation,
} from '../../store/api/apiSlice';

export const BranchFormModal = ({ isOpen, branch, onClose }) => {
  const isEdit = branch != null;

  const [createBranch, { isLoading: creating }] = useCreateBranchMutation();
  const [updateBranch, { isLoading: updating }] = useUpdateBranchMutation();
  const isSaving = creating || updating;

  const [form, setForm] = useState({ name: '', shiftStart: '09:00', shiftEnd: '18:00' });

  // Sync form whenever the modal opens or the branch changes.
  useEffect(() => {
    if (isOpen) {
      setForm({
        name:       branch?.name ?? '',
        // Postgres returns HH:MM:SS — slice to HH:MM so <input type="time"> is happy
        shiftStart: (branch?.shift_start ?? '09:00').slice(0, 5),
        shiftEnd:   (branch?.shift_end   ?? '18:00').slice(0, 5),
      });
    }
  }, [isOpen, branch]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async () => {
    try {
      if (isEdit) {
        await updateBranch({
          id:         branch.id,
          name:       form.name,
          shiftStart: form.shiftStart,
          shiftEnd:   form.shiftEnd,
        }).unwrap();
      } else {
        await createBranch({
          name:       form.name,
          shiftStart: form.shiftStart,
          shiftEnd:   form.shiftEnd,
        }).unwrap();
      }
      onClose();
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Action failed');
    }
  };

  const canSubmit = form.name.trim().length >= 2 && !isSaving;

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Edit Branch' : 'New Branch'}
    >
      <div className="space-y-5">
        {/* Branch name */}
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
            Branch Name
          </label>
          <input
            type="text"
            value={form.name}
            onChange={set('name')}
            placeholder="e.g. Chennai North"
            className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
          />
        </div>

        {/* Shift times */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
              Shift Start
            </label>
            <input
              type="time"
              value={form.shiftStart}
              onChange={set('shiftStart')}
              className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
              Shift End
            </label>
            <input
              type="time"
              value={form.shiftEnd}
              onChange={set('shiftEnd')}
              className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50 flex items-center justify-center"
          >
            {isSaving
              ? <Loader2 className="animate-spin" size={20} />
              : isEdit ? 'Save Changes' : 'Create Branch'
            }
          </button>
        </div>
      </div>
    </GlassModal>
  );
};
