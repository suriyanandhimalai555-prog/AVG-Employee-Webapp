import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

export const GlassModal = ({ isOpen, onClose, title, children }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-6">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy/25 backdrop-blur-sm"
          />

          {/* Sheet — slides up on mobile, scales in on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.98 }}
            animate={{ opacity: 1, y: 0,  scale: 1 }}
            exit={{  opacity: 0, y: 40, scale: 0.98 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="relative w-full max-w-lg glass rounded-t-[32px] sm:rounded-[32px] overflow-hidden shadow-2xl shadow-navy/15 max-h-[90vh] flex flex-col"
          >
            {/* Header */}
            <div className="px-7 pt-6 pb-5 border-b border-navy/6 flex items-center justify-between shrink-0">
              <h2 className="text-xl font-bold text-navy tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-navy/40 hover:text-navy hover:bg-navy/8 transition-all duration-200 tactile-press"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="px-7 py-6 overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
