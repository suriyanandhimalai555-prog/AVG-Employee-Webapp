import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { Wallet } from 'lucide-react';
import { PageHeader } from '../../components/attendance/PageHeader';
import { selectCurrentUser } from '../../store/slices/authSlice';

export const MoneyTab = () => {
  const user = useSelector(selectCurrentUser);
  return (
    <motion.div
      key="money"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1"
    >
      <PageHeader user={user} title="Workforce" />
      <div className="flex flex-col items-center justify-center px-6 py-32">
        <div className="w-20 h-20 rounded-3xl bg-navy/5 flex items-center justify-center text-navy/20 mb-6">
          <Wallet size={36} />
        </div>
        <h2 className="text-2xl font-bold text-navy tracking-tight mb-2">Coming Soon</h2>
        <p className="text-sm font-medium text-navy/40 text-center max-w-[240px]">
          Money tracking module is under development.
        </p>
      </div>
    </motion.div>
  );
};
