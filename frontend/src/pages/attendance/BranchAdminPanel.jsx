import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { CheckCircle2, ChevronRight, Clock, Home, Loader2, LogOut, MapPin, Search, UserCheck, XCircle, X, AlertCircle } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { AnimatePresence, motion } from 'framer-motion';
import { StatusChip } from '../../components/StatusChip';
import { PageHeader } from '../../components/attendance/PageHeader';
import { OfficeCheckIn } from './OfficeCheckIn';
import { FieldCheckIn } from './FieldCheckIn';
import { MarkModal } from './MarkModal';
import { CorrectionModal } from './CorrectionModal';
import { EmployeeHistoryModal } from '../../components/attendance/EmployeeHistoryModal';
import { useAdminAttendance } from './hooks/useAdminAttendance';
import { useCheckIn } from './hooks/useCheckIn';
import { useSignOff } from './hooks/useSignOff';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetEmployeesQuery, useAdminSignOffMutation } from '../../store/api/apiSlice';


const SELF_VIEWS = { LIST: 'list', OFFICE: 'office', FIELD: 'field' };

const FILTERS = [
  { key: 'all',           label: 'All' },
  { key: 'smartphone',    label: 'Smartphone' },
  { key: 'no-smartphone', label: 'No Phone' },
];

