import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Home, MapPin, CheckCircle2, Loader2, LogOut } from 'lucide-react';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/attendance/PageHeader';
import { useCheckIn } from './hooks/useCheckIn';
import { useSignOff } from './hooks/useSignOff';
import { selectCurrentUser } from '../../store/slices/authSlice';

export const OfficeCheckIn = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour12: false }),
  );

  const {
    todayRecord,
    gpsStatus,
    gpsPermissionDenied,
    fetchGps,
    isSubmitting,
    handleCheckIn,
  } = useCheckIn({ onSuccess: () => navigate('/') });

  const {
    fetchGps: fetchSignOffGps,
    gpsStatus: signOffGpsStatus,
    isSubmitting: isSigningOff,
    signOffError,
    handleSignOff,
  } = useSignOff();

  // Start GPS fetch on mount (for both check-in and sign-off pre-warm)
  useEffect(() => {
    fetchGps();
    fetchSignOffGps();
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-warm sign-off GPS when already checked in but not yet signed off
  useEffect(() => {
    if (todayRecord?.status === 'present' && !todayRecord?.check_out_time && !todayRecord?.signOffPending) {
      fetchSignOffGps();
    }
  }, [todayRecord?.status, todayRecord?.check_out_time, todayRecord?.signOffPending]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use sign-off GPS for sign-off, check-in GPS for check-in
  const activeGpsStatus = (todayRecord?.status === 'present') ? signOffGpsStatus : gpsStatus;

  return (
    <motion.div
      key="office"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1"
    >
      <PageHeader user={user} title="Workforce" showBack onBack={() => navigate('/attendance')} />

      <div className="px-6 mb-8">
        <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">
          Operations Mode
        </p>
        <h2 className="text-2xl font-bold text-navy tracking-tight">Mark Attendance</h2>
      </div>

      <div className="px-6 space-y-8">
        {/* Mode selector */}
        <div className="grid grid-cols-2 gap-4">
          <button className="p-6 rounded-[32px] bg-white card-shadow border-2 border-indigo flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo">
              <Home size={24} />
            </div>
            <p className="text-xs font-bold text-navy">Office</p>
          </button>
          <button
            onClick={() => navigate('/attendance/field')}
            className="p-6 rounded-[32px] bg-white card-shadow border-2 border-transparent flex flex-col items-center gap-3 opacity-50 hover:opacity-100 transition-all"
          >
            <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy">
              <MapPin size={24} />
            </div>
            <p className="text-xs font-bold text-navy">Field</p>
          </button>
        </div>

        {/* GPS status */}
        <Card className="p-5 overflow-hidden bg-white border-none card-shadow">
          <div className="flex items-center gap-3">
            <div className={`w-2.5 h-2.5 rounded-full ring-4 ${
              activeGpsStatus === 'fetching' ? 'bg-amber-400 ring-amber-400/10 animate-pulse' :
              activeGpsStatus === 'error'    ? 'bg-red-500 ring-red-500/10' :
              activeGpsStatus               ? 'bg-emerald ring-emerald/10' :
                                              'bg-navy/20 ring-navy/5'
            }`} />
            <div>
              <p className="text-xs font-bold text-navy">
                {activeGpsStatus === 'fetching' ? 'Acquiring GPS...' :
                 activeGpsStatus === 'error'    ? 'Location unavailable' :
                 activeGpsStatus               ? 'Location verified' : 'Waiting...'}
              </p>
              {activeGpsStatus && typeof activeGpsStatus === 'object' && (
                <p className="text-[9px] font-medium text-navy/40 font-mono">
                  LAT: {Number(activeGpsStatus.lat).toFixed(4)} | LNG: {Number(activeGpsStatus.lng).toFixed(4)}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Live clock */}
        <div className="text-center py-6 space-y-2">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">Current Time</p>
          <p className="text-5xl font-bold text-navy font-mono tracking-tight">{currentTime}</p>
          <p className="text-sm font-bold text-navy/40 uppercase tracking-widest pt-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
        </div>

        {/* Submit / Sign-off */}
        <div className="space-y-4 pb-32">
          {todayRecord?.check_in_time && todayRecord?.check_out_time ? (
            /* Shift complete */
            <div className="w-full bg-emerald/5 border border-emerald/20 rounded-2xl p-5 text-center space-y-1">
              <CheckCircle2 size={22} className="text-emerald mx-auto mb-2" />
              <p className="text-sm font-bold text-navy">Shift Complete</p>
              <p className="text-[10px] font-mono text-navy/40">
                IN {new Date(todayRecord.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                {' '}→{' '}
                OUT {new Date(todayRecord.check_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
              </p>
            </div>
          ) : todayRecord?.check_in_time && !todayRecord?.check_out_time ? (
            /* Checked in, not yet signed off */
            <>
              <div className="w-full bg-indigo/5 border border-indigo/20 rounded-2xl p-4 flex items-center gap-3">
                <CheckCircle2 size={18} className="text-indigo shrink-0" />
                <div>
                  <p className="text-xs font-bold text-navy">Checked In</p>
                  <p className="text-[10px] font-mono text-navy/40">
                    {new Date(todayRecord.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                  </p>
                </div>
              </div>
              <button
                disabled={isSigningOff || signOffGpsStatus === 'fetching'}
                onClick={handleSignOff}
                className="w-full bg-amber-500 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 tactile-press disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSigningOff
                  ? <Loader2 className="animate-spin" size={22} />
                  : signOffGpsStatus === 'error'
                    ? <><LogOut size={22} /> Retry Location & Sign Off</>
                    : <><LogOut size={22} /> Sign Off</>}
              </button>
              {signOffError && (
                <p className="text-center text-[10px] leading-relaxed px-8 font-medium text-red-500">
                  {signOffError}
                </p>
              )}
              {signOffGpsStatus === 'error' && !signOffError && (
                <p className="text-center text-[10px] leading-relaxed px-8 font-medium text-amber-600">
                  {gpsPermissionDenied
                    ? 'Location access is blocked — enable it in your browser settings, then tap the button to retry.'
                    : 'Location unavailable — tap the button above to request access again.'}
                </p>
              )}
            </>
          ) : (
            /* Not checked in */
            <>
              <button
                disabled={isSubmitting || gpsStatus === 'fetching'}
                onClick={() => handleCheckIn('office')}
                className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50 disabled:pointer-events-none"
              >
                {isSubmitting
                  ? <Loader2 className="animate-spin" size={22} />
                  : gpsStatus === 'error'
                    ? <><CheckCircle2 size={22} /> Retry Location & Check In</>
                    : <><CheckCircle2 size={22} /> Confirm Office Check-In</>}
              </button>
              {gpsStatus === 'error' && (
                <p className="text-center text-[10px] leading-relaxed px-8 font-medium text-amber-600">
                  {gpsPermissionDenied
                    ? 'Location access is blocked — enable it in your browser settings, then tap the button to retry.'
                    : 'Location unavailable — tap the button above to request access again.'}
                </p>
              )}
              {gpsStatus !== 'error' && (
                <p className="text-center text-[10px] leading-relaxed text-navy/40 px-8 font-medium">
                  Your GPS coordinates will be verified for office compliance.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};
