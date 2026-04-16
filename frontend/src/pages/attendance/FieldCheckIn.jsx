import { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Camera, ArrowRight, CheckCircle2, ChevronRight, Loader2, LogOut } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/attendance/PageHeader';
import { useCheckIn } from './hooks/useCheckIn';
import { useSignOff } from './hooks/useSignOff';
import { selectCurrentUser } from '../../store/slices/authSlice';

export const FieldCheckIn = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const {
    todayRecord,
    gpsStatus,
    gpsPermissionDenied,
    fetchGps,
    fieldStep,
    setFieldStep,
    fieldNote,
    setFieldNote,
    fieldPhoto,
    isSubmitting,
    isUploading,
    fileInputRef,
    handlePhotoCapture,
    handleCheckIn,
  } = useCheckIn({ onSuccess: () => navigate('/') });

  const {
    fetchGps: fetchSignOffGps,
    gpsStatus: signOffGpsStatus,
    isSubmitting: isSigningOff,
    signOffError,
    handleSignOff,
  } = useSignOff();

  // Start GPS fetch on mount
  useEffect(() => {
    fetchGps();
    fetchSignOffGps();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <motion.div
      key="field"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex-1 flex flex-col"
    >
      <PageHeader user={user} title="Workforce" showBack onBack={() => navigate('/attendance/office')} />

      {/* ── Step 1: Photo ── */}
      {fieldStep === 1 && (
        <div className="flex-1 flex flex-col px-6">
          <div className="mb-10">
            <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">
              Step 01 of 03
            </p>
            <h2 className="text-2xl font-bold text-navy tracking-tight">Take a Photo</h2>
          </div>
          <p className="text-sm text-navy/50 font-medium mb-12 max-w-[280px]">
            Capture a clear photo of yourself at the site entrance.
          </p>

          <div className="relative flex-1 rounded-3xl border-2 border-dashed border-navy/10 flex flex-col items-center justify-center mb-8 overflow-hidden bg-white/50">
            {fieldPhoto ? (
              <img
                src={fieldPhoto.previewUrl}
                alt="Capture preview"
                className="w-full h-full object-cover rounded-3xl"
              />
            ) : (
              <>
                <div className="absolute top-8 left-8 w-12 h-12 border-t-4 border-l-4 border-navy/10 rounded-tl-xl" />
                <div className="absolute top-8 right-8 w-12 h-12 border-t-4 border-r-4 border-navy/10 rounded-tr-xl" />
                <div className="absolute bottom-8 left-8 w-12 h-12 border-b-4 border-l-4 border-navy/10 rounded-bl-xl" />
                <div className="absolute bottom-8 right-8 w-12 h-12 border-b-4 border-r-4 border-navy/10 rounded-br-xl" />
                <div className="w-16 h-16 rounded-3xl bg-indigo flex items-center justify-center text-white shadow-xl shadow-indigo/20">
                  <Camera size={32} />
                </div>
                <p className="mt-6 text-sm font-bold text-navy">Camera Ready</p>
                <p className="text-[10px] font-bold text-navy/20 uppercase tracking-widest mt-1">
                  Tap Below To Authorize
                </p>
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

      {/* ── Step 2: Note ── */}
      {fieldStep === 2 && (
        <div className="px-6 flex-1 flex flex-col">
          <div className="mb-10">
            <p className="text-[10px] font-bold text-indigo uppercase tracking-[0.2em] mb-1 font-mono">
              Step 02 of 03
            </p>
            <h2 className="text-2xl font-bold text-navy tracking-tight">Write a Note</h2>
          </div>
          <p className="text-sm text-navy/50 font-medium mb-8">Context for your shift or site visit.</p>

          <Card className="flex-1 max-h-[300px] p-6 bg-white flex flex-col border-none card-shadow">
            <div className="flex gap-2 text-indigo mb-4 opacity-40">
              <ChevronRight size={18} />
            </div>
            <textarea
              value={fieldNote}
              onChange={(e) => setFieldNote(e.target.value)}
              placeholder="Where are you? What are you doing today?"
              className="w-full flex-1 bg-transparent border-none outline-none text-navy font-medium placeholder:text-navy/20 resize-none text-base"
              maxLength={1000}
            />
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo" />
                <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Status: Draft</p>
              </div>
              <p className="text-[10px] font-bold text-navy/20 font-mono">{fieldNote.length} / 1000</p>
            </div>
          </Card>

          <div className="pb-32 pt-8 flex gap-4">
            <button
              onClick={() => setFieldStep(1)}
              className="p-5 rounded-2xl bg-white text-navy font-bold flex items-center gap-2 tactile-press card-shadow"
            >
              <ArrowRight size={20} className="rotate-180" /> Back
            </button>
            <button
              onClick={() => setFieldStep(3)}
              disabled={!fieldNote.trim()}
              className="flex-1 gradient-primary text-white p-5 rounded-2xl font-bold flex items-center justify-center gap-3 tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50"
            >
              Next Step <ArrowRight size={20} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Confirm ── */}
      {fieldStep === 3 && (
        <div className="px-6 flex-1 flex flex-col overflow-y-auto">
          <div className="flex items-center justify-between mb-8">
            <button onClick={() => setFieldStep(2)} className="p-2 -ml-2 text-navy/60">
              <ArrowRight className="rotate-180" size={20} />
            </button>
            <h3 className="text-base font-bold text-navy">Confirm Submission</h3>
            <p className="text-[9px] font-extrabold bg-indigo/10 text-indigo px-3 py-1 rounded-full uppercase tracking-widest">
              Step 03/03
            </p>
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
                <Avatar url={user?.profilePhotoUrl} name={user?.name} />
              </div>
              <div>
                <p className="text-[8px] font-bold text-navy/30 uppercase tracking-widest mb-1 font-mono">
                  Activity Note
                </p>
                <p className="text-xs font-semibold text-navy italic">"{fieldNote || 'No note'}"</p>
              </div>
            </Card>

            <div className="py-8 space-y-4">
              {todayRecord?.check_in_time && todayRecord?.check_out_time ? (
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
                <>
                  <div className="w-full bg-indigo/5 border border-indigo/20 rounded-2xl p-4 flex items-center gap-3">
                    <CheckCircle2 size={18} className="text-indigo shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-navy">Checked In (Field)</p>
                      <p className="text-[10px] font-mono text-navy/40">
                        {new Date(todayRecord.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={isSigningOff || signOffGpsStatus === 'fetching'}
                    onClick={handleSignOff}
                    className="w-full bg-amber-500 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-amber-500/20 tactile-press disabled:opacity-50"
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
                <>
                  <button
                    disabled={isSubmitting || isUploading || gpsStatus === 'fetching'}
                    onClick={() => handleCheckIn('field')}
                    className="w-full gradient-primary text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl shadow-indigo/20 tactile-press disabled:opacity-50"
                  >
                    {isSubmitting || isUploading
                      ? <Loader2 className="animate-spin" size={22} />
                      : gpsStatus === 'error'
                        ? <>Retry Location & Submit <ArrowRight size={20} /></>
                        : <>Upload & Submit Field Data <ArrowRight size={20} /></>}
                  </button>
                  {gpsStatus === 'error' && (
                    <p className="text-center text-[10px] leading-relaxed px-8 font-medium text-amber-600">
                      {gpsPermissionDenied
                        ? 'Location access is blocked — enable it in your browser settings, then tap the button to retry.'
                        : 'Location unavailable — tap the button above to request access again.'}
                    </p>
                  )}
                  {(isSubmitting || isUploading) && (
                    <p className="text-center text-[10px] font-mono text-indigo uppercase font-bold tracking-widest animate-pulse">
                      {isUploading ? 'Transferring visual to AWS S3...' : 'Securing block record...'}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
