import { useLocation, useNavigate } from 'react-router-dom';
import { Home, Fingerprint, Wallet, Bell, UserCircle2, Building2 } from 'lucide-react';

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

export const BottomNav = ({ activeTab: propActiveTab, onTabChange, user }) => {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from URL or props
  let activeTab;
  if (location.pathname === '/profile') {
    activeTab = 'profile';
  } else if (location.pathname === '/money') {
    activeTab = 'money';
  } else {
    activeTab = propActiveTab || 'home';
  }

  const handleTabClick = (tab) => {
    if (tab === 'profile') {
      navigate('/profile');
    } else if (tab === 'money') {
      navigate('/money');
    } else {
      // Home, Attendance, Branches, Alerts are currently handled by AttendanceHome at '/'
      if (location.pathname !== '/') {
        sessionStorage.setItem('attendanceHomeTab', tab);
        navigate('/');
      } else if (onTabChange) {
        onTabChange(tab);
      }
    }
  };

  return (
    <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl px-6 pb-6 pt-2 z-50 pointer-events-none">
      <nav className="p-1.5 flex items-center justify-around glass rounded-[26px] card-shadow pointer-events-auto overflow-x-auto no-scrollbar">
        <NavItem icon={Home}        label="Home"       active={activeTab === 'home'}       onClick={() => handleTabClick('home')} />
        <NavItem icon={Fingerprint} label="Attendance" active={activeTab === 'attendance'} onClick={() => handleTabClick('attendance')} />
        <NavItem icon={Wallet}      label="Money"      active={activeTab === 'money'}      onClick={() => handleTabClick('money')} />
        <NavItem icon={Bell}        label="Alerts"     active={activeTab === 'alerts'}     onClick={() => handleTabClick('alerts')} />
        <NavItem icon={UserCircle2} label="Profile"    active={activeTab === 'profile'}    onClick={() => handleTabClick('profile')} />
        {user?.role === 'md' && (
          <NavItem icon={Building2} label="Branches"   active={activeTab === 'branches'}   onClick={() => handleTabClick('branches')} />
        )}
      </nav>
    </footer>
  );
};