const EmployeeAvatar = ({ name, profilePhotoUrl }) => (
  <div className="w-10 h-10 rounded-xl bg-navy/5 overflow-hidden shrink-0">
    <Avatar url={profilePhotoUrl} name={name} />
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

  // Employee whose full history the admin wants to inspect
  const [historyEmployee, setHistoryEmployee] = useState(null);

  // Self check-in hook — branch admin marks their OWN attendance
  const {
    todayRecord,
    gpsStatus,
    gpsPermissionDenied,
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

  // Self sign-off hook — branch admin clocks out for themselves
  const {
    gpsStatus: signOffGpsStatus,
    fetchGps: fetchSignOffGps,
    isSubmitting: isSigningOff,
    signOffError,
    clearSignOffError,
    handleSignOff,
  } = useSignOff();

  // Admin sign-off mutation — for signing off no-smartphone employees
  const [adminSignOff] = useAdminSignOffMutation();
  const [adminSignOffLoading, setAdminSignOffLoading] = useState(null); // holds targetUserId while loading

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

  // Pre-warm sign-off GPS when branch admin is checked in but not yet signed off
  useEffect(() => {
    if (todayRecord?.status === 'present' && !todayRecord?.check_out_time && !todayRecord?.signOffPending) {
      fetchSignOffGps();
    }
  }, [todayRecord?.status, todayRecord?.check_out_time, todayRecord?.signOffPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // No-smartphone employees with no check-in yet — need to be marked
  const needsMark = employees.filter((e) => !e.has_smartphone && !e.status);
  // No-smartphone employees who are present but haven't signed off yet
  const needsSignOff = employees.filter(
    (e) => !e.has_smartphone && e.status === 'present' && e.check_in_time && !e.check_out_time
  );
  // Combined "needs action" count shown in section header
  const needsAction = [...needsMark, ...needsSignOff.filter((e) => !needsMark.find((m) => m.id === e.id))];

  const handleAdminSignOff = async (emp) => {
    setAdminSignOffLoading(emp.id);
    try {
      // Use a placeholder GPS (0,0) since branch admin is signing off for someone else
      // The GPS coordinates for admin sign-off come from the admin's own location
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      });
      await adminSignOff({
        targetUserId: emp.id,
        checkOutLat: pos.coords.latitude,
        checkOutLng: pos.coords.longitude,
      }).unwrap();
    } catch (err) {
      // Fallback: if GPS fails, use 0,0 — admin is responsible for the sign-off
      try {
        await adminSignOff({
          targetUserId: emp.id,
          checkOutLat: 0,
          checkOutLng: 0,
        }).unwrap();
      } catch (innerErr) {
        console.error('Admin sign-off failed:', innerErr?.data?.error?.message || innerErr?.message);
      }
    } finally {
      setAdminSignOffLoading(null);
    }
  };

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
        gpsPermissionDenied={gpsPermissionDenied}
        isSubmitting={isSubmitting}
        todayRecord={todayRecord}
        onCheckIn={handleCheckIn}
        onBack={() => setSelfView(SELF_VIEWS.LIST)}
        onSwitchToField={() => { setSelfView(SELF_VIEWS.FIELD); setFieldStep(1); }}
        onEnter={() => { fetchGps(); fetchSignOffGps(); }}
        onSignOff={handleSignOff}
        isSigningOff={isSigningOff}
        signOffError={signOffError}
      />
    );
  }

  if (selfView === SELF_VIEWS.FIELD) {
    return (
      <FieldCheckIn
        user={user}
        gpsStatus={gpsStatus}
        gpsPermissionDenied={gpsPermissionDenied}
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
        onEnter={() => { fetchGps(); fetchSignOffGps(); }}
        onSignOff={handleSignOff}
        isSigningOff={isSigningOff}
        signOffError={signOffError}
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
            <div className="space-y-3">
              <div className={`p-4 rounded-2xl flex items-center gap-3 ${
                todayRecord.check_out_time
                  ? 'bg-navy/5 border border-navy/10'
                  : 'bg-emerald/5 border border-emerald/20'
              }`}>
                <CheckCircle2 size={20} className={todayRecord.check_out_time ? 'text-navy/40 shrink-0' : 'text-emerald shrink-0'} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy">
                    {todayRecord.check_out_time ? 'Shift Complete' : 'Checked In'}
                  </p>
                  <p className="text-[10px] text-navy/40 mt-0.5 font-mono">
                    {todayRecord.mode === 'field' ? 'Field' : 'Office'}
                    {todayRecord.check_in_time && (
                      <> · IN {new Date(todayRecord.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</>
                    )}
                    {todayRecord.check_out_time && (
                      <> → OUT {new Date(todayRecord.check_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}</>
                    )}
                  </p>
                </div>
              </div>

              {/* Sign-off button — same condition as AttendanceTab: status present, not yet out */}
              {todayRecord.status === 'present' && !todayRecord.check_out_time && !todayRecord.signOffPending && (
                <>
                  <button
                    disabled={isSigningOff}
                    onClick={handleSignOff}
                    className="w-full bg-amber-500 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-lg shadow-amber-500/20 tactile-press disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {isSigningOff
                      ? <><Loader2 className="animate-spin" size={20} /> Signing Off...</>
                      : <><LogOut size={20} /> Sign Off</>}
                  </button>
                  {signOffError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2">
                      <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-bold text-red-700">{signOffError}</p>
                      <button onClick={clearSignOffError} className="text-red-400 hover:text-red-600 ml-auto"><X size={12} /></button>
                    </div>
                  )}
                </>
              )}

              {todayRecord.signOffPending && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
                  <p className="text-xs font-bold text-amber-700">Signing off...</p>
                </div>
              )}
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
          {(needsMark.length > 0 || needsSignOff.length > 0) && (
            <section>
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
                Needs Action ({needsMark.length + needsSignOff.length})
              </p>
              {empLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="animate-spin text-indigo" size={24} />
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Employees who need check-in marking */}
                  {needsMark.map((emp) => (
                    <div key={emp.id} className="p-4 bg-white rounded-2xl card-shadow flex items-center gap-3">
                      <EmployeeAvatar name={emp.name} profilePhotoUrl={emp.profilePhotoUrl} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-navy truncate">{emp.name}</p>
                        <p className="text-[9px] font-medium text-navy/40 uppercase tracking-widest mt-0.5">
                          {emp.role?.replace(/_/g, ' ')}
                        </p>
                      </div>
                      <button
                        onClick={() => setHistoryEmployee(emp)}
                        className="p-2 text-navy/30 hover:text-indigo transition-colors"
                        title="View attendance history"
                      >
                        <Clock size={14} />
                      </button>
                      <button
                        onClick={() => openMarkModal(emp)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-indigo text-white rounded-xl text-[10px] font-bold tactile-press"
                      >
                        <UserCheck size={12} /> Mark
                      </button>
                    </div>
                  ))}
                  {/* Employees who need sign-off */}
                  {needsSignOff.map((emp) => (
                    <div key={emp.id + '-signoff'} className="p-4 bg-white rounded-2xl card-shadow flex items-center gap-3">
                      <EmployeeAvatar name={emp.name} profilePhotoUrl={emp.profilePhotoUrl} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-navy truncate">{emp.name}</p>
                        <p className="text-[9px] font-medium text-amber-600 uppercase tracking-widest mt-0.5">
                          In · Needs Sign-off
                        </p>
                      </div>
                      <button
                        onClick={() => setHistoryEmployee(emp)}
                        className="p-2 text-navy/30 hover:text-indigo transition-colors"
                        title="View attendance history"
                      >
                        <Clock size={14} />
                      </button>
                      <button
                        disabled={adminSignOffLoading === emp.id}
                        onClick={() => handleAdminSignOff(emp)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-amber-500 text-white rounded-xl text-[10px] font-bold tactile-press disabled:opacity-50"
                      >
                        {adminSignOffLoading === emp.id
                          ? <Loader2 size={12} className="animate-spin" />
                          : <LogOut size={12} />}
                        Sign Off
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {needsMark.length === 0 && needsSignOff.length === 0 && !empLoading && (
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
                    <EmployeeAvatar name={emp.name} profilePhotoUrl={emp.profilePhotoUrl} />
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
                      <button
                        onClick={() => setHistoryEmployee(emp)}
                        className="p-2 text-navy/30 hover:text-indigo transition-colors"
                        title="View attendance history"
                      >
                        <Clock size={14} />
                      </button>
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

      <EmployeeHistoryModal
        isOpen={!!historyEmployee}
        onClose={() => setHistoryEmployee(null)}
        employee={historyEmployee}
      />
    </>
  );
};
