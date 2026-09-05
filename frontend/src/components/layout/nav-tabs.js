import { Home, Fingerprint, Wallet, Bell, UserCircle2, Building2, Layers, Settings2, Award } from 'lucide-react';
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

export const MD_TAB             = { key: 'branches',       icon: Building2, label: 'Branches',    path: '/branches' };
export const CONTROL_CENTER_TAB = { key: 'control-center', icon: Settings2, label: 'Control',     path: '/control-center' };
// Incentive overview tab — visible to MD and Management only.
export const INCENTIVES_TAB     = { key: 'incentives',     icon: Award,     label: 'Incentives',  path: '/incentives-overview' };

// Cross-scheme dashboard. Visible to MD, Director and Management only — the page
// itself is gated again server-side, so this is purely a discoverability hint.
export const SCHEMES_TAB = { key: 'schemes', icon: Layers, label: 'Schemes', path: '/schemes' };

export const getActiveTab = (pathname) => {
  if (pathname === '/') return 'home';
  if (pathname.startsWith('/attendance')) return 'attendance';
  if (pathname.startsWith('/branches')) return 'branches';
  if (pathname === '/schemes' || pathname.startsWith('/schemes/')) return 'schemes';
  if (pathname.startsWith('/control-center'))     return 'control-center';
  if (pathname.startsWith('/incentives-overview')) return 'incentives';
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

  const role = currentUser?.role;

  const baseTabs = role === 'oa'
    ? NAV_TABS.filter((t) => t.key !== 'money')
    : role === 'management'
    // management: no attendance; gains the Control Center tab
    ? NAV_TABS.filter((t) => t.key !== 'attendance')
    : NAV_TABS;

  // Management gets a dedicated Control Center tab for scheme configuration
  const managementTabs = role === 'management' ? [CONTROL_CENTER_TAB] : [];
  const showSchemes = role === 'md' || role === 'director' || role === 'management';
  // MD_TAB is the shared Branches tab — MD gets the classic page, management gets
  // the new full-featured page (role-dispatched inside BranchesRoute in App.jsx).
  // INCENTIVES_TAB is visible to md and management so they can see the branch-wise
  // incentive breakdown without going through Control Center.
  const showIncentivesOverview = role === 'md' || role === 'management';
  const tabs = [
    ...baseTabs,
    ...(showSchemes ? [SCHEMES_TAB] : []),
    ...(role === 'md' || role === 'management' ? [MD_TAB] : []),
    ...(showIncentivesOverview ? [INCENTIVES_TAB] : []),
    ...managementTabs,
  ];
  const activeTab = getActiveTab(location.pathname);

  return { tabs, activeTab, pendingAlertCount, currentUser };
};
