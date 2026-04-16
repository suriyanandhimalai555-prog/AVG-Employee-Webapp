import { useLocation, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { Home, Fingerprint, Wallet, Bell, UserCircle2, Building2 } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetMoneyCollectionsQuery } from '../../store/api/apiSlice';

const NAV_TABS = [
  { key: 'home',       icon: Home,        label: 'Home',       path: '/' },
  { key: 'attendance', icon: Fingerprint, label: 'Attendance', path: '/attendance' },
  { key: 'money',      icon: Wallet,      label: 'Money',      path: '/money' },
  { key: 'alerts',     icon: Bell,        label: 'Alerts',     path: '/alerts' },
  { key: 'profile',    icon: UserCircle2, label: 'Profile',    path: '/profile' },
];

const MD_TAB = { key: 'branches', icon: Building2, label: 'Branches', path: '/branches' };

const NavItem = ({ icon: Icon, label, active, hasAlert, onClick }) => (
  <button
    onClick={onClick}
    className={`relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-[18px] transition-all duration-300 tactile-press ${
      active
        ? 'bg-indigo text-white shadow-lg shadow-indigo/25'
        : 'text-navy/35 hover:text-navy/70 hover:bg-navy/5'
    }`}
  >
    <div className="relative">
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      {hasAlert && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />
      )}
    </div>
    <span className={`text-[8px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
      active ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
    }`}>
      {label}
    </span>
  </button>
);

const getActiveTab = (pathname) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/attendance')) return 'attendance';
  if (pathname.startsWith('/branches')) return 'branches';
  if (pathname.startsWith('/money')) return 'money';
  if (pathname === '/alerts') return 'alerts';
  if (pathname === '/profile') return 'profile';
  return null;
};

export const BottomNav = ({ user }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = useSelector(selectCurrentUser);

  // Pending alerts count — served from RTK cache (AlertsTab runs the same query)
  const { data: collectionsResult } = useGetMoneyCollectionsQuery(
    { status: 'pending' },
    { skip: !currentUser?.id }
  );
  const pendingAlertCount = (collectionsResult?.data || []).filter(
    c => c.assigned_verifier_id === currentUser?.id
  ).length;

  const activeTab = getActiveTab(location.pathname);
  const tabs = user?.role === 'md' ? [...NAV_TABS, MD_TAB] : NAV_TABS;

  return (
    <footer className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl xl:max-w-[1360px] px-6 pb-6 pt-2 z-50 pointer-events-none transition-all duration-500">
      <nav className="p-1.5 flex items-center justify-around glass rounded-[26px] card-shadow pointer-events-auto overflow-x-auto no-scrollbar">
        {tabs.map((tab) => (
          <NavItem
            key={tab.key}
            icon={tab.icon}
            label={tab.label}
            active={activeTab === tab.key}
            hasAlert={tab.key === 'alerts' && pendingAlertCount > 0}
            onClick={() => navigate(tab.path)}
          />
        ))}
      </nav>
    </footer>
  );
};
