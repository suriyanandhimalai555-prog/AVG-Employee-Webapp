import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Home, MapPin, CheckCircle2, XCircle, X, LogOut, Loader2 } from 'lucide-react';
import { PageHeader } from '../../components/attendance/PageHeader';
import { BranchAdminPanel } from './BranchAdminPanel';
import { OfficeCheckIn } from './OfficeCheckIn';
import { FieldCheckIn } from './FieldCheckIn';
import { HistoryCalendar } from '../../components/HistoryCalendar';
import { useCheckIn } from './hooks/useCheckIn';
import { useSignOff } from './hooks/useSignOff';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetHistoryQuery } from '../../store/api/apiSlice';

// Roles that mark their own attendance and should see a personal history calendar
const ROLES_WITH_OWN_CALENDAR = ['abm', 'branch_manager', 'gm', 'director'];

// Subview keys
const VIEWS = { LIST: 'list', OFFICE: 'office', FIELD: 'field' };

export const AttendanceTab = ({ onCheckInSuccess }) => {
  const user = useSelector(selectCurrentUser);
  const [subView, setSubView] = useState(VIEWS.LIST);

  const nowDate = new Date();
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [calYear, setCalYear] = useState(nowDate.getFullYear());

  // Personal attendance history — only fetched for roles that mark their own attendance
  const showOwnCalendar = ROLES_WITH_OWN_CALENDAR.includes(user?.role);
  const { data: historyData = [] } = useGetHistoryQuery(
    { userId: user?.id, month: calMonth, year: calYear },
    { skip: !user?.id || !showOwnCalendar, refetchOnMountOrArgChange: true, refetchOnFocus: true }
  );

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
  } = useCheckIn({ onSuccess: onCheckInSuccess });

  const {
    fetchGps: fetchSignOffGps,
    isSubmitting: isSigningOff,
    signOffError,
    clearSignOffError,
    handleSignOff,
  } = useSignOff();

  // Pre-warm GPS as soon as the record is present but not yet signed off.
  // Triggered on status change, not check_in_time, because the DB row may not exist yet
  // while the job is queued — status:'present' comes from the Redis key fallback immediately.
  useEffect(() => {
    if (todayRecord?.status === 'present' && !todayRecord?.check_out_time && !todayRecord?.signOffPending) {
      fetchSignOffGps();
    }
  }, [todayRecord?.status, todayRecord?.check_out_time, todayRecord?.signOffPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Branch admin has its own self-contained panel
  if (user?.role === 'branch_admin') {
    return <BranchAdminPanel />;
  }

  return (
    <motion.div
      key="attendance"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1"
    >
      {/* ── Inline error banners (replaces browser alert) ── */}
      <AnimatePresence>
        {checkInError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
          >
            <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="flex-1 text-xs font-bold text-red-700">{checkInError}</p>
            <button onClick={clearCheckInError} className="text-red-400 hover:text-red-600 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
        {signOffError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mx-6 mt-4 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3"
          >
            <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
            <p className="flex-1 text-xs font-bold text-red-700">{signOffError}</p>
            <button onClick={clearSignOffError} className="text-red-400 hover:text-red-600 transition-colors">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">

        {/* ── List view: entry point ── */}
        {subView === VIEWS.LIST && (
          <motion.div
            key="att-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1"
          >
            <PageHeader user={user} title="Workforce" />
            <div className="px-6 mb-8">
              <h2 className="text-3xl font-bold text-navy tracking-tight">Attendance</h2>
            </div>

            <div className="px-6 space-y-4 mb-8">
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">
                Mark Today
              </p>
              {todayRecord ? (
                <div className="space-y-3">
                  {/* Check-in status row */}
                  <div className="p-4 rounded-2xl bg-indigo/5 border border-indigo/10 flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-indigo shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy">
                        {todayRecord.check_out_time ? 'Shift Complete' : 'Checked In'}
                      </p>
                      <p className="text-[10px] text-navy/40 font-mono mt-0.5">
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

                  {/* Sign Off button — shown as soon as status is present, not dependent on
                      check_in_time which only exists after the worker persists the DB row */}
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
                        <p className="text-center text-[10px] leading-relaxed px-4 font-medium text-red-500">
                          {signOffError}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setSubView(VIEWS.OFFICE)}
                    className="p-6 rounded-[32px] bg-white card-shadow border-2 border-indigo flex flex-col items-center gap-3 tactile-press"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo">
                      <Home size={24} />
                    </div>
                    <p className="text-xs font-bold text-navy">Office</p>
                  </button>
                  <button
                    onClick={() => { setSubView(VIEWS.FIELD); setFieldStep(1); }}
                    className="p-6 rounded-[32px] bg-white card-shadow border-2 border-transparent flex flex-col items-center gap-3 opacity-60 hover:opacity-100 transition-all tactile-press"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy">
                      <MapPin size={24} />
                    </div>
                    <p className="text-xs font-bold text-navy">Field</p>
                  </button>
                </div>
              )}
            </div>

            {/* Personal attendance history calendar — director / gm / branch_manager / abm */}
            {showOwnCalendar && (
              <div className="px-6 pb-32">
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
                  My History
                </p>
                <HistoryCalendar
                  historyData={historyData}
                  mode="self"
                  onDaySelect={(cell) => {
                    const [yr, mo] = cell.isoStr.split('-');
                    setCalMonth(parseInt(mo));
                    setCalYear(parseInt(yr));
                  }}
                />
              </div>
            )}

          </motion.div>
        )}

        {/* ── Office check-in / sign-off ── */}
        {subView === VIEWS.OFFICE && (
          <OfficeCheckIn
            user={user}
            gpsStatus={gpsStatus}
            gpsPermissionDenied={gpsPermissionDenied}
            isSubmitting={isSubmitting}
            todayRecord={todayRecord}
            onCheckIn={handleCheckIn}
            onBack={() => setSubView(VIEWS.LIST)}
            onSwitchToField={() => { setSubView(VIEWS.FIELD); setFieldStep(1); }}
            onEnter={() => { fetchGps(); fetchSignOffGps(); }}
            onSignOff={handleSignOff}
            isSigningOff={isSigningOff}
            signOffError={signOffError}
          />
        )}

        {/* ── Field check-in (3-step wizard) / sign-off ── */}
        {subView === VIEWS.FIELD && (
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
            onBack={() => setSubView(VIEWS.OFFICE)}
            onStepChange={setFieldStep}
            onNoteChange={setFieldNote}
            onEnter={() => { fetchGps(); fetchSignOffGps(); }}
            onSignOff={handleSignOff}
            isSigningOff={isSigningOff}
            signOffError={signOffError}
          />
        )}

      </AnimatePresence>
    </motion.div>
  );
};
