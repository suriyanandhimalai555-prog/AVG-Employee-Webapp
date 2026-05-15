// Shared motion wrapper for all scheme pages.
// Centralises the slide-in animation so every scheme page transitions identically.
import { motion } from 'framer-motion';

export const SchemePageWrapper = ({ children, className = 'pb-32 pt-4' }) => (
  <motion.div
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 20 }}
    className={className}
  >
    {children}
  </motion.div>
);
