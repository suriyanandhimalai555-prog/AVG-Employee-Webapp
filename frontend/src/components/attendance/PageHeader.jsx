import { useSelector, useDispatch } from 'react-redux';
import { useNavigate, useLocation, matchPath } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { Avatar } from '../Avatar';
import { apiSlice, useLogoutMutation } from '../../store/api/apiSlice';
import { clearCredentials, selectCurrentUser } from '../../store/slices/authSlice';

// Primary tab routes — show brand + user-info, no back button
const TAB_ROUTES = new Set(['/', '/attendance', '/alerts', '/branches', '/money', '/schemes']);

// These route prefixes manage their own back navigation (SchemePageHeader / inline arrows).
// PageHeader stays in brand-only mode so there is never a duplicate back button.
const SELF_NAVIGATING_PREFIXES = ['/money/schemes', '/money/incentives'];

const pageManagesOwnBack = (pathname) =>
  SELF_NAVIGATING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );

// Human-readable title shown in the header on sub-pages.
const getPageTitle = (pathname) => {
  if (matchPath('/attendance/office', pathname))           return 'Office Check-In';
  if (matchPath('/attendance/field', pathname))            return 'Field Check-In';
  if (matchPath('/user-management', pathname))             return 'Staff';
  if (matchPath('/profile', pathname))                     return 'Profile';
  if (matchPath('/money/submit', pathname))                return 'Submit Collection';
  if (matchPath('/money/history', pathname))               return 'History';
  if (matchPath('/money/wallet', pathname))                return 'Wallet';
  if (matchPath('/money/rankings', pathname))              return 'Rankings';
  if (matchPath('/money/add-entry', pathname))             return 'Add Entry';
  if (matchPath('/money/projects', pathname))              return 'Projects';
  if (matchPath('/money/pending-transfers', pathname))     return 'Pending Transfers';
  if (matchPath('/money/salaries', pathname))              return 'Salaries';
  if (matchPath('/money/holders/:id', pathname))           return 'Cash Detail';
  if (matchPath('/control-center', pathname))              return 'Control Center';
  if (matchPath('/control-center/corrections', pathname))  return 'Corrections';
  if (matchPath('/branches/:id', pathname))                return 'Branch';
  if (matchPath('/people/:id/calendar', pathname))         return 'Calendar';
  if (matchPath('/people/:id', pathname))                  return 'Employee';
  if (matchPath('/leadership/:kind', pathname))            return 'Leadership';
  if (matchPath('/schemes/:code', pathname))               return 'Scheme Overview';
  return '';
};

// Section title shown on desktop for primary tab routes (since desktop has no mobile logo).
const getDesktopSectionTitle = (pathname) => {
  if (pathname === '/')                             return 'Dashboard';
  if (pathname.startsWith('/attendance'))           return 'Attendance';
  if (pathname.startsWith('/money'))                return 'Money';
  if (pathname === '/alerts')                       return 'Alerts';
  if (pathname.startsWith('/branches'))             return 'Branches';
  if (pathname.startsWith('/schemes'))              return 'Schemes';
  if (pathname.startsWith('/control-center'))       return 'Control Center';
  if (pathname.startsWith('/user-management'))      return 'Staff';
  if (pathname.startsWith('/profile'))              return 'Profile';
  return getPageTitle(pathname);
};

// In-app hierarchy map — navigate to the logical parent, not browser history.
const getParentRoute = (pathname) => {
  const exact = {
    '/attendance/office':          '/attendance',
    '/attendance/field':           '/attendance',
    '/money/submit':               '/money',
    '/money/history':              '/money',
    '/money/wallet':               '/money',
    '/money/rankings':             '/money',
    '/money/add-entry':            '/money',
    '/money/projects':             '/money',
    '/money/pending-transfers':    '/money',
    '/money/salaries':             '/money',
    '/control-center/corrections': '/control-center',
    '/profile':                    '/',
    '/user-management':            '/',
    '/control-center':             '/',
  };
  if (exact[pathname]) return exact[pathname];

  if (matchPath('/branches/:branchId', pathname))          return '/branches';
  if (matchPath('/people/:userId/calendar', pathname))     return pathname.replace(/\/calendar$/, '');
  if (matchPath('/people/:userId', pathname))              return '/user-management';
  if (matchPath('/leadership/:kind', pathname))            return '/user-management';
  if (matchPath('/money/holders/:id', pathname))           return '/money';
  if (matchPath('/schemes/:code', pathname))               return '/schemes';

  const parts = pathname.split('/').filter(Boolean);
  return parts.length > 1 ? '/' + parts.slice(0, -1).join('/') : '/';
};

