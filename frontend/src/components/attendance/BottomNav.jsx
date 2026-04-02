import { Home, Fingerprint, Wallet, Bell } from 'lucide-react';

const NavItem = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1 p-3 rounded-[20px] transition-all duration-300 ${
      active ? 'bg-indigo/10 text-indigo' : 'text-navy/30 hover:text-navy/60'
    }`}
  >
    <Icon size={20} strokeWidth={active ? 2.5 : 2} />
    <span className={`text-[8px] font-extrabold uppercase tracking-widest ${active ? 'opacity-100' : 'opacity-0'}`}>
      {label}
    </span>
  </button>
);

export const BottomNav = ({ activeTab, onTabChange }) => (
  <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] px-8 pb-6 z-50">
    <nav className="p-2 sm:p-3 flex items-center justify-around glass rounded-[28px] card-shadow">
      <NavItem icon={Home}        label="Home"       active={activeTab === 'home'}       onClick={() => onTabChange('home')} />
      <NavItem icon={Fingerprint} label="Attendance" active={activeTab === 'attendance'} onClick={() => onTabChange('attendance')} />
      <NavItem icon={Wallet}      label="Money"      active={activeTab === 'money'}      onClick={() => onTabChange('money')} />
      <NavItem icon={Bell}        label="Alerts"     active={activeTab === 'alerts'}     onClick={() => onTabChange('alerts')} />
    </nav>
  </footer>
);
