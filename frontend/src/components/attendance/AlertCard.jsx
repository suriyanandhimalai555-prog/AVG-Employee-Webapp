import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Fingerprint } from 'lucide-react';

export const AlertCard = ({ isMarked, onAction }) => (
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
        <h4 className="text-sm font-bold text-navy uppercase tracking-widest mb-1 leading-tight">
          Not Marked Yet
        </h4>
        <p className="text-xs text-navy/60 font-medium mb-6">
          You haven't checked in for today's shift.
        </p>
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
