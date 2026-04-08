import { Loader2, MapPin } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { GlassModal } from '../../components/GlassModal';


const STATUS_OPTIONS = ['present', 'absent', 'field'];
const MIN_NOTE_LENGTH = 10;

export const CorrectionModal = ({
  open,
  employee,
  status,
  note,
  isLoading,
  photo,
  photoLoading,
  onStatusChange,
  onNoteChange,
  onConfirm,
  onClose,
}) => (
  <GlassModal isOpen={open} onClose={onClose} title="Correct Attendance">
    <div className="space-y-5">
      {/* Employee info */}
      <div className="flex items-center gap-3 p-4 bg-navy/5 rounded-2xl">
        <div className="w-12 h-12 rounded-xl bg-white overflow-hidden shadow-sm shrink-0">
          <Avatar url={employee?.profilePhotoUrl} name={employee?.name} />
        </div>
        <div>
          <p className="text-sm font-bold text-navy">{employee?.name}</p>
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest mt-0.5">
            {employee?.role?.replace(/_/g, ' ')}
          </p>
          {employee?.status && (
            <p className="text-[9px] font-bold text-indigo uppercase tracking-widest mt-1">
              Currently: {employee.status}
            </p>
          )}
        </div>
      </div>

      {/* Field photo — visible to branch admin and above */}
      {employee?.photo_key && (
        <div className="rounded-2xl overflow-hidden bg-navy/5 border border-navy/5 relative h-44 flex items-center justify-center">
          {photoLoading ? (
            <Loader2 className="animate-spin text-navy/30" size={24} />
          ) : photo?.downloadUrl ? (
            <img src={photo.downloadUrl} alt="Field capture" className="w-full h-full object-cover" />
          ) : (
            <p className="text-xs font-bold text-navy/30">Photo unavailable</p>
          )}
          {employee?.field_note && (
            <div className="absolute bottom-0 left-0 w-full p-3 bg-gradient-to-t from-navy/80 to-transparent">
              <p className="text-white text-xs font-medium line-clamp-2">"{employee.field_note}"</p>
            </div>
          )}
        </div>
      )}

      {/* GPS — shown if the original record has coordinates */}
      {employee?.check_in_lat && employee?.check_in_lng && (
        <div className="p-3 bg-emerald/5 border border-emerald/10 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold text-emerald uppercase tracking-widest mb-0.5">
              Verified Location
            </p>
            <p className="text-xs font-mono text-navy font-bold">
              {Number(employee.check_in_lat).toFixed(5)}, {Number(employee.check_in_lng).toFixed(5)}
            </p>
          </div>
          <a
            href={`https://maps.google.com/?q=${employee.check_in_lat},${employee.check_in_lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 bg-white text-emerald rounded-xl card-shadow hover:scale-105 transition-all"
          >
            <MapPin size={16} />
          </a>
        </div>
      )}

      {/* New status */}
      <div>
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-2">New Status</p>
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

      {/* Justification — required for audit trail */}
      <div>
        <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest mb-2">
          Correction Justification <span className="text-red-400">*</span>
        </p>
        <textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="Required for audit trail (min 10 characters)..."
          className="w-full p-4 bg-navy/5 rounded-2xl text-sm text-navy font-medium placeholder:text-navy/20 outline-none resize-none"
          rows={3}
          maxLength={500}
        />
        <p className={`text-[9px] mt-1 font-mono ${note.length > 0 && note.length < MIN_NOTE_LENGTH ? 'text-red-400' : 'text-navy/30'}`}>
          {note.length} / 500
          {note.length > 0 && note.length < MIN_NOTE_LENGTH
            ? ` — ${MIN_NOTE_LENGTH - note.length} more chars required`
            : ''}
        </p>
      </div>

      <div className="flex gap-3 pt-1">
        <button onClick={onClose} className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors">
          Cancel
        </button>
        <button
          disabled={isLoading || note.length < MIN_NOTE_LENGTH}
          onClick={onConfirm}
          className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50"
        >
          {isLoading ? <Loader2 className="animate-spin" size={18} /> : 'Apply Correction'}
        </button>
      </div>
    </div>
  </GlassModal>
);
