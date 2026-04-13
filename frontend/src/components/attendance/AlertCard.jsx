import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Fingerprint, MapPin } from 'lucide-react';

export const AlertCard = ({ isMarked, onAction }) => (
  <AnimatePresence mode="wait">
    {!isMarked || isMarked.status === 'absent' ? (
      <motion.div
        key="alert"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-6 mb-8 p-6 rounded-3xl gradient-yellow flex flex-col items-center text-center shadow-xl shadow-yellow/25"
      >
        <div className="w-12 h-12 rounded-full bg-navy/10 flex items-center justify-center mb-4 shadow-inner">
          <AlertCircle size={24} className="text-navy" />
        </div>
        <h4 className="text-sm font-bold text-navy uppercase tracking-widest mb-1.5 leading-tight">
          Not Marked Yet
        </h4>
        <p className="text-xs text-navy/55 font-medium mb-6 max-w-[200px] leading-relaxed">
          You haven't checked in for today's shift.
        </p>
        <button
          onClick={onAction}
          className="bg-navy text-white px-8 py-3 rounded-xl text-xs font-bold flex items-center gap-2 tactile-press shadow-lg shadow-navy/25 hover:bg-navy/90 transition-colors duration-200"
        >
          <Fingerprint size={15} /> Mark Attendance
        </button>
      </motion.div>
    ) : (
      <motion.div
        key="confirmed"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="mx-6 mb-8 p-5 rounded-3xl bg-emerald/5 border border-emerald/15 flex items-center gap-4"
      >
        <div className="w-11 h-11 rounded-2xl bg-emerald/10 flex items-center justify-center shrink-0">
          <CheckCircle2 size={22} className="text-emerald" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-navy">Checked In Today</h4>
          <p className="text-xs text-navy/40 font-medium mt-0.5 flex items-center gap-1.5">
            {isMarked.mode === 'field' ? (
              <><MapPin size={11} className="text-emerald" /> Field</>
            ) : (
              <><CheckCircle2 size={11} className="text-indigo" /> Office</>
            )}
            <span className="text-navy/20">·</span>
            <span className="capitalize">{isMarked.status}</span>
          </p>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald animate-pulse shrink-0" />
      </motion.div>
    )}
  </AnimatePresence>
);
