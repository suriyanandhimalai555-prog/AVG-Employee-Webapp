import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { modal, fade } from '../lib/motion';

export const GlassModal = ({ isOpen, onClose, title, children }) => {
  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-6 pointer-events-none">
          {/* Backdrop */}
          <motion.div
            variants={fade}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm pointer-events-auto"
          />

          {/* Sheet — slides up on mobile, settles with a spring on desktop */}
          <motion.div
            variants={modal}
            initial="initial"
            animate="animate"
            exit="exit"
            className="relative w-full max-w-lg glass rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl shadow-navy/20 max-h-[90vh] flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <div className="px-7 pt-6 pb-5 border-b border-border flex items-center justify-between shrink-0">
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
    </AnimatePresence>,
    document.body
  );
};
