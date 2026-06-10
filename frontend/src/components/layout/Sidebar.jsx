import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import { Avatar } from '../Avatar';
import { apiSlice, useLogoutMutation } from '../../store/api/apiSlice';
import { clearCredentials } from '../../store/slices/authSlice';
import { useNavTabs } from './nav-tabs';

/**
 * Desktop primary navigation. Hidden on mobile — the BottomNav handles that.
 * Dark navy sidebar that anchors the two-tone desktop layout.
 */
export const Sidebar = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const { tabs, activeTab, pendingAlertCount, currentUser } = useNavTabs();

  const handleLogout = async () => {
    try { await logoutApi().unwrap(); } catch { /* clear anyway */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  return (
    <aside
      className="hidden md:flex sticky top-0 h-screen w-[260px] lg:w-[280px] shrink-0 flex-col z-40 select-none"
      style={{ background: 'linear-gradient(175deg, #0e2240 0%, #0B1C30 55%, #07131f 100%)' }}
      aria-label="Primary navigation"
    >
      {/* ── Brand ── */}
      <div className="px-5 h-[68px] flex items-center gap-3 border-b border-white/[0.07] shrink-0">
        <img
          src="/AVGLOGO.jpeg"
          alt="AgilaVetri Groups"
          className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/10 shrink-0"
        />
        <div className="min-w-0">
          <p className="text-[13px] font-black text-white tracking-tight leading-none truncate">
            AgilaVetri Groups
          </p>
          <p className="text-[10px] font-medium text-white/30 mt-0.5 truncate tracking-wide">
            {currentUser?.branchName || 'Organization'}
          </p>
        </div>
      </div>

      {/* ── Nav items ── */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {tabs.map(({ key, icon: Icon, label, path }) => {
          const active = activeTab === key;
          const showAlert = key === 'alerts' && pendingAlertCount > 0;
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold tactile-press transition-all duration-200 ${
                active
                  ? 'bg-indigo text-white shadow-lg shadow-indigo/40'
                  : 'text-white/45 hover:text-white/90 hover:bg-white/[0.07]'
              }`}
            >
              <span className="relative inline-flex shrink-0">
                <Icon size={18} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                {showAlert && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-400 border-2 border-[#0B1C30]" />
                )}
              </span>
              <span className="truncate">{label}</span>
              {showAlert && (
                <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-full bg-red-500 text-white leading-none">
                  {pendingAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ── User card + logout ── */}
      <div className="p-3 border-t border-white/[0.07] shrink-0">
        <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-white/[0.05] transition-colors group">
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-xl overflow-hidden ring-2 ring-white/10 hover:ring-indigo/50 transition-all shrink-0 tactile-press"
            aria-label="Open profile"
          >
            <Avatar url={currentUser?.profilePhotoUrl} name={currentUser?.name} size={36} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white/75 truncate">{currentUser?.name}</p>
            <p className="text-[9px] font-medium text-white/30 uppercase tracking-wide truncate">
              {(currentUser?.role || '').replace(/_/g, ' ')}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-8 h-8 rounded-xl text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 flex items-center justify-center tactile-press shrink-0"
          >
            <LogOut size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </aside>
  );
};
