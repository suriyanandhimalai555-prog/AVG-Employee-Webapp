import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { Avatar } from '../Avatar';
import { apiSlice, useLogoutMutation } from '../../store/api/apiSlice';
import { clearCredentials, selectCurrentUser } from '../../store/slices/authSlice';

// Primary tab routes — no back button on these
const TAB_ROUTES = ['/', '/attendance', '/alerts', '/branches', '/money'];

const getPageTitle = (pathname) => {
  if (matchPath('/attendance/office', pathname))   return 'Office Check-In';
  if (matchPath('/attendance/field', pathname))    return 'Field Check-In';
  if (matchPath('/user-management', pathname))     return 'Staff';
  if (matchPath('/profile', pathname))             return 'Profile';
  if (matchPath('/money/submit', pathname))        return 'Submit Collection';
  if (matchPath('/money/history', pathname))       return 'History';
  if (matchPath('/money/wallet', pathname))        return 'Wallet';
  if (matchPath('/money/rankings', pathname))      return 'Rankings';
  if (matchPath('/money/add-entry', pathname))     return 'Add Entry';
  if (matchPath('/money/projects', pathname))      return 'Projects';
  if (matchPath('/branches/:id', pathname))        return 'Branch';
  if (matchPath('/people/:id/calendar', pathname)) return 'Calendar';
  if (matchPath('/people/:id', pathname))          return 'Employee';
  if (matchPath('/leadership/:kind', pathname))    return 'Leadership';
  return '';
};

/**
 * Global app navbar — rendered once in Layout, appears on every authenticated page.
 * Automatically shows a back button on sub-routes and the AVG brand on tab routes.
 */
export const PageHeader = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector(selectCurrentUser);

  const [logoutApi] = useLogoutMutation();

  const isTabRoute = TAB_ROUTES.includes(location.pathname);
  const showBack = !isTabRoute;
  const pageTitle = getPageTitle(location.pathname);

  const handleLogout = async () => {
    try { await logoutApi().unwrap(); } catch { /* clear anyway */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-navy/[0.06] px-5 md:px-8 h-[68px] flex items-center gap-3 transition-all duration-300">

        {/* ── Left: back button OR AVG brand (brand hidden on desktop — Sidebar owns it) ── */}
        {showBack ? (
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-2xl bg-navy/[0.04] flex items-center justify-center text-navy/50 hover:text-navy hover:bg-navy/[0.08] transition-all duration-200 tactile-press shrink-0"
          >
            <ChevronLeft size={22} />
          </button>
        ) : (
          <div className="flex md:hidden items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-[14px] gradient-primary flex items-center justify-center shadow-lg shadow-indigo/30">
              <span className="text-white text-[10px] font-black tracking-tight leading-none select-none">AVG</span>
            </div>
            <span className="text-base font-black text-navy tracking-tight leading-none select-none">AVG</span>
          </div>
        )}

        {/* ── Center ── */}
        <div className="flex-1 min-w-0">
          {showBack ? (
            <p className="text-sm font-bold text-navy truncate">{pageTitle}</p>
          ) : (
            <>
              <p className="text-[9px] font-bold text-navy/25 uppercase tracking-[0.22em] font-mono truncate leading-tight">
                {user?.branchName || 'ORGANIZATION'}
                <span className="text-indigo/40 mx-1">·</span>
                {(user?.role || '').replace(/_/g, ' ')}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse shrink-0" />
                <p className="text-xs font-bold text-navy/60 truncate">{user?.name}</p>
              </div>
            </>
          )}
        </div>

        {/* ── Right: action buttons + avatar (hidden on desktop — Sidebar owns them) ── */}
        <div className="flex md:hidden items-center gap-1.5 shrink-0">
          <button
            onClick={handleLogout}
            title="Logout"
            className="w-9 h-9 rounded-2xl bg-navy/[0.04] text-navy/30 hover:text-red-500 hover:bg-red-50 transition-all duration-200 flex items-center justify-center tactile-press group"
          >
            <LogOut size={17} className="group-hover:rotate-12 transition-transform duration-200" />
          </button>
          <button
            onClick={() => navigate('/profile')}
            className="w-9 h-9 rounded-[12px] overflow-hidden ring-2 ring-indigo/15 hover:ring-indigo/35 transition-all duration-200 shrink-0 tactile-press"
          >
            <Avatar url={user?.profilePhotoUrl} name={user?.name} size={36} />
          </button>
        </div>
      </header>
    </>
  );
};
