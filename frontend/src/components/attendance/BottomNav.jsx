import { useState } from 'react';
import { Home, Fingerprint, Wallet, Bell, MoreHorizontal, Building2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-[18px] transition-all duration-300 tactile-press ${
      active
        ? 'bg-indigo text-white shadow-lg shadow-indigo/25'
        : 'text-navy/35 hover:text-navy/70 hover:bg-navy/5'
    }`}
  >
    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[8px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
      active ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
    }`}>
      {label}
    </span>
  </button>
);

export const BottomNav = ({ activeTab, onTabChange, user }) => {
  const [moreOpen, setMoreOpen] = useState(false);

  // Build the "More" menu items based on role
  const moreItems = [];
  if (user?.role === 'md') {
    moreItems.push({ icon: Building2, label: 'Branches', tab: 'branches' });
  }

  const handleMoreItem = (tab) => {
    setMoreOpen(false);
    onTabChange(tab);
  };

  return (
    <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl px-6 pb-6 pt-2 z-50 pointer-events-none">
      {/* Dropup menu */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 pointer-events-auto"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-[88px] right-6 glass rounded-[22px] card-shadow overflow-hidden pointer-events-auto min-w-[180px]"
            >
              <div className="px-4 pt-3 pb-1">
                <p className="text-[9px] font-bold text-navy/30 uppercase tracking-[0.3em]">More</p>
              </div>
              {moreItems.map(({ icon: Icon, label, tab }) => (
                <button
                  key={tab}
                  onClick={() => handleMoreItem(tab)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-navy/5 transition-colors ${
                    activeTab === tab ? 'text-indigo' : 'text-navy'
                  }`}
                >
                  <Icon size={18} strokeWidth={activeTab === tab ? 2.5 : 2} />
                  <span className="text-xs font-bold">{label}</span>
                  {activeTab === tab && (
                    <span className="ml-auto w-1.5 h-1.5 rounded-full bg-indigo" />
                  )}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <nav className="p-1.5 flex items-center justify-around glass rounded-[26px] card-shadow pointer-events-auto">
        <NavItem icon={Home}        label="Home"       active={activeTab === 'home'}       onClick={() => onTabChange('home')} />
        <NavItem icon={Fingerprint} label="Attendance" active={activeTab === 'attendance'} onClick={() => onTabChange('attendance')} />
        <NavItem icon={Wallet}      label="Money"      active={activeTab === 'money'}      onClick={() => onTabChange('money')} />
        <NavItem icon={Bell}        label="Alerts"     active={activeTab === 'alerts'}     onClick={() => onTabChange('alerts')} />
        {moreItems.length > 0 && (
          <button
            onClick={() => setMoreOpen(o => !o)}
            className={`relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-[18px] transition-all duration-300 tactile-press ${
              moreOpen || activeTab === 'branches'
                ? 'bg-navy/10 text-navy'
                : 'text-navy/35 hover:text-navy/70 hover:bg-navy/5'
            }`}
          >
            {moreOpen ? <X size={20} strokeWidth={2.5} /> : <MoreHorizontal size={20} strokeWidth={2} />}
            <span className={`text-[8px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
              moreOpen || activeTab === 'branches' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
            }`}>
              More
            </span>
          </button>
        )}
      </nav>
    </footer>
  );
};
