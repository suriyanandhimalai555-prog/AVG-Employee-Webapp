import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Home, MapPin, CheckCircle2, Loader2 } from 'lucide-react';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/attendance/PageHeader';

export const OfficeCheckIn = ({
  user,
  gpsStatus,
  gpsPermissionDenied,
  isSubmitting,
  todayRecord,
  onCheckIn,
  onBack,
  onSwitchToField,
  onEnter, // called on mount to start GPS fetch
}) => {
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('en-US', { hour12: false }),
  );

  useEffect(() => {
    onEnter?.();
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      key="office"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1"
    >
      <PageHeader user={user} title="Workforce" showBack onBack={onBack} />

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
            onClick={onSwitchToField}
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
              gpsStatus === 'fetching' ? 'bg-amber-400 ring-amber-400/10 animate-pulse' :
              gpsStatus === 'error'    ? 'bg-red-500 ring-red-500/10' :
              gpsStatus               ? 'bg-emerald ring-emerald/10' :
                                        'bg-navy/20 ring-navy/5'
            }`} />
            <div>
              <p className="text-xs font-bold text-navy">
                {gpsStatus === 'fetching' ? 'Acquiring GPS...' :
                 gpsStatus === 'error'    ? 'Location unavailable' :
                 gpsStatus               ? 'Location verified' : 'Waiting...'}
              </p>
              {gpsStatus && typeof gpsStatus === 'object' && (
                <p className="text-[9px] font-medium text-navy/40 font-mono">
                  LAT: {Number(gpsStatus.lat).toFixed(4)} | LNG: {Number(gpsStatus.lng).toFixed(4)}
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

        {/* Submit */}
        <div className="space-y-4 pb-32">
          <button
            disabled={isSubmitting || !!todayRecord || gpsStatus === 'fetching'}
            onClick={() => onCheckIn('office')}
            className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting
              ? <Loader2 className="animate-spin" size={22} />
              : todayRecord
                ? <><CheckCircle2 size={22} /> Already Checked In</>
                : gpsStatus === 'error'
                  ? <><CheckCircle2 size={22} /> Retry Location & Check In</>
                  : <><CheckCircle2 size={22} /> Confirm Office Check-In</>}
          </button>
          {/* Location error hint — clicking the button re-triggers the GPS prompt */}
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
        </div>
      </div>
    </motion.div>
  );
};
