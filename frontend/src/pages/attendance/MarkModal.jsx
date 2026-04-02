import { Loader2 } from 'lucide-react';
import { GlassModal } from '../../components/GlassModal';

const STATUS_OPTIONS = ['present', 'absent', 'field'];

export const MarkModal = ({
  open,
  employee,
  status,
  note,
  isLoading,
  onStatusChange,
  onNoteChange,
  onConfirm,
  onClose,
}) => (
  <GlassModal isOpen={open} onClose={onClose} title="Mark Attendance">
    <div className="space-y-5">
      {/* Employee info */}
      <div className="flex items-center gap-3 p-4 bg-navy/5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-white overflow-hidden shadow-sm shrink-0">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(employee?.name || 'U')}&background=0B1C30&color=fff`}
            alt=""
          />
        </div>
        <div>
          <p className="text-sm font-bold text-navy">{employee?.name}</p>
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest mt-0.5">
            {employee?.role?.replace(/_/g, ' ')}
          </p>
          <p className={`text-[8px] font-bold uppercase tracking-widest mt-1 ${
            employee?.has_smartphone ? 'text-emerald' : 'text-amber-600'
          }`}>
            {employee?.has_smartphone ? 'Has smartphone' : 'No smartphone'}
          </p>
        </div>
      </div>

      {/* Status */}
      <div>
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-2">Status</p>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onStatusChange(s)}
              className={`flex-1 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all ${
                status === s
                  ? 'bg-indigo text-white shadow-lg shadow-indigo/20'
                  : 'bg-navy/5 text-navy/40 hover:text-navy'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Note — stored in attendance_audit */}
      <div>
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-2">
          Note <span className="text-navy/20">(audit trail)</span>
        </p>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Reason for marking on their behalf..."
          className="w-full p-4 bg-navy/5 rounded-2xl text-sm text-navy font-medium placeholder:text-navy/20 outline-none resize-none"
          rows={3}
          maxLength={500}
        />
        <p className="text-[9px] text-navy/30 mt-1 font-mono text-right">{note.length} / 500</p>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors">
          Cancel
        </button>
        <button
          disabled={isLoading}
          onClick={onConfirm}
          className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Confirm Mark'}
        </button>
      </div>
    </div>
  </GlassModal>
);
