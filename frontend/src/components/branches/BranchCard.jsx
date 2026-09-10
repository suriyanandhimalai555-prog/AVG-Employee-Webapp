// BranchCard — one tile in the Management Branches grid.
// Displays branch name, shift window, assigned GM/Admin, and geofence status.
// Owns the inline deactivate-confirm overlay so the parent page stays clean.
// Props:
//   branch    — branch row from GET /branches (may be active or inactive)
//   onEdit    — () => void, opens the edit modal in the parent
//   onLocation — () => void, opens the geofence modal in the parent
import { useState } from 'react';
import { Building2, Clock, Pencil, MapPin, Trash2, Loader2, Check, RotateCcw } from 'lucide-react';
import { useDeleteBranchMutation, useUpdateBranchMutation } from '../../store/api/apiSlice';

export const BranchCard = ({ branch, onEdit, onLocation }) => {
  const [deleteBranch]                   = useDeleteBranchMutation();
  const [updateBranch]                   = useUpdateBranchMutation();
  const [confirming,   setConfirming]    = useState(false);
  const [deleting,     setDeleting]      = useState(false);
  const [reactivating, setReactivating]  = useState(false);

  const hasGeofence = branch.latitude != null && branch.longitude != null;

  const handleDeactivate = async () => {
    setDeleting(true);
    try {
      await deleteBranch(branch.id).unwrap();
      setConfirming(false);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Deactivate failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    try {
      await updateBranch({ id: branch.id, isActive: true }).unwrap();
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Reactivation failed');
    } finally {
      setReactivating(false);
    }
  };

  return (
    <div className={`relative p-6 bg-white rounded-2xl card-shadow border group transition-opacity ${
      branch.is_active ? 'border-border' : 'border-red-100 opacity-60'
    }`}>

      {/* ── Card body ─────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4">
        {/* Icon */}
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${branch.is_active ? 'bg-indigo/5 text-indigo' : 'bg-red-50 text-red-400'}`}>
          <Building2 size={18} />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          {branch.is_active ? (
            <>
              {/* Edit branch name / shifts */}
              <button
                type="button"
                onClick={onEdit}
                className="p-2 rounded-xl text-navy/30 hover:text-indigo hover:bg-indigo/5 transition-all"
                title="Edit branch"
              >
                <Pencil size={15} />
              </button>
              {/* Set / update geofence location */}
              <button
                type="button"
                onClick={onLocation}
                className={`p-2 rounded-xl transition-all ${
                  hasGeofence
                    ? 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'
                    : 'text-navy/30 hover:text-indigo hover:bg-indigo/5'
                }`}
                title={hasGeofence ? 'Edit location / geofence' : 'Set location'}
              >
                <MapPin size={15} />
              </button>
              {/* Deactivate */}
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="p-2 rounded-xl text-navy/30 hover:text-red-500 hover:bg-red-50 transition-all"
                title="Deactivate branch"
              >
                <Trash2 size={15} />
              </button>
            </>
          ) : (
            /* Reactivate button — shown only when branch is inactive */
            <button
              type="button"
              onClick={handleReactivate}
              disabled={reactivating}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-all disabled:opacity-50"
              title="Reactivate branch"
            >
              {reactivating
                ? <Loader2 size={12} className="animate-spin" />
                : <RotateCcw size={12} />}
              Reactivate
            </button>
          )}
        </div>
      </div>

      {/* Branch name + inactive badge */}
      <div className="flex items-center gap-2 mb-1.5 leading-snug">
        <p className="font-bold text-navy text-base tracking-tight">{branch.name}</p>
        {!branch.is_active && (
          <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 bg-red-50 px-1.5 py-0.5 rounded-md flex-shrink-0">
            Inactive
          </span>
        )}
      </div>

      {/* Shift window */}
      <div className="flex items-center gap-1.5 mb-2">
        <Clock size={11} className="text-navy/20" />
        <p className="text-[10px] font-bold text-navy/30 font-mono">
          {(branch.shift_start || '09:00').slice(0, 5)} – {(branch.shift_end || '18:00').slice(0, 5)}
        </p>
      </div>

      {/* GM / Admin names */}
      {branch.gm_name && (
        <p className="text-[10px] font-bold text-navy/30 truncate mb-0.5">GM: {branch.gm_name}</p>
      )}
      {branch.admin_name && (
        <p className="text-[10px] font-bold text-navy/20 truncate mb-0.5">Admin: {branch.admin_name}</p>
      )}

      {/* Geofence status chip — only shown for active branches */}
      {branch.is_active && (
        <div className="mt-3">
          {hasGeofence ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-100">
              <Check size={9} className="text-emerald-500" />
              <span className="text-[9px] font-mono font-bold text-emerald-600">
                {parseFloat(branch.latitude).toFixed(4)}, {parseFloat(branch.longitude).toFixed(4)}
                {' · '}{branch.geofence_radius_m ?? 150} m
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-navy/[0.03] border border-border">
              <MapPin size={9} className="text-navy/20" />
              <span className="text-[9px] font-bold text-navy/25 italic">No geofence — unrestricted</span>
            </span>
          )}
        </div>
      )}

      {/* ── Inline deactivate confirmation overlay ───────── */}
      {confirming && (
        <div className="absolute inset-0 bg-white/96 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center gap-3 p-5">
          <p className="text-xs font-bold text-navy text-center">
            Deactivate &ldquo;{branch.name}&rdquo;?
          </p>
          <p className="text-[10px] text-navy/40 text-center leading-relaxed">
            Employees stay. History is preserved.
          </p>
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 py-2.5 text-xs font-bold text-navy/40 hover:text-navy bg-navy/5 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeactivate}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : 'Deactivate'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
