import { Home, Fingerprint, Wallet, Bell, UserCircle2, Building2 } from 'lucide-react';
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

export const getActiveTab = (pathname) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/attendance')) return 'attendance';
  if (pathname.startsWith('/branches')) return 'branches';
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

  const tabs = currentUser?.role === 'md' ? [...baseTabs, MD_TAB] : baseTabs;
  const activeTab = getActiveTab(location.pathname);

  return { tabs, activeTab, pendingAlertCount, currentUser };
};
