import { Home, Fingerprint, Wallet, Bell } from 'lucide-react';

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

export const BottomNav = ({ activeTab, onTabChange }) => (
  <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl px-6 pb-6 pt-2 z-50 pointer-events-none">
    <nav className="p-1.5 flex items-center justify-around glass rounded-[26px] card-shadow pointer-events-auto">
      <NavItem icon={Home}        label="Home"       active={activeTab === 'home'}       onClick={() => onTabChange('home')} />
      <NavItem icon={Fingerprint} label="Attendance" active={activeTab === 'attendance'} onClick={() => onTabChange('attendance')} />
      <NavItem icon={Wallet}      label="Money"      active={activeTab === 'money'}      onClick={() => onTabChange('money')} />
      <NavItem icon={Bell}        label="Alerts"     active={activeTab === 'alerts'}     onClick={() => onTabChange('alerts')} />
    </nav>
  </footer>
);
