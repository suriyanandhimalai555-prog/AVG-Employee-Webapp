import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Layers, Plus, Pencil, Power,
  ChevronLeft, Loader2, ShieldCheck, AlertCircle, CheckCircle2, XCircle
} from 'lucide-react';
import { GlassModal } from '../components/GlassModal';
import {
  useGetMoneyProjectsQuery,
  useCreateMoneyProjectMutation,
  useUpdateMoneyProjectMutation,
} from '../store/api/apiSlice';
import { motion, AnimatePresence } from 'framer-motion';

export const ProjectManagementPage = () => {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useGetMoneyProjectsQuery({ includeInactive: 'true' });
  const [createProject, { isLoading: createLoading }] = useCreateMoneyProjectMutation();
  const [updateProject, { isLoading: updateLoading }] = useUpdateMoneyProjectMutation();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [form, setForm] = useState({ name: '' });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const actionLoading = createLoading || updateLoading;

  const openCreate = () => {
    setEditingProject(null);
    setForm({ name: '' });
    setError(null);
    setModalOpen(true);
  };

  const openEdit = (project) => {
    setEditingProject(project);
    setForm({ name: project.name });
    setError(null);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      if (editingProject) {
        await updateProject({ id: editingProject.id, name: form.name }).unwrap();
        setSuccess('Project updated successfully');
      } else {
        await createProject({ name: form.name }).unwrap();
        setSuccess('Project created successfully');
      }
      setModalOpen(false);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err?.data?.error?.message || err?.message || 'Action failed');
    }
  };

  const handleToggleStatus = async (project) => {
    try {
      await updateProject({ id: project.id, isActive: !project.is_active }).unwrap();
      setSuccess(`Project ${!project.is_active ? 'activated' : 'deactivated'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Status update failed');
    }
  };

  return (
    <div className="p-4 md:p-8 pb-32">
      {/* Header */}
      <header className="flex items-center gap-4 mb-10">
        <button
          onClick={() => navigate('/money')}
          className="p-3 rounded-2xl bg-white card-shadow border border-navy/5 text-navy/40 hover:text-navy tactile-press"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="flex items-center gap-4">
          <div className="p-3.5 rounded-[20px] bg-white card-shadow border border-navy/5 text-indigo">
            <Layers size={24} />
          </div>
          <div>
            <p className="text-[9px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono">MD Console</p>
            <h1 className="text-2xl font-bold text-navy tracking-tight">Project Management</h1>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="ml-auto flex items-center gap-2 px-5 py-3 gradient-primary text-white rounded-2xl text-xs font-bold tactile-press shadow-lg shadow-indigo/20"
        >
          <Plus size={15} /> New Project
        </button>
      </header>

      {/* Success Notification */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-700 text-sm font-bold shadow-sm"
          >
            <CheckCircle2 size={18} />
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-indigo" size={32} />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <div className="p-6 rounded-full bg-navy/5 mb-2">
            <Layers size={40} className="text-navy/10" />
          </div>
          <p className="text-sm font-bold text-navy/40 uppercase tracking-widest">No Projects Found</p>
          <p className="text-xs text-navy/20 max-w-[200px]">Create your first project to start tracking collections</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {projects.map((project) => (
            <div
              key={project.id}
              className={`p-6 bg-white rounded-[28px] card-shadow border relative group transition-all duration-300 ${
                project.is_active ? 'border-navy/5' : 'border-red-100 opacity-75'
              }`}
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${project.is_active ? 'bg-indigo/5 text-indigo' : 'bg-red-50 text-red-400'}`}>
                  <Layers size={18} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openEdit(project)}
                    className="p-2 rounded-xl text-navy/30 hover:text-indigo hover:bg-indigo/5 transition-all"
                    title="Edit Name"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleToggleStatus(project)}
                    className={`p-2 rounded-xl transition-all ${
                      project.is_active 
                        ? 'text-navy/30 hover:text-red-500 hover:bg-red-50' 
                        : 'text-red-400 hover:text-emerald-500 hover:bg-emerald-50'
                    }`}
                    title={project.is_active ? 'Deactivate' : 'Activate'}
                  >
                    <Power size={15} />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-navy text-lg tracking-tight truncate">{project.name}</p>
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${project.is_active ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <p className={`text-[10px] font-bold uppercase tracking-widest ${project.is_active ? 'text-emerald-600' : 'text-red-500'}`}>
                    {project.is_active ? 'Active' : 'Inactive'}
                  </p>
                </div>
              </div>

              {/* Inactive Overlay (subtle) */}
              {!project.is_active && (
                <div className="mt-4 pt-4 border-t border-red-50">
                  <p className="text-[10px] text-red-400 font-medium italic">Hidden from new collection forms</p>
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
        title={editingProject ? 'Edit Project' : 'New Project'}
      >
        <div className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Project Name</label>
            <div className="relative">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Adyar Housing Block"
                className="w-full p-4 bg-surface-container-low rounded-2xl text-navy font-bold outline-none border border-navy/5 focus:ring-4 ring-indigo/5 focus:border-indigo/10"
              />
              <Layers className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/10" size={20} />
            </div>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-center gap-2 text-red-600 text-[11px] font-bold"
              >
                <AlertCircle size={14} />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => setModalOpen(false)}
              className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              disabled={actionLoading || form.name.trim().length < 2}
              onClick={handleSubmit}
              className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              {actionLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <>
                  {editingProject ? 'Save Changes' : 'Create Project'}
                </>
              )}
            </button>
          </div>
        </div>
      </GlassModal>
    </div>
  );
};
