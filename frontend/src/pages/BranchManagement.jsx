import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2, Plus, Pencil, Trash2, Clock,
  ChevronLeft, Loader2, ShieldCheck, RotateCcw,
} from 'lucide-react';
import { GlassModal } from '../components/GlassModal';
import {
  useGetAllBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
} from '../store/api/apiSlice';

export const BranchManagement = () => {
  const navigate = useNavigate();
  // Use getAllBranches so inactive (soft-deleted) branches are visible and can be restored
  const { data: branches = [], isLoading } = useGetAllBranchesQuery();
  const [createBranch, { isLoading: createLoading }] = useCreateBranchMutation();
  const [updateBranch, { isLoading: updateLoading }] = useUpdateBranchMutation();
  const [deleteBranch] = useDeleteBranchMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [form, setForm] = useState({ name: '', shiftStart: '09:00', shiftEnd: '18:00' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reactivatingId, setReactivatingId] = useState(null);

  const actionLoading = createLoading || updateLoading;

  const activeBranches   = branches.filter(b => b.is_active);
  const inactiveBranches = branches.filter(b => !b.is_active);

  const openCreate = () => {
    setEditingBranch(null);
    setForm({ name: '', shiftStart: '09:00', shiftEnd: '18:00' });
    setModalOpen(true);
  };

  const openEdit = (branch) => {
    setEditingBranch(branch);
    setForm({
      name: branch.name,
      // Postgres returns HH:MM:SS — slice to HH:MM so the time input and Zod schema are happy
      shiftStart: (branch.shift_start || '09:00').slice(0, 5),
      shiftEnd: (branch.shift_end || '18:00').slice(0, 5),
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      if (editingBranch) {
        await updateBranch({ id: editingBranch.id, name: form.name, shiftStart: form.shiftStart, shiftEnd: form.shiftEnd }).unwrap();
      } else {
        await createBranch({ name: form.name, shiftStart: form.shiftStart, shiftEnd: form.shiftEnd }).unwrap();
      }
      setModalOpen(false);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Action failed');
    }
  };

  const handleDelete = async (id) => {
    try {
      setDeletingId(id);
      await deleteBranch(id).unwrap();
      setConfirmDeleteId(null);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const handleReactivate = async (branch) => {
    try {
      setReactivatingId(branch.id);
      await updateBranch({ id: branch.id, isActive: true }).unwrap();
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Reactivation failed');
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <div className="p-4 md:p-8 pb-32">
      {/* Header */}
      <header className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate(-1)}
          className="p-3 rounded-2xl bg-white card-shadow border border-border text-navy/40 hover:text-navy tactile-press"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-xl bg-white card-shadow border border-border text-indigo">
            <ShieldCheck size={24} />
          </div>
          <div>
            <p className="text-[9px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono">MD Console</p>
            <h1 className="text-2xl font-bold text-navy tracking-tight">Branch Management</h1>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="ml-auto flex items-center gap-2 px-5 py-3 gradient-primary text-white rounded-2xl text-xs font-bold tactile-press shadow-lg shadow-indigo/20"
        >
          <Plus size={15} /> New Branch
        </button>
      </header>

      {/* Count strip */}
      {!isLoading && branches.length > 0 && (
        <div className="flex items-center gap-3 mb-6 text-[10px] font-bold text-navy/40 uppercase tracking-widest">
          <span className="text-emerald-600">{activeBranches.length} active</span>
          {inactiveBranches.length > 0 && (
            <>
              <span className="text-navy/20">·</span>
              <span className="text-red-400">{inactiveBranches.length} inactive</span>
            </>
          )}
        </div>
      )}

      {/* Branch Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-indigo" size={32} />
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <Building2 size={40} className="text-navy/10" />
          <p className="text-xs font-bold text-navy/20 uppercase tracking-widest">No branches yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className={`p-6 bg-white rounded-2xl card-shadow border relative group transition-opacity ${
                branch.is_active ? 'border-border' : 'border-red-100 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${branch.is_active ? 'bg-indigo/5 text-indigo' : 'bg-red-50 text-red-400'}`}>
                  <Building2 size={18} />
                </div>
                <div className="flex items-center gap-1">
                  {branch.is_active ? (
                    <>
                      <button
                        onClick={() => openEdit(branch)}
                        className="p-2 rounded-xl text-navy/30 hover:text-indigo hover:bg-indigo/5 transition-all"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(branch.id)}
                        className="p-2 rounded-xl text-navy/30 hover:text-red-500 hover:bg-red-50 transition-all"
                        title="Deactivate"
                      >
                        <Trash2 size={15} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleReactivate(branch)}
                      disabled={reactivatingId === branch.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-all disabled:opacity-50"
                      title="Reactivate"
                    >
                      {reactivatingId === branch.id
                        ? <Loader2 size={12} className="animate-spin" />
                        : <RotateCcw size={12} />}
                      Reactivate
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 mb-1.5">
                <p className="font-bold text-navy text-base tracking-tight">{branch.name}</p>
                {!branch.is_active && (
                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-50 px-1.5 py-0.5 rounded-md">
                    Inactive
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={11} className="text-navy/20" />
                <p className="text-[10px] font-bold text-navy/30 font-mono">{branch.shift_start} – {branch.shift_end}</p>
              </div>
              {branch.gm_name && (
                <p className="text-[10px] font-bold text-navy/30 truncate">GM: {branch.gm_name}</p>
              )}
              {branch.admin_name && (
                <p className="text-[10px] font-bold text-navy/20 truncate">Admin: {branch.admin_name}</p>
              )}

              {/* Inline confirm-delete overlay */}
              {confirmDeleteId === branch.id && (
                <div className="absolute inset-0 bg-white/96 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 p-5">
                  <p className="text-xs font-bold text-navy text-center">Deactivate "{branch.name}"?</p>
                  <p className="text-[10px] text-navy/40 text-center leading-relaxed">
                    Employees stay. History is preserved.
                  </p>
                  <div className="flex gap-2 w-full">
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="flex-1 py-2.5 text-xs font-bold text-navy/40 hover:text-navy bg-navy/5 rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={deletingId === branch.id}
                      onClick={() => handleDelete(branch.id)}
                      className="flex-1 py-2.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
                    >
                      {deletingId === branch.id
                        ? <Loader2 size={14} className="animate-spin" />
                        : 'Deactivate'
                      }
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      <GlassModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingBranch ? 'Edit Branch' : 'New Branch'}
      >
        <div className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Branch Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Chennai North"
              className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Shift Start</label>
              <input
                type="time"
                value={form.shiftStart}
                onChange={(e) => setForm(f => ({ ...f, shiftStart: e.target.value }))}
                className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Shift End</label>
              <input
                type="time"
                value={form.shiftEnd}
                onChange={(e) => setForm(f => ({ ...f, shiftEnd: e.target.value }))}
                className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-border focus:ring-4 ring-indigo/5 focus:border-indigo/10"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={actionLoading || form.name.trim().length < 2}
              onClick={handleSubmit}
              className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50 flex items-center justify-center"
            >
              {actionLoading
                ? <Loader2 className="animate-spin" size={20} />
                : editingBranch ? 'Save Changes' : 'Create Branch'
              }
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
};
