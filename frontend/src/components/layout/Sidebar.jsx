import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

import { Avatar } from '../Avatar';
import { apiSlice, useLogoutMutation } from '../../store/api/apiSlice';
import { clearCredentials } from '../../store/slices/authSlice';
import { useNavTabs } from './nav-tabs';

/**
 * Desktop primary navigation. Hidden on mobile — the BottomNav handles that.
 * Pinned to the viewport so navigating between pages feels instant.
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
      className="hidden md:flex sticky top-0 h-screen w-[260px] lg:w-[280px] shrink-0 flex-col bg-white border-r border-navy/[0.06] z-40"
      aria-label="Primary"
    >
      {/* Brand */}
      <div className="px-6 h-[68px] flex items-center gap-3 border-b border-navy/[0.06]">
        <div className="w-10 h-10 rounded-[14px] gradient-primary flex items-center justify-center shadow-lg shadow-indigo/30">
          <span className="text-white text-[11px] font-black tracking-tight leading-none select-none">AVG</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-black text-navy tracking-tight leading-none">AVG</p>
          <p className="text-[10px] font-bold text-navy/40 uppercase tracking-[0.18em] mt-1 truncate">
            {currentUser?.branchName || 'Organization'}
          </p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {tabs.map(({ key, icon: Icon, label, path }) => {
          const active = activeTab === key;
          const showAlert = key === 'alerts' && pendingAlertCount > 0;
          return (
            <button
              key={key}
              onClick={() => navigate(path)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold tactile-press transition-all duration-200 ${
                active
                  ? 'bg-indigo text-white shadow-lg shadow-indigo/25'
                  : 'text-navy/60 hover:text-navy hover:bg-navy/[0.04]'
              }`}
            >
              <span className="relative inline-flex">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {showAlert && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border-2 border-white" />
                )}
              </span>
              <span className="truncate">{label}</span>
              {showAlert && (
                <span className="ml-auto text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500 text-white">
                  {pendingAlertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User card / logout */}
      <div className="p-3 border-t border-navy/[0.06]">
        <div className="flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-navy/[0.04] transition-colors">
          <button
            onClick={() => navigate('/profile')}
            className="w-10 h-10 rounded-[12px] overflow-hidden ring-2 ring-indigo/15 hover:ring-indigo/35 transition-all duration-200 shrink-0 tactile-press"
            aria-label="Open profile"
          >
            <Avatar url={currentUser?.profilePhotoUrl} name={currentUser?.name} size={40} />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-navy truncate">{currentUser?.name}</p>
            <p className="text-[10px] font-semibold text-navy/40 uppercase tracking-wider truncate">
              {(currentUser?.role || '').replace(/_/g, ' ')}
            </p>
          </div>
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-9 h-9 rounded-2xl bg-navy/[0.04] text-navy/40 hover:text-red-500 hover:bg-red-50 transition-all duration-200 flex items-center justify-center tactile-press group shrink-0"
          >
            <LogOut size={16} className="group-hover:rotate-12 transition-transform duration-200" />
          </button>
        </div>
      </div>
    </aside>
  );
};
