import { useState } from 'react';
import { useSelector } from 'react-redux';
import { CheckCircle2, ChevronRight, Home, Loader2, MapPin, Search, UserCheck, XCircle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../components/attendance/PageHeader';
import { OfficeCheckIn } from './OfficeCheckIn';
import { FieldCheckIn } from './FieldCheckIn';
import { MarkModal } from './MarkModal';
import { CorrectionModal } from './CorrectionModal';
import { useAdminAttendance } from './hooks/useAdminAttendance';
import { useCheckIn } from './hooks/useCheckIn';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetEmployeesQuery } from '../../store/api/apiSlice';

const SELF_VIEWS = { LIST: 'list', OFFICE: 'office', FIELD: 'field' };

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
  const [selfView, setSelfView] = useState(SELF_VIEWS.LIST);
  const [searchTerm, setSearchTerm] = useState('');

  // Server-side pagination — branch is typically ≤100 staff so one page is fine for most cases
  const {
    data: employeesResult,
    isLoading: empLoading,
    isError: empError,
    error: empErrorDetail,
  } = useGetEmployeesQuery(
    { viewerId: user?.id, limit: 100 },
    { skip: !user?.id },
  );
  // employeesResult shape: { data: [...], total, page, limit, totalPages }
  const employees = employeesResult?.data ?? [];

  // Self check-in hook — branch admin marks their OWN attendance
  const {
    todayRecord,
    gpsStatus,
    fetchGps,
    fieldStep, setFieldStep,
    fieldNote, setFieldNote,
    fieldPhoto,
    isSubmitting,
    isUploading,
    fileInputRef,
    handlePhotoCapture,
    handleCheckIn,
    checkInError,
    clearCheckInError,
  } = useCheckIn();

  const {
    staffFilter, setStaffFilter,
    markModal, markStatus, setMarkStatus, markNote, setMarkNote, markLoading,
    openMarkModal, closeMarkModal, handleMarkSubmit,
    correctionModal, correctionStatus, setCorrectionStatus,
    correctionNote, setCorrectionNote, correctLoading,
    openCorrectionModal, closeCorrectionModal, handleAdminCorrect,
    correctionPhoto, correctionPhotoLoading,
    adminError, clearAdminError,
  } = useAdminAttendance();

  const needsAction = employees.filter((e) => !e.has_smartphone && !e.status);

  const filtered = employees.filter((e) => {
    const matchesFilter =
      staffFilter === 'all' ||
      (staffFilter === 'smartphone' && !!e.has_smartphone) ||
      (staffFilter === 'no-smartphone' && !e.has_smartphone);
    const matchesSearch =
      !searchTerm.trim() ||
      e.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  // Self check-in sub-views (office / field wizard) render full-screen
  if (selfView === SELF_VIEWS.OFFICE) {
    return (
      <OfficeCheckIn
        user={user}
        gpsStatus={gpsStatus}
        isSubmitting={isSubmitting}
        todayRecord={todayRecord}
        onCheckIn={handleCheckIn}
        onBack={() => setSelfView(SELF_VIEWS.LIST)}
        onSwitchToField={() => { setSelfView(SELF_VIEWS.FIELD); setFieldStep(1); }}
        onEnter={fetchGps}
      />
    );
  }

  if (selfView === SELF_VIEWS.FIELD) {
    return (
      <FieldCheckIn
        user={user}
        gpsStatus={gpsStatus}
        fieldStep={fieldStep}
        fieldNote={fieldNote}
        fieldPhoto={fieldPhoto}
        isSubmitting={isSubmitting}
        isUploading={isUploading}
        todayRecord={todayRecord}
        fileInputRef={fileInputRef}
        onPhotoCapture={handlePhotoCapture}
        onCheckIn={handleCheckIn}
        onBack={() => setSelfView(SELF_VIEWS.OFFICE)}
        onStepChange={setFieldStep}
        onNoteChange={setFieldNote}
        onEnter={fetchGps}
      />
    );
  }

  return (
    <>
      <div className="flex-1">
        <PageHeader user={user} title="Workforce" />

        <div className="px-6 mb-6">
          <h2 className="text-3xl font-bold text-navy tracking-tight">Attendance</h2>
        </div>

        {/* ── Employee fetch error (diagnostic) ── */}
        {empError && (
          <div className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <p className="text-xs font-bold text-red-700">
              Could not load employees:{' '}
              {empErrorDetail?.data?.error?.message || empErrorDetail?.status || 'Unknown error'}
            </p>
          </div>
        )}

        {/* ── Self attendance for branch admin ── */}
        <AnimatePresence>
          {checkInError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
            >
              <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="flex-1 text-xs font-bold text-red-700">{checkInError}</p>
              <button onClick={clearCheckInError} className="text-red-400 hover:text-red-600 transition-colors"><X size={14} /></button>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="px-6 mb-6">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">Your Attendance</p>
          {todayRecord ? (
            <div className="p-4 rounded-2xl bg-emerald/5 border border-emerald/20 flex items-center gap-3">
              <CheckCircle2 size={20} className="text-emerald shrink-0" />
              <div>
                <p className="text-sm font-bold text-navy">Checked In</p>
                <p className="text-[10px] text-navy/40 mt-0.5">
                  {todayRecord.mode === 'field' ? 'Field' : 'Office'} · {todayRecord.status}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setSelfView(SELF_VIEWS.OFFICE); fetchGps(); }}
                className="p-5 rounded-2xl bg-white card-shadow border-2 border-indigo flex flex-col items-center gap-2 tactile-press"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo/10 flex items-center justify-center text-indigo">
                  <Home size={20} />
                </div>
                <p className="text-xs font-bold text-navy">Office</p>
              </button>
              <button
                onClick={() => { setSelfView(SELF_VIEWS.FIELD); setFieldStep(1); fetchGps(); }}
                className="p-5 rounded-2xl bg-white card-shadow border-2 border-transparent flex flex-col items-center gap-2 tactile-press"
              >
                <div className="w-10 h-10 rounded-xl bg-navy/5 flex items-center justify-center text-navy">
                  <MapPin size={20} />
                </div>
                <p className="text-xs font-bold text-navy">Field</p>
              </button>
            </div>
          )}
        </div>

        {/* Inline error banner — replaces browser alert for admin actions */}
        <AnimatePresence>
          {adminError && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mx-6 mb-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
            >
              <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
              <p className="flex-1 text-xs font-bold text-red-700">{adminError}</p>
              <button onClick={clearAdminError} className="text-red-400 hover:text-red-600 transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

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

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-navy/20" size={14} />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white rounded-xl text-xs font-bold text-navy placeholder:text-navy/20 card-shadow outline-none focus:ring-2 ring-indigo/10"
              />
            </div>

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
