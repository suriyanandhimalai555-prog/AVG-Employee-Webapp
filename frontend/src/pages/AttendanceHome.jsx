import React, { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  MapPin, Camera, ArrowRight, Home, Fingerprint, 
  Wallet, Bell, User, Settings, AlertCircle, CheckCircle2, 
  Clock, ChevronRight, Loader2
} from 'lucide-react';
import { Card } from '../components/Card';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetSummaryQuery, useSubmitAttendanceMutation, useLazyGetUploadUrlQuery, useGetHistoryQuery } from '../store/api/apiSlice';
import { HistoryCalendar } from '../components/HistoryCalendar';

// ─── Sub-components ───

const PageHeader = ({ user, title, showBack, onBack }) => (
  <header className="px-6 pt-12 pb-6 flex items-center justify-between">
    <div className="flex items-center gap-3">
      {showBack ? (
        <button onClick={onBack} className="p-2 -ml-2 text-navy opacity-60"><ArrowRight className="rotate-180" size={20} /></button>
      ) : (
        <div className="w-10 h-10 rounded-full bg-navy/10 overflow-hidden border border-white">
          <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0B1C30&color=fff`} alt="Profile" />
        </div>
      )}
      <div className="flex flex-col">
        <h1 className="text-lg font-bold text-navy tracking-tight leading-none">{title}</h1>
        {user?.branchName && (
          <p className="text-[9px] font-bold text-indigo uppercase tracking-widest mt-1">
            {user.branchName}
          </p>
        )}
      </div>
    </div>
    <button className="p-2 text-navy/40 hover:text-navy transition-colors"><Settings size={20} /></button>
  </header>
);

const SectionTitle = ({ date, title }) => (
  <div className="px-6 mb-6">
    {date && <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-1 font-mono">{date}</p>}
    <h2 className="text-3xl font-bold text-navy tracking-tight">{title}</h2>
  </div>
);

const AlertCard = ({ onAction, isMarked }) => (
  <AnimatePresence>
    {!isMarked ? (
      <motion.div 
        key="alert" 
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: 'auto' }}
        exit={{ opacity: 0, height: 0 }}
        className="mx-6 mb-8 p-6 rounded-3xl gradient-yellow flex flex-col items-center text-center shadow-xl shadow-yellow/20"
      >
        <div className="w-10 h-10 rounded-full bg-navy/10 flex items-center justify-center mb-4">
          <AlertCircle size={24} className="text-navy" />
        </div>
        <h4 className="text-sm font-bold text-navy uppercase tracking-widest mb-1 leading-tight">Not Marked Yet</h4>
        <p className="text-xs text-navy/60 font-medium mb-6">You haven't checked in for today's shift.</p>
        <button 
          onClick={onAction}
          className="bg-navy text-white px-8 py-3 rounded-xl text-xs font-bold flex items-center gap-2 tactile-press shadow-lg shadow-navy/20"
        >
          <Fingerprint size={16} /> Mark Attendance
        </button>
      </motion.div>
    ) : (
      <motion.div 
        key="confirmed"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="mx-6 mb-8 p-6 rounded-3xl bg-emerald/5 border border-emerald/20 flex items-center gap-4"
      >
        <div className="w-10 h-10 rounded-full bg-emerald/10 flex items-center justify-center shrink-0">
          <CheckCircle2 size={24} className="text-emerald" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-navy">Checked In Today</h4>
          <p className="text-xs text-navy/40 font-medium mt-0.5">
            {isMarked.mode === 'field' ? 'Field' : 'Office'} • {isMarked.status}
          </p>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const StatsGrid = ({ summary, isLoading }) => (
  <div className="px-6 mb-8">
    <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-4 font-mono flex justify-between items-center">
      Your Month at a Glance <span>{new Date().toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase()}</span>
    </p>
    <Card className="p-0 border-none shadow-none bg-white rounded-3xl overflow-hidden card-shadow">
      <div className="flex divide-x divide-navy/5">
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">{isLoading ? '—' : (summary?.present ?? 0)}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Present</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-red-500 font-mono">{isLoading ? '—' : (summary?.absent ?? 0)}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Absent</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">{isLoading ? '—' : (summary?.field ?? 0)}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Field Days</p>
        </div>
      </div>
    </Card>
  </div>
);

// ─── Main Page ───

export const AttendanceHome = () => {
  const user = useSelector(selectCurrentUser);
  const [view, setView] = useState('dashboard');
  const [fieldStep, setFieldStep] = useState(1);
  const [fieldNote, setFieldNote] = useState('');
  const [fieldPhoto, setFieldPhoto] = useState(null); // stores { file, previewUrl }
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = React.useRef(null);
  const [currentTime, setCurrentTime] = useState('00:00:00');
  const [gpsStatus, setGpsStatus] = useState(null); // null | 'fetching' | { lat, lng } | 'error'
  // Optimistic flag: once submitted this session, show as marked even before worker writes to DB
  const [submittedThisSession, setSubmittedThisSession] = useState(false);

  // History query for the calendar — only refetches when month/year changes
  const nowDate = new Date();
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [calYear, setCalYear] = useState(nowDate.getFullYear());
  const { data: historyData = [] } = useGetHistoryQuery(
    { userId: user?.id, month: calMonth, year: calYear },
    { skip: !user?.id }
  );

  // RTK Query hooks
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } = useGetSummaryQuery();
  const [submitAttendance, { isLoading: isSubmitting }] = useSubmitAttendanceMutation();
  const [getUploadUrl] = useLazyGetUploadUrlQuery();

  // Use DB record if available, or fall back to optimistic session flag
  const todayRecord = summary?.today || (submittedThisSession ? { status: 'present', mode: 'field' } : null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch GPS when entering office or field mode
  useEffect(() => {
    if (view === 'office' || view === 'field') {
      setGpsStatus('fetching');
      if (!navigator.geolocation) {
        setGpsStatus('error');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => setGpsStatus({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setGpsStatus('error'),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  }, [view]);

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      setFieldPhoto({ file, previewUrl });
      setFieldStep(2); // Auto-advance after taking photo
    }
  };

  const handleCheckIn = async (mode) => {
    try {
      if (mode === 'office') {
        if (!gpsStatus || gpsStatus === 'error' || gpsStatus === 'fetching') {
          alert('GPS location is required. Please allow location permissions.');
          return;
        }
        await submitAttendance({
          mode: 'office',
          checkInLat: gpsStatus.lat,
          checkInLng: gpsStatus.lng,
        }).unwrap();
      } else {
        if (!gpsStatus || gpsStatus === 'error' || gpsStatus === 'fetching') {
          alert('GPS location is required for field operations. Please allow permissions.');
          return;
        }
        if (!fieldPhoto) {
          alert('A photo must be captured.');
          return;
        }

        setIsUploading(true);
        // 1. Fetch presigned upload URL & Key from Backend
        const { uploadUrl, photoKey } = await getUploadUrl().unwrap();
        
        // 2. Put raw picture to Amazon S3
        await fetch(uploadUrl, {
          method: 'PUT',
          body: fieldPhoto.file,
          headers: {
            'Content-Type': fieldPhoto.file.type,
          },
        });

        // 3. Mark Field Attendance via Backend with Geotags + Key
        await submitAttendance({
          mode: 'field',
          fieldNote,
          photoKey,
          checkInLat: gpsStatus.lat,
          checkInLng: gpsStatus.lng,
        }).unwrap();
      }
      
      setSubmittedThisSession(true);
      setView('dashboard');
      setFieldStep(1);
      setFieldNote('');
      if (fieldPhoto?.previewUrl) URL.revokeObjectURL(fieldPhoto.previewUrl);
      setFieldPhoto(null);
      // Refetch summary in background — worker may have written by now
      setTimeout(() => refetchSummary(), 3000);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Submission failed');
    } finally {
      setIsUploading(false);
    }
  };

  const todayFormatted = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="min-h-screen bg-surface flex flex-col max-w-[390px] mx-auto relative shadow-2xl overflow-x-hidden">
      <AnimatePresence mode="wait">

        {/* ═══ DASHBOARD ═══ */}
        {view === 'dashboard' && (
          <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex-1">
            <PageHeader user={user} title="Workforce" />
            <SectionTitle date={todayFormatted} title="Dashboard" />
            <AlertCard isMarked={todayRecord} onAction={() => setView('office')} />
            <StatsGrid summary={summary} isLoading={summaryLoading} />

            {/* ─── History Calendar ─── */}
            <div className="px-6 pb-32">
              <HistoryCalendar
                historyData={historyData}
                onDaySelect={(cell) => {
                  const [yr, mo] = cell.isoStr.split('-');
                  setCalMonth(parseInt(mo));
                  setCalYear(parseInt(yr));
                }}
              />
            </div>
          </motion.div>
        )}

        {/* ═══ OFFICE CHECK-IN ═══ */}
        {view === 'office' && (
          <motion.div key="office" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1">
            <PageHeader user={user} title="Workforce" showBack onBack={() => setView('dashboard')} />
            <div className="px-6 mb-8 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Operations Mode</p>
                <h2 className="text-2xl font-bold text-navy tracking-tight">Mark Attendance</h2>
              </div>
            </div>

            <main className="px-6 space-y-8">
              {/* Mode selector */}
              <div className="grid grid-cols-2 gap-4">
                <button className="p-6 rounded-[32px] bg-white card-shadow border-2 border-indigo flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo"><Home size={24} /></div>
                  <p className="text-xs font-bold text-navy">Office</p>
                </button>
                <button onClick={() => { setView('field'); setFieldStep(1); }} className="p-6 rounded-[32px] bg-white card-shadow border-2 border-transparent flex flex-col items-center gap-3 opacity-50 hover:opacity-100 transition-all">
                  <div className="w-12 h-12 rounded-2xl bg-navy/5 flex items-center justify-center text-navy"><MapPin size={24} /></div>
                  <p className="text-xs font-bold text-navy">Field</p>
                </button>
              </div>

              {/* GPS Status */}
              <Card className="p-5 overflow-hidden bg-white border-none card-shadow">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ring-4 ${
                    gpsStatus === 'fetching' ? 'bg-amber-400 ring-amber-400/10 animate-pulse' :
                    gpsStatus === 'error' ? 'bg-red-500 ring-red-500/10' :
                    gpsStatus ? 'bg-emerald ring-emerald/10' : 'bg-navy/20 ring-navy/5'
                  }`}></div>
                  <div>
                    <p className="text-xs font-bold text-navy">
                      {gpsStatus === 'fetching' ? 'Acquiring GPS...' :
                       gpsStatus === 'error' ? 'Location unavailable' :
                       gpsStatus ? 'Location verified' : 'Waiting...'}
                    </p>
                    {gpsStatus && typeof gpsStatus === 'object' && (
                      <p className="text-[9px] font-medium text-navy/40 font-mono">
                        LAT: {Number(gpsStatus.lat).toFixed(4)} | LNG: {Number(gpsStatus.lng).toFixed(4)}
                      </p>
                    )}
                  </div>
                </div>
              </Card>

              {/* Time */}
              <div className="text-center py-6 space-y-2">
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">Current Time</p>
                <p className="text-5xl font-bold text-navy font-mono tracking-tight">{currentTime}</p>
                <p className="text-sm font-bold text-navy/40 uppercase tracking-widest pt-1">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </p>
              </div>

              {/* Submit */}
              <div className="space-y-6 pb-32">
                <button 
                  disabled={isSubmitting || !!todayRecord || gpsStatus === 'fetching' || gpsStatus === 'error'}
                  onClick={() => handleCheckIn('office')}
                  className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSubmitting ? <Loader2 className="animate-spin" size={22} /> : (
                    todayRecord ? <><CheckCircle2 size={22} /> Already Checked In</> : <><CheckCircle2 size={22} /> Confirm Office Check-In</>
                  )}
                </button>
                <p className="text-center text-[10px] leading-relaxed text-navy/40 px-8 font-medium">
                  Your GPS coordinates will be verified for office compliance.
                </p>
              </div>
            </main>
          </motion.div>
        )}

        {/* ═══ FIELD CHECK-IN (3-step) ═══ */}
        {view === 'field' && (
          <motion.div key="field" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="flex-1 flex flex-col">
            <PageHeader user={user} title="Workforce" showBack onBack={() => setView('office')} />
             
            {fieldStep === 1 && (
              <div className="flex-1 flex flex-col px-6">
                <div className="mb-10">
                  <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Step 01 of 03</p>
                  <h2 className="text-2xl font-bold text-navy tracking-tight">Take a Photo</h2>
                </div>
                <p className="text-sm text-navy/50 font-medium mb-12 max-w-[280px]">Capture a clear photo of yourself at the site entrance.</p>
                
                <div className="relative flex-1 rounded-3xl border-2 border-dashed border-navy/10 flex flex-col items-center justify-center mb-8 overflow-hidden bg-white/50">
                  {fieldPhoto ? (
                     <img src={fieldPhoto.previewUrl} alt="Capture preview" className="w-full h-full object-cover rounded-3xl" />
                  ) : (
                    <>
                      <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-navy/10 rounded-tl-xl"></div>
                      <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-navy/10 rounded-tr-xl"></div>
                      <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-navy/10 rounded-bl-xl"></div>
                      <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-navy/10 rounded-br-xl"></div>
                      <div className="w-16 h-16 rounded-3xl bg-indigo flex items-center justify-center text-white shadow-xl shadow-indigo/20">
                        <Camera size={32} />
                      </div>
                      <p className="mt-6 text-sm font-bold text-navy">Camera Ready</p>
                      <p className="text-[10px] font-bold text-navy/20 uppercase tracking-widest mt-1">Tap Below To Authorize</p>
                    </>
                  )}
                </div>

                <div className="pb-32 space-y-6">
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment" 
                    ref={fileInputRef} 
                    className="hidden"
                    onChange={handlePhotoCapture}
                  />
                  <button 
                    onClick={() => fileInputRef.current?.click()} 
                    className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press"
                  >
                    <Camera size={20} /> {fieldPhoto ? 'Retake Photo' : 'Open Camera'}
                  </button>
                  {fieldPhoto && (
                    <button 
                      onClick={() => setFieldStep(2)} 
                      className="w-full bg-white text-navy card-shadow py-5 rounded-2xl font-bold flex items-center justify-center gap-3 tactile-press"
                    >
                      Use Photo <ArrowRight size={20} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {fieldStep === 2 && (
              <div className="px-6 flex-1 flex flex-col">
                <div className="mb-10">
                  <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">Step 02 of 03</p>
                  <h2 className="text-2xl font-bold text-navy tracking-tight">Write a Note</h2>
                </div>
                <p className="text-sm text-navy/50 font-medium mb-8">Context for your shift or site visit.</p>
                
                <Card className="flex-1 max-h-[300px] p-6 bg-white flex flex-col border-none card-shadow">
                  <div className="flex gap-2 text-indigo mb-4 opacity-40"><ChevronRight size={18} /></div>
                  <textarea 
                    value={fieldNote}
                    onChange={(e) => setFieldNote(e.target.value)}
                    placeholder="Where are you? What are you doing today?"
                    className="w-full flex-1 bg-transparent border-none outline-none text-navy font-medium placeholder:text-navy/20 resize-none text-base"
                    maxLength={1000}
                  />
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo"></div>
                      <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Status: Draft</p>
                    </div>
                    <p className="text-[10px] font-bold text-navy/20 font-mono">{fieldNote.length} / 1000</p>
                  </div>
                </Card>

                <div className="pb-32 pt-8 flex gap-4">
                  <button onClick={() => setFieldStep(1)} className="p-5 rounded-2xl bg-white text-navy font-bold flex items-center gap-2 tactile-press card-shadow"><ArrowRight size={20} className="rotate-180" /> Back</button>
                  <button onClick={() => setFieldStep(3)} disabled={!fieldNote.trim()} className="flex-1 gradient-primary text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-3 tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50">Next Step <ArrowRight size={20} /></button>
                </div>
              </div>
            )}

            {fieldStep === 3 && (
              <div className="px-6 flex-1 flex flex-col overflow-y-auto">
                <div className="flex items-center justify-between mb-8">
                  <button onClick={() => setFieldStep(2)} className="p-2 -ml-2 text-navy/60"><ArrowRight className="rotate-180" size={20} /></button>
                  <h3 className="text-base font-bold text-navy">Confirm Submission</h3>
                  <p className="text-[9px] font-extrabold bg-indigo/10 text-indigo px-3 py-1 rounded-full uppercase tracking-widest">Step 03/03</p>
                </div>

                <div className="text-center mb-8">
                  <div className="w-16 h-16 bg-emerald/10 text-emerald rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald/20 shadow-xl shadow-emerald/5">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-navy mb-2">Review & Finalize</h4>
                  <p className="text-xs text-navy/40 font-medium px-8">Verify your field entry details.</p>
                </div>

                <div className="space-y-4 mb-32">
                  <Card className="p-4 bg-white border-none card-shadow flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-navy/5 overflow-hidden">
                      <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0B1C30&color=fff`} alt="Selfie" />
                    </div>
                    <div>
                      <p className="text-[8px] font-bold text-navy/30 uppercase tracking-widest mb-1 font-mono">Activity Note</p>
                      <p className="text-xs font-semibold text-navy italic">"{fieldNote || 'No note'}"</p>
                    </div>
                  </Card>

                  <div className="py-8 space-y-6">
                    <button 
                      disabled={isSubmitting || isUploading || !!todayRecord || gpsStatus === 'fetching' || gpsStatus === 'error'}
                      onClick={() => handleCheckIn('field')}
                      className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50"
                    >
                      {isSubmitting || isUploading ? <Loader2 className="animate-spin" size={22} /> : (
                        todayRecord ? 'Already Checked In' : <>Upload & Submit Field Data <ArrowRight size={20} /></>
                      )}
                    </button>
                    {(isSubmitting || isUploading) && (
                      <p className="text-center text-[10px] font-mono text-indigo uppercase font-bold tracking-widest animate-pulse">
                        {isUploading ? 'Transferring visual to AWS S3...' : 'Securing block record...'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Nav */}
      <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-8 pb-6 z-50">
        <nav className="p-2 sm:p-3 flex items-center justify-between glass rounded-[28px] card-shadow">
          <NavItem icon={Home} label="Home" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavItem icon={Fingerprint} label="Attendance" active={view === 'office' || view === 'field'} onClick={() => setView('office')} />
          <NavItem icon={Wallet} label="Money" />
          <NavItem icon={Bell} label="Alerts" />
          <NavItem icon={User} label="Profile" />
        </nav>
      </footer>
    </div>
  );
};

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center gap-1 p-3 rounded-[20px] transition-all duration-300 ${active ? 'bg-indigo/10 text-indigo' : 'text-navy/30 hover:text-navy/60'}`}
  >
    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[8px] font-extrabold uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0'}`}>{label}</span>
  </button>
);
