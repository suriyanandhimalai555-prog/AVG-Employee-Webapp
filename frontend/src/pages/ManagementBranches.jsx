// Management Branches page — full CRUD + geofence location for the management role.
// Superset of the MD BranchManagement page: create / rename / edit shifts /
// deactivate branches, AND configure per-branch GPS geofence coordinates.
// Route: /branches (when role === 'management')
import { useState } from 'react';
import { Building2, Plus, Loader2, Settings2 } from 'lucide-react';
import { useGetBranchesQuery } from '../store/api/apiSlice';
import { BranchCard }          from '../components/branches/BranchCard';
import { BranchFormModal }     from '../components/branches/BranchFormModal';
import { BranchLocationModal } from '../components/branches/BranchLocationModal';

export const ManagementBranches = () => {
  const { data: branches = [], isLoading } = useGetBranchesQuery();

  // formModal: null = closed, or a branch object for editing, or {} for creating
  const [formModal,     setFormModal]     = useState(null);
  const [locationModal, setLocationModal] = useState(null); // null or branch object

  const openCreate = () => setFormModal({});   // empty object = create mode
  const openEdit   = (branch) => setFormModal(branch);
  const closeForm  = () => setFormModal(null);

  const openLocation = (branch) => setLocationModal(branch);
  const closeLocation = () => setLocationModal(null);

  // BranchFormModal treats null as "create", anything else as "edit"
  const editingBranch = formModal && Object.keys(formModal).length > 0 ? formModal : null;

  return (
    <div className="p-4 md:p-8 pb-32">

      {/* ── Header ──────────────────────────────────────────── */}
      <header className="flex items-center gap-4 mb-10">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          {/* Icon badge */}
          <div className="p-3.5 rounded-[20px] bg-white card-shadow border border-navy/5 text-indigo flex-shrink-0">
            <Settings2 size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-[9px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono">
              Management Console
            </p>
            <h1 className="text-2xl font-bold text-navy tracking-tight">Branch Management</h1>
            <p className="text-[10px] text-navy/40 mt-0.5 hidden sm:block">
              Create branches · edit details · configure geofence check-in zones
            </p>
          </div>
        </div>

        {/* New Branch button */}
        <button
          type="button"
          onClick={openCreate}
          className="flex items-center gap-2 px-5 py-3 gradient-primary text-white rounded-2xl text-xs font-bold tactile-press shadow-lg shadow-indigo/20 flex-shrink-0"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">New Branch</span>
          <span className="sm:hidden">New</span>
        </button>
      </header>

      {/* ── Summary strip ───────────────────────────────────── */}
      {!isLoading && branches.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
          {/* Total branches */}
          <div className="bg-white rounded-2xl px-5 py-4 card-shadow border border-navy/5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30 mb-1">Branches</p>
            <p className="text-2xl font-bold text-navy">{branches.length}</p>
          </div>
          {/* Branches with geofence */}
          <div className="bg-white rounded-2xl px-5 py-4 card-shadow border border-navy/5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30 mb-1">Geofenced</p>
            <p className="text-2xl font-bold text-emerald-600">
              {branches.filter(b => b.latitude != null).length}
            </p>
          </div>
          {/* Branches without geofence */}
          <div className="bg-white rounded-2xl px-5 py-4 card-shadow border border-navy/5 col-span-2 sm:col-span-1">
            <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30 mb-1">Unrestricted</p>
            <p className="text-2xl font-bold text-navy/40">
              {branches.filter(b => b.latitude == null).length}
            </p>
          </div>
        </div>
      )}

      {/* ── Branch grid ─────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-indigo" size={32} />
        </div>
      ) : branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="p-5 bg-indigo/5 rounded-3xl">
            <Building2 size={40} className="text-indigo/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-bold text-navy/40">No branches yet</p>
            <p className="text-xs text-navy/25 mt-1">Create the first branch to get started</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="flex items-center gap-2 px-6 py-3 gradient-primary text-white rounded-2xl text-xs font-bold tactile-press shadow-lg shadow-indigo/20 mt-2"
          >
            <Plus size={14} /> Create First Branch
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {branches.map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              onEdit={() => openEdit(branch)}
              onLocation={() => openLocation(branch)}
            />
          ))}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────── */}
      <BranchFormModal
        isOpen={formModal !== null}
        branch={editingBranch}
        onClose={closeForm}
      />

      <BranchLocationModal
        isOpen={locationModal !== null}
        branch={locationModal}
        onClose={closeLocation}
      />
    </div>
  );
};