/**
 * Global app navbar — rendered once in Layout, visible on every authenticated page.
 *
 * Mobile:
 *   - AVG brand logo is always visible (navbar never jumps)
 *   - Back button slides in to the left of the logo on eligible sub-pages
 *   - Scheme pages have SchemePageHeader for back nav; we stay brand-only
 *
 * Desktop:
 *   - Left: current section/page title + optional back button
 *   - Right: user name + avatar + logout
 *   - Mobile logo/brand hidden (Sidebar owns it)
 */
export const PageHeader = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const user = useSelector(selectCurrentUser);

  const [logoutApi] = useLogoutMutation();

  const pathname = location.pathname;
  const isTabRoute = TAB_ROUTES.has(pathname);
  const selfManaged = pageManagesOwnBack(pathname);
  const showBack = !isTabRoute && !selfManaged;
  const pageTitle = getPageTitle(pathname);
  const desktopTitle = showBack && pageTitle
    ? pageTitle
    : getDesktopSectionTitle(pathname);

  const handleLogout = async () => {
    try { await logoutApi().unwrap(); } catch { /* clear anyway */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-navy/[0.06] px-5 md:px-8 h-[68px] flex items-center gap-3">

      {/* ── Mobile: back button + brand logo (always visible) ── */}
      <div className="flex md:hidden items-center gap-2 shrink-0">
        {showBack && (
          <button
            onClick={() => navigate(getParentRoute(pathname))}
            aria-label="Go back"
            className="w-10 h-10 rounded-2xl bg-navy/[0.04] flex items-center justify-center text-navy/50 hover:text-navy hover:bg-navy/[0.08] transition-all duration-200 tactile-press shrink-0"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        <img
          src="/AVGLOGO.jpeg"
          alt="AgilaVetri Groups"
          className="w-9 h-9 rounded-[14px] object-cover shadow-md shrink-0"
        />
      </div>

      {/* ── Mobile centre: page title or user context ── */}
      <div className="flex-1 min-w-0 md:hidden">
        {showBack && pageTitle ? (
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

      {/* ── Desktop left: back button + section / page title ── */}
      <div className="hidden md:flex items-center gap-2.5 shrink-0">
        {showBack && (
          <button
            onClick={() => navigate(getParentRoute(pathname))}
            aria-label="Go back"
            className="w-9 h-9 rounded-xl bg-navy/[0.04] flex items-center justify-center text-navy/40 hover:text-navy hover:bg-navy/[0.08] transition-all duration-200 tactile-press"
          >
            <ChevronLeft size={19} />
          </button>
        )}
        <div>
          {/* Breadcrumb label */}
          {!showBack && (
            <p className="text-[9px] font-bold text-navy/25 uppercase tracking-[0.22em] font-mono leading-none mb-0.5">
              {user?.branchName || 'Organization'}
            </p>
          )}
          <p className="text-[15px] font-bold text-navy tracking-tight leading-none">
            {desktopTitle}
          </p>
        </div>
      </div>

      {/* ── Desktop centre spacer ── */}
      <div className="hidden md:block flex-1" />

      {/* ── Mobile right: logout + avatar ── */}
      <div className="flex md:hidden items-center gap-1.5 shrink-0">
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-9 h-9 rounded-2xl bg-navy/[0.04] text-navy/30 hover:text-red-500 hover:bg-red-50 transition-all duration-200 flex items-center justify-center tactile-press group"
        >
          <LogOut size={17} className="group-hover:rotate-12 transition-transform duration-200" aria-hidden="true" />
        </button>
        <button
          onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-[12px] overflow-hidden ring-2 ring-indigo/15 hover:ring-indigo/35 transition-all duration-200 shrink-0 tactile-press"
        >
          <Avatar url={user?.profilePhotoUrl} name={user?.name} size={36} />
        </button>
      </div>

      {/* ── Desktop right: user name + avatar + logout ── */}
      <div className="hidden md:flex items-center gap-2.5 shrink-0">
        <div className="text-right hidden lg:block">
          <p className="text-xs font-bold text-navy/70 leading-none">{user?.name}</p>
          <p className="text-[9px] font-medium text-navy/30 uppercase tracking-wide mt-0.5">
            {(user?.role || '').replace(/_/g, ' ')}
          </p>
        </div>
        <button
          onClick={() => navigate('/profile')}
          className="w-9 h-9 rounded-xl overflow-hidden ring-2 ring-navy/[0.08] hover:ring-indigo/30 transition-all duration-200 shrink-0 tactile-press"
        >
          <Avatar url={user?.profilePhotoUrl} name={user?.name} size={36} />
        </button>
        <button
          onClick={handleLogout}
          title="Logout"
          className="w-9 h-9 rounded-xl bg-navy/[0.03] text-navy/25 hover:text-red-500 hover:bg-red-50 transition-all duration-200 flex items-center justify-center tactile-press group"
        >
          <LogOut size={16} className="group-hover:rotate-12 transition-transform duration-200" aria-hidden="true" />
        </button>
      </div>

    </header>
  );
};
