import { Home, Fingerprint, Wallet, Bell, UserCircle2, Building2, Layers } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetMoneyCollectionsQuery } from '../../store/api/apiSlice';

// Single source of truth for primary navigation — used by both BottomNav (mobile)
// and Sidebar (desktop) so they never drift apart.
export const NAV_TABS = [
  { key: 'home',       icon: Home,        label: 'Home',       path: '/' },
  { key: 'attendance', icon: Fingerprint, label: 'Attendance', path: '/attendance' },
  { key: 'money',      icon: Wallet,      label: 'Money',      path: '/money' },
  { key: 'alerts',     icon: Bell,        label: 'Alerts',     path: '/alerts' },
  { key: 'profile',    icon: UserCircle2, label: 'Profile',    path: '/profile' },
];

export const MD_TAB = { key: 'branches', icon: Building2, label: 'Branches', path: '/branches' };

// Cross-scheme dashboard. Visible to MD and Director only — the page itself
// is gated again server-side, so this is purely a discoverability hint.
export const SCHEMES_TAB = { key: 'schemes', icon: Layers, label: 'Schemes', path: '/schemes' };

export const getActiveTab = (pathname) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/attendance')) return 'attendance';
  if (pathname.startsWith('/branches')) return 'branches';
  if (pathname === '/schemes' || pathname.startsWith('/schemes/')) return 'schemes';
  if (pathname.startsWith('/money')) return 'money';
  if (pathname === '/alerts') return 'alerts';
  if (pathname === '/profile') return 'profile';
  return null;
};

/**
 * Resolves the visible nav tabs for the current user and the active tab key.
 * Also exposes the pending-alerts badge count (shared from the RTK Query cache).
 */
export const useNavTabs = () => {
  const location = useLocation();
  const currentUser = useSelector(selectCurrentUser);

  const { data: collectionsResult } = useGetMoneyCollectionsQuery(
    { status: 'pending' },
    { skip: !currentUser?.id }
  );

  const pendingAlertCount = (collectionsResult?.data || []).filter(
    (c) => c.assigned_verifier_id === currentUser?.id
  ).length;

  const baseTabs = currentUser?.role === 'oa'
    ? NAV_TABS.filter((t) => t.key !== 'money')
    : NAV_TABS;

  // MD picks up its Branches tab; MD and Director both pick up the cross-scheme
  // dashboard. Order: ...base, Schemes (md/director), Branches (md only) so the
  // Schemes tab sits next to Money in the bottom bar's natural reading order.
  const role = currentUser?.role;
  const showSchemes = role === 'md' || role === 'director';
  const tabs = [
    ...baseTabs,
    ...(showSchemes ? [SCHEMES_TAB] : []),
    ...(role === 'md' ? [MD_TAB] : []),
  ];
  const activeTab = getActiveTab(location.pathname);

  return { tabs, activeTab, pendingAlertCount, currentUser };
};
