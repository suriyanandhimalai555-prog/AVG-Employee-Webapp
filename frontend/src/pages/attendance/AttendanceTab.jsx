import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Home, MapPin, CheckCircle2, XCircle, X, LogOut, Loader2 } from 'lucide-react';
import { PageHeader } from '../../components/attendance/PageHeader';
import { BranchAdminPanel } from './BranchAdminPanel';
import { HistoryCalendar } from '../../components/HistoryCalendar';
import { AdminDashboard } from '../AdminDashboard';
import { useCheckIn } from './hooks/useCheckIn';
import { useSignOff } from './hooks/useSignOff';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetHistoryQuery } from '../../store/api/apiSlice';

// Roles that mark their own attendance and should see a personal history calendar
const ROLES_WITH_OWN_CALENDAR = ['abm', 'branch_manager', 'gm', 'director'];

export const AttendanceTab = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const nowDate = new Date();
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [calYear, setCalYear] = useState(nowDate.getFullYear());

  const showOwnCalendar = ROLES_WITH_OWN_CALENDAR.includes(user?.role);

  const { data: historyData = [] } = useGetHistoryQuery(
    { userId: user?.id, month: calMonth, year: calYear },
    { skip: !user?.id || !showOwnCalendar, refetchOnMountOrArgChange: true, refetchOnFocus: true }
  );

  // todayRecord — read from summary cache; onSuccess navigates home after check-in
  const {
    todayRecord,
    checkInError,
    clearCheckInError,
  } = useCheckIn({ onSuccess: () => navigate('/') });

  const {
    isSubmitting: isSigningOff,
    signOffError,
    clearSignOffError,
    handleSignOff,
  } = useSignOff();

  // Branch admin has its own self-contained panel
  if (user?.role === 'branch_admin') {
    return <BranchAdminPanel />;
  }

  // MD sees the org-wide Command Center (AdminDashboard) instead of personal attendance
  if (user?.role === 'md') {
    return <AdminDashboard />;
  }

  return (
    <motion.div
      key="attendance"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1"
    >
      {/* ── Inline error banners ── */}
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

            {/* Sign Off button — shown as soon as status is present */}
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
          /* Not yet checked in — navigate to the check-in route */
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => navigate('/attendance/office')}
              className="p-6 rounded-[32px] bg-white card-shadow border-2 border-indigo flex flex-col items-center gap-3 tactile-press"
            >
              <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo">
                <Home size={24} />
              </div>
              <p className="text-xs font-bold text-navy">Office</p>
            </button>
            <button
              onClick={() => navigate('/attendance/field')}
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
  );
};
