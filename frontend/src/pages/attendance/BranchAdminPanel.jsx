import { useSelector } from 'react-redux';
import { AlertCircle, CheckCircle2, ChevronRight, Loader2, UserCheck } from 'lucide-react';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../components/attendance/PageHeader';
import { MarkModal } from './MarkModal';
import { CorrectionModal } from './CorrectionModal';
import { useAdminAttendance } from './hooks/useAdminAttendance';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetEmployeesQuery } from '../../store/api/apiSlice';

const FILTERS = [
  { key: 'all',           label: 'All' },
  { key: 'smartphone',    label: 'Smartphone' },
  { key: 'no-smartphone', label: 'No Phone' },
];

const EmployeeAvatar = ({ name }) => (
  <div className="w-10 h-10 rounded-xl bg-navy/5 overflow-hidden shrink-0">
    <img
      src={`https://ui-avatars.com/api/?name=${encodeURIComponent(name || 'U')}&background=0B1C30&color=fff`}
      alt={name}
    />
  </div>
);

export const BranchAdminPanel = () => {
  const user = useSelector(selectCurrentUser);
  const { data: employees = [], isLoading: empLoading } = useGetEmployeesQuery(
    user?.id,
    { skip: !user?.id },
  );

  const {
    staffFilter, setStaffFilter,
    markModal, markStatus, setMarkStatus, markNote, setMarkNote, markLoading,
    openMarkModal, closeMarkModal, handleMarkSubmit,
    correctionModal, correctionStatus, setCorrectionStatus,
    correctionNote, setCorrectionNote, correctLoading,
    openCorrectionModal, closeCorrectionModal, handleAdminCorrect,
    correctionPhoto, correctionPhotoLoading,
  } = useAdminAttendance();

  const needsAction = employees.filter((e) => !e.has_smartphone && !e.status);

  const filtered = employees.filter((e) => {
    if (staffFilter === 'smartphone')    return !!e.has_smartphone;
    if (staffFilter === 'no-smartphone') return !e.has_smartphone;
    return true;
  });

  return (
    <>
      <div className="flex-1">
        <PageHeader user={user} title="Workforce" />

        <div className="px-6 mb-6">
          <h2 className="text-3xl font-bold text-navy tracking-tight">Attendance</h2>
        </div>

        <div className="px-6 pb-32 space-y-8">

          {/* ── Needs Action ── */}
          {needsAction.length > 0 && (
            <section>
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
                Needs Action ({needsAction.length})
              </p>
              {empLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="animate-spin text-indigo" size={24} />
                </div>
              ) : (
                <div className="space-y-3">
                  {needsAction.map((emp) => (
                    <div key={emp.id} className="p-4 bg-white rounded-2xl card-shadow flex items-center gap-3">
                      <EmployeeAvatar name={emp.name} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-navy truncate">{emp.name}</p>
                        <p className="text-[9px] font-medium text-navy/40 uppercase tracking-widest mt-0.5">
                          {emp.role?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <button
                        onClick={() => openMarkModal(emp)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo text-white rounded-xl text-[10px] font-bold tactile-press"
                      >
                        <UserCheck size={12} /> Mark
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {needsAction.length === 0 && !empLoading && (
            <div className="p-5 bg-emerald/5 border border-emerald/20 rounded-3xl flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald shrink-0" />
              <p className="text-xs font-bold text-navy">All no-phone employees marked for today</p>
            </div>
          )}

          {/* ── Filter + Full List ── */}
          <section>
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
              All Branch Employees
            </p>

            {/* Filter tabs */}
            <div className="flex gap-2 mb-4">
              {FILTERS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setStaffFilter(key)}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                    staffFilter === key
                      ? 'bg-indigo text-white shadow-lg shadow-indigo/20'
                      : 'bg-white text-navy/40 card-shadow hover:text-navy'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {empLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-indigo" size={24} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 bg-navy/5 rounded-3xl text-center">
                <p className="text-xs font-bold text-navy/30">No employees in this filter</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((emp) => (
                  <div key={emp.id} className="p-4 bg-white rounded-2xl card-shadow flex items-center gap-3">
                    <EmployeeAvatar name={emp.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <p className="text-xs font-bold text-navy truncate">{emp.name}</p>
                        <span className={`shrink-0 text-[7px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                          emp.has_smartphone
                            ? 'bg-emerald/10 text-emerald'
                            : 'bg-amber-500/10 text-amber-600'
                        }`}>
                          {emp.has_smartphone ? '📱' : 'No Phone'}
                        </span>
                      </div>
                      <p className="text-[9px] font-medium text-navy/40 uppercase tracking-widest">
                        {emp.role?.replace(/_/g, ' ')}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {emp.status ? (
                        <>
                          <StatusChip status={emp.status} />
                          {emp.attendance_id && (
                            <button
                              onClick={() => openCorrectionModal(emp)}
                              className="p-2 text-navy/30 hover:text-indigo transition-colors"
                              title="Correct attendance"
                            >
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          onClick={() => openMarkModal(emp)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-navy/5 text-navy/50 hover:bg-indigo hover:text-white rounded-xl text-[10px] font-bold tactile-press transition-all"
                        >
                          <UserCheck size={12} /> Mark
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Modals */}
      <MarkModal
        open={markModal.open}
        employee={markModal.employee}
        status={markStatus}
        note={markNote}
        isLoading={markLoading}
        onStatusChange={setMarkStatus}
        onNoteChange={setMarkNote}
        onConfirm={handleMarkSubmit}
        onClose={closeMarkModal}
      />

      <CorrectionModal
        open={correctionModal.open}
        employee={correctionModal.employee}
        status={correctionStatus}
        note={correctionNote}
        isLoading={correctLoading}
        photo={correctionPhoto}
        photoLoading={correctionPhotoLoading}
        onStatusChange={setCorrectionStatus}
        onNoteChange={setCorrectionNote}
        onConfirm={handleAdminCorrect}
        onClose={closeCorrectionModal}
      />
    </>
  );
};
