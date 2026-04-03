import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Home, MapPin, CheckCircle2, XCircle, X } from 'lucide-react';
import { PageHeader } from '../../components/attendance/PageHeader';
import { BranchAdminPanel } from './BranchAdminPanel';
import { OfficeCheckIn } from './OfficeCheckIn';
import { FieldCheckIn } from './FieldCheckIn';
import { useCheckIn } from './hooks/useCheckIn';
import { selectCurrentUser } from '../../store/slices/authSlice';

// Subview keys
const VIEWS = { LIST: 'list', OFFICE: 'office', FIELD: 'field' };

export const AttendanceTab = ({ onCheckInSuccess }) => {
  const user = useSelector(selectCurrentUser);
  const [subView, setSubView] = useState(VIEWS.LIST);

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
  } = useCheckIn({ onSuccess: onCheckInSuccess });

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
      {/* ── Inline error banner (replaces browser alert) ── */}
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
                <div className="p-5 rounded-3xl bg-emerald/5 border border-emerald/20 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-emerald/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={22} className="text-emerald" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-navy">Checked In Today</p>
                    <p className="text-xs text-navy/40 mt-0.5">
                      {todayRecord.mode === 'field' ? 'Field' : 'Office'} • {todayRecord.status}
                    </p>
                  </div>
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

          </motion.div>
        )}

        {/* ── Office check-in ── */}
        {subView === VIEWS.OFFICE && (
          <OfficeCheckIn
            user={user}
            gpsStatus={gpsStatus}
            isSubmitting={isSubmitting}
            todayRecord={todayRecord}
            onCheckIn={handleCheckIn}
            onBack={() => setSubView(VIEWS.LIST)}
            onSwitchToField={() => { setSubView(VIEWS.FIELD); setFieldStep(1); }}
            onEnter={fetchGps}
          />
        )}

        {/* ── Field check-in (3-step wizard) ── */}
        {subView === VIEWS.FIELD && (
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
            onBack={() => setSubView(VIEWS.OFFICE)}
            onStepChange={setFieldStep}
            onNoteChange={setFieldNote}
            onEnter={fetchGps}
          />
        )}

      </AnimatePresence>
    </motion.div>
  );
};
