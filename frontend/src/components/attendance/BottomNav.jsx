import { useNavigate } from 'react-router-dom';
import { useNavTabs } from '../layout/nav-tabs';

const NavItem = ({ icon: Icon, label, active, hasAlert, onClick }) => (
  <button
    onClick={onClick}
    type="button"
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`relative flex flex-col items-center gap-1.5 px-4 py-2.5 rounded-[18px] transition-all duration-300 tactile-press ${
      active
        ? 'bg-indigo text-white shadow-lg shadow-indigo/25'
        : 'text-navy/35 hover:text-navy/70 hover:bg-navy/5'
    }`}
  >
    <div className="relative">
      <Icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
      {hasAlert && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-white" aria-hidden="true" />
      )}
    </div>
    <span
      className={`text-[8px] font-extrabold uppercase tracking-widest transition-all duration-300 ${
        active ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'
      }`}
    >
      {label}
    </span>
  </button>
);

/**
 * Mobile-only floating bottom navigation. Hidden on md+ where Sidebar takes over.
 */
export const BottomNav = () => {
  const navigate = useNavigate();
  const { tabs, activeTab, pendingAlertCount } = useNavTabs();

  return (
    <footer className="md:hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] px-6 pb-6 pt-2 z-50 pointer-events-none">
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
