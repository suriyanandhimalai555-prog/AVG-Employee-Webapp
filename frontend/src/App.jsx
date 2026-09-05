import { useEffect, lazy, Suspense } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { selectIsAuthenticated, selectCurrentUser, clearCredentials } from './store/slices/authSlice';
import { useGetMeQuery } from './store/api/apiSlice';

import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { AttendanceHome } from './pages/AttendanceHome';
import { ProfilePage } from './pages/ProfilePage';
import { AttendanceTab } from './pages/attendance/AttendanceTab';
import { OfficeCheckIn } from './pages/attendance/OfficeCheckIn';
import { FieldCheckIn } from './pages/attendance/FieldCheckIn';
import { AlertsTab } from './pages/attendance/AlertsTab';

// Lazy-load the heavier, less frequently hit subtrees so the initial bundle stays
// lean. The everyday flow (Attendance landing + Profile + Login) is eager-loaded;
// money / gold / leadership / people / admin pages download only when first visited.
const MoneyManagementPage      = lazy(() => import('./pages/MoneyManagementPage').then(m => ({ default: m.MoneyManagementPage })));
const MdDailyCollectionPage    = lazy(() => import('./pages/MdDailyCollectionPage').then(m => ({ default: m.MdDailyCollectionPage })));
const IncentivesOverviewPage   = lazy(() => import('./pages/IncentivesOverviewPage').then(m => ({ default: m.IncentivesOverviewPage })));
const MoneyWalletPage          = lazy(() => import('./pages/MoneyWalletPage').then(m => ({ default: m.MoneyWalletPage })));
const BranchRankingsPage       = lazy(() => import('./pages/BranchRankingsPage').then(m => ({ default: m.BranchRankingsPage })));
const MdAddEntryPage           = lazy(() => import('./pages/MdAddEntryPage').then(m => ({ default: m.MdAddEntryPage })));
const ProjectManagementPage    = lazy(() => import('./pages/ProjectManagementPage').then(m => ({ default: m.ProjectManagementPage })));
const CashHolderDetailPage     = lazy(() => import('./pages/CashHolderDetailPage').then(m => ({ default: m.CashHolderDetailPage })));
const MoneyPendingTransfersPage = lazy(() => import('./pages/MoneyPendingTransfersPage').then(m => ({ default: m.MoneyPendingTransfersPage })));
const GoldSchemePage           = lazy(() => import('./pages/schemes/GoldSchemePage').then(m => ({ default: m.GoldSchemePage })));
const GoldSchemeAddPage        = lazy(() => import('./pages/schemes/GoldSchemeAddPage').then(m => ({ default: m.GoldSchemeAddPage })));
const GoldMemberDetailPage     = lazy(() => import('./pages/schemes/GoldMemberDetailPage').then(m => ({ default: m.GoldMemberDetailPage })));
const SchemesPage              = lazy(() => import('./pages/schemes/SchemesPage').then(m => ({ default: m.SchemesPage })));
const PendingEnrollmentsListPage = lazy(() => import('./pages/schemes/PendingEnrollmentsListPage').then(m => ({ default: m.PendingEnrollmentsListPage })));
const PendingEnrollmentDetailPage = lazy(() => import('./pages/schemes/PendingEnrollmentDetailPage').then(m => ({ default: m.PendingEnrollmentDetailPage })));
const IncentiveWalletPage      = lazy(() => import('./pages/schemes/IncentiveWalletPage').then(m => ({ default: m.IncentiveWalletPage })));
const SalaryManagementPage     = lazy(() => import('./pages/SalaryManagementPage').then(m => ({ default: m.SalaryManagementPage })));
const TradingAcademyPage       = lazy(() => import('./pages/schemes/TradingAcademyPage').then(m => ({ default: m.TradingAcademyPage })));
const GoldCoinSchemePage       = lazy(() => import('./pages/schemes/GoldCoinSchemePage').then(m => ({ default: m.GoldCoinSchemePage })));
const GoldCoinRoomDetailPage   = lazy(() => import('./pages/schemes/GoldCoinRoomDetailPage').then(m => ({ default: m.GoldCoinRoomDetailPage })));
const GoldCoinAddSlotPage      = lazy(() => import('./pages/schemes/GoldCoinAddSlotPage').then(m => ({ default: m.GoldCoinAddSlotPage })));
const GoldCoinHeadBranchPage   = lazy(() => import('./pages/schemes/GoldCoinHeadBranchPage').then(m => ({ default: m.GoldCoinHeadBranchPage })));
const LssSchemePage            = lazy(() => import('./pages/schemes/LssSchemePage').then(m => ({ default: m.LssSchemePage })));
const LssRoomDetailPage        = lazy(() => import('./pages/schemes/LssRoomDetailPage').then(m => ({ default: m.LssRoomDetailPage })));
const LssAddSlotPage           = lazy(() => import('./pages/schemes/LssAddSlotPage').then(m => ({ default: m.LssAddSlotPage })));
const LssHeadBranchPage        = lazy(() => import('./pages/schemes/LssHeadBranchPage').then(m => ({ default: m.LssHeadBranchPage })));
const ChitSchemePage           = lazy(() => import('./pages/schemes/ChitSchemePage').then(m => ({ default: m.ChitSchemePage })));
const ChitAddGroupPage         = lazy(() => import('./pages/schemes/ChitAddGroupPage').then(m => ({ default: m.ChitAddGroupPage })));
const ChitGroupDetailPage      = lazy(() => import('./pages/schemes/ChitGroupDetailPage').then(m => ({ default: m.ChitGroupDetailPage })));
const ChitAddMemberPage        = lazy(() => import('./pages/schemes/ChitAddMemberPage').then(m => ({ default: m.ChitAddMemberPage })));
const ChitHeadBranchPage       = lazy(() => import('./pages/schemes/ChitHeadBranchPage').then(m => ({ default: m.ChitHeadBranchPage })));
const BuildersSchemePage           = lazy(() => import('./pages/schemes/BuildersSchemePage').then(m => ({ default: m.BuildersSchemePage })));
const BuildersAddPlanPage          = lazy(() => import('./pages/schemes/BuildersAddPlanPage').then(m => ({ default: m.BuildersAddPlanPage })));
const BuildersPlanDetailPage       = lazy(() => import('./pages/schemes/BuildersPlanDetailPage').then(m => ({ default: m.BuildersPlanDetailPage })));
const BuildersIncentiveRulesPage   = lazy(() => import('./pages/schemes/BuildersIncentiveRulesPage').then(m => ({ default: m.BuildersIncentiveRulesPage })));
const LandSchemePage           = lazy(() => import('./pages/schemes/LandSchemePage').then(m => ({ default: m.LandSchemePage })));
const LandSitesPage            = lazy(() => import('./pages/schemes/LandSitesPage').then(m => ({ default: m.LandSitesPage })));
const LandAddSitePage          = lazy(() => import('./pages/schemes/LandAddSitePage').then(m => ({ default: m.LandAddSitePage })));
const LandSiteDetailPage       = lazy(() => import('./pages/schemes/LandSiteDetailPage').then(m => ({ default: m.LandSiteDetailPage })));
const LandAddLayoutPage        = lazy(() => import('./pages/schemes/LandAddLayoutPage').then(m => ({ default: m.LandAddLayoutPage })));
const LandBookingsPage         = lazy(() => import('./pages/schemes/LandBookingsPage').then(m => ({ default: m.LandBookingsPage })));
const LandAddBookingPage       = lazy(() => import('./pages/schemes/LandAddBookingPage').then(m => ({ default: m.LandAddBookingPage })));
const LandBookingDetailPage    = lazy(() => import('./pages/schemes/LandBookingDetailPage').then(m => ({ default: m.LandBookingDetailPage })));
const LeadershipListPage          = lazy(() => import('./pages/LeadershipListPage').then(m => ({ default: m.LeadershipListPage })));
const ManagementControlCenter     = lazy(() => import('./pages/ManagementControlCenter').then(m => ({ default: m.ManagementControlCenter })));
const SchemesOverviewPage           = lazy(() => import('./pages/SchemesOverviewPage').then(m => ({ default: m.SchemesOverviewPage })));
const ReconciliationDashboardPage   = lazy(() => import('./pages/ReconciliationDashboardPage').then(m => ({ default: m.ReconciliationDashboardPage })));
const SchemeBranchListPage     = lazy(() => import('./pages/SchemeBranchListPage').then(m => ({ default: m.SchemeBranchListPage })));
const SchemeCorrectionsPage    = lazy(() => import('./pages/schemes/SchemeCorrectionsPage').then(m => ({ default: m.SchemeCorrectionsPage })));
const PersonAttendancePage     = lazy(() => import('./pages/PersonAttendancePage').then(m => ({ default: m.PersonAttendancePage })));
const BranchManagement         = lazy(() => import('./pages/BranchManagement').then(m => ({ default: m.BranchManagement })));
const ManagementBranches       = lazy(() => import('./pages/ManagementBranches').then(m => ({ default: m.ManagementBranches })));
const UserManagement           = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const CustomersPage            = lazy(() => import('./pages/CustomersPage').then(m => ({ default: m.CustomersPage })));
const BranchDetailPage         = lazy(() => import('./pages/BranchDetailPage').then(m => ({ default: m.BranchDetailPage })));
const EmployeeCalendarPage     = lazy(() => import('./pages/EmployeeCalendarPage').then(m => ({ default: m.EmployeeCalendarPage })));

const RouteFallback = () => (
  <div className="w-full flex items-center justify-center py-16" role="status" aria-label="Loading page">
    <Loader2 className="animate-spin text-indigo" size={32} />
    <span className="sr-only">Loading</span>
  </div>
);

// BranchesRoute — sends management to the full-featured ManagementBranches page
// (create + edit + deactivate + geofence location) while MD keeps the original
// BranchManagement page unchanged.
function BranchesRoute() {
  const role = useSelector(selectCurrentUser)?.role;
  return role === 'management' ? <ManagementBranches /> : <BranchManagement />;
}

// CustomersRoute — WhatsApp opt-in management. Only roles that can edit customer
// records (PATCH /customers/:id) should reach this page; others land on home.
const CUSTOMER_PAGE_ROLES = new Set(['branch_admin', 'branch_manager', 'management']);
function CustomersRoute() {
  const role = useSelector(selectCurrentUser)?.role;
  return CUSTOMER_PAGE_ROLES.has(role) ? <CustomersPage /> : <Navigate to="/" replace />;
}

function ProtectedLayout() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return (
    <Suspense fallback={<RouteFallback />}>
      <Layout />
    </Suspense>
  );
}

function App() {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);

  const { isLoading: isMeLoading, isError: isMeError } = useGetMeQuery(undefined, {
    skip: !isAuthenticated,
  });

  useEffect(() => {
    if (isMeError) dispatch(clearCredentials());
  }, [isMeError, dispatch]);

  if (isAuthenticated && isMeLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo" size={40} />
      </div>
    );
  }

  return (
    <Routes>
      {/* Redirect authenticated users away from login */}
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />

      <Route element={<ProtectedLayout />}>
        {/* Home */}
        <Route path="/"                          element={<AttendanceHome />} />

        {/* Attendance */}
        <Route path="/attendance"                element={<AttendanceTab />} />
        <Route path="/attendance/office"         element={<OfficeCheckIn />} />
        <Route path="/attendance/field"          element={<FieldCheckIn />} />

        {/* Tabs */}
        <Route path="/alerts"                    element={<AlertsTab />} />
        <Route path="/schemes"                   element={<SchemesOverviewPage />} />
        <Route path="/schemes/:code"             element={<SchemeBranchListPage />} />
        <Route path="/branches"                  element={<BranchesRoute />} />
        <Route path="/branches/:branchId"        element={<BranchDetailPage />} />

        {/* Staff management */}
        <Route path="/user-management"           element={<UserManagement />} />

        {/* Customer WhatsApp notification management */}
        <Route path="/customers"                 element={<CustomersRoute />} />

        {/* People */}
        <Route path="/people/:userId"            element={<PersonAttendancePage />} />
        <Route path="/people/:userId/calendar"   element={<EmployeeCalendarPage />} />

        {/* Profile */}
        <Route path="/profile"                   element={<ProfilePage />} />

        {/* Money */}
        <Route path="/money"                     element={<MoneyManagementPage />} />
        <Route path="/money/wallet"              element={<MoneyWalletPage />} />
        <Route path="/money/daily-collection"    element={<MdDailyCollectionPage />} />
        <Route path="/money/rankings"            element={<BranchRankingsPage />} />
        <Route path="/money/add-entry"           element={<MdAddEntryPage />} />
        <Route path="/money/projects"            element={<ProjectManagementPage />} />
        <Route path="/money/holders/:holderId"   element={<CashHolderDetailPage />} />
        <Route path="/money/pending-transfers"   element={<MoneyPendingTransfersPage />} />

        {/* Schemes hub */}
        <Route path="/money/schemes"             element={<SchemesPage />} />
        <Route path="/money/schemes/pending"     element={<PendingEnrollmentsListPage />} />
        <Route path="/money/schemes/pending/:id" element={<PendingEnrollmentDetailPage />} />
        <Route path="/money/schemes/gold"        element={<GoldSchemePage />} />
        <Route path="/money/schemes/gold/add"    element={<GoldSchemeAddPage />} />
        <Route path="/money/schemes/gold/:id"    element={<GoldMemberDetailPage />} />

        {/* Incentive Wallet */}
        <Route path="/money/incentives"          element={<IncentiveWalletPage />} />

        {/* Salary Management */}
        <Route path="/money/salaries"            element={<SalaryManagementPage />} />

        {/* Trading Academy Scheme */}
        <Route path="/money/schemes/trading-academy" element={<TradingAcademyPage />} />
        <Route path="/money/schemes/gold-coin"       element={<GoldCoinSchemePage />} />
        <Route path="/money/schemes/gold-coin/add"   element={<GoldCoinAddSlotPage />} />
        <Route path="/money/schemes/gold-coin/head"  element={<GoldCoinHeadBranchPage />} />
        <Route path="/money/schemes/gold-coin/:id"   element={<GoldCoinRoomDetailPage />} />
        <Route path="/money/schemes/lss"       element={<LssSchemePage />} />
        <Route path="/money/schemes/lss/add"   element={<LssAddSlotPage />} />
        <Route path="/money/schemes/lss/head"  element={<LssHeadBranchPage />} />
        <Route path="/money/schemes/lss/:id"   element={<LssRoomDetailPage />} />
        <Route path="/money/schemes/agila-chit"            element={<ChitSchemePage />} />
        <Route path="/money/schemes/agila-chit/create"   element={<ChitAddGroupPage />} />
        <Route path="/money/schemes/agila-chit/head"     element={<ChitHeadBranchPage />} />
        <Route path="/money/schemes/agila-chit/:id"      element={<ChitGroupDetailPage />} />
        <Route path="/money/schemes/agila-chit/:id/add"  element={<ChitAddMemberPage />} />
        <Route path="/money/schemes/builders"                    element={<BuildersSchemePage />} />
        <Route path="/money/schemes/builders/create"           element={<BuildersAddPlanPage />} />
        <Route path="/money/schemes/builders/incentives"       element={<BuildersIncentiveRulesPage />} />
        <Route path="/money/schemes/builders/:id"              element={<BuildersPlanDetailPage />} />
        <Route path="/money/schemes/land"                element={<LandSchemePage />} />
        <Route path="/money/schemes/land/sites"          element={<LandSitesPage />} />
        <Route path="/money/schemes/land/sites/new"      element={<LandAddSitePage />} />
        <Route path="/money/schemes/land/sites/:siteId"               element={<LandSiteDetailPage />} />
        <Route path="/money/schemes/land/sites/:siteId/layouts/new" element={<LandAddLayoutPage />} />
        <Route path="/money/schemes/land/bookings"       element={<LandBookingsPage />} />
        <Route path="/money/schemes/land/bookings/new"   element={<LandAddBookingPage />} />
        <Route path="/money/schemes/land/bookings/:id"   element={<LandBookingDetailPage />} />

        {/* Redirects for old /gold/* URLs */}
        <Route path="/gold"                      element={<Navigate to="/money/schemes/gold" replace />} />
        <Route path="/gold/add"                  element={<Navigate to="/money/schemes/gold/add" replace />} />
        <Route path="/gold/:id"                  element={<Navigate to="/money/schemes/gold" replace />} />

        {/* Incentive Overview — MD + Management only. Three sibling routes so the
            browser/hardware back button steps up one level at a time. */}
        <Route path="/incentives-overview"                                            element={<IncentivesOverviewPage />} />
        <Route path="/incentives-overview/branch/:branchId"                           element={<IncentivesOverviewPage />} />
        <Route path="/incentives-overview/branch/:branchId/person/:userId"            element={<IncentivesOverviewPage />} />

        {/* Management Control Center */}
        <Route path="/control-center"             element={<ManagementControlCenter />} />
        <Route path="/control-center/corrections" element={<SchemeCorrectionsPage />} />
        <Route path="/control-center/reconciliation" element={<ReconciliationDashboardPage />} />

        {/* Leadership */}
        <Route path="/leadership/:kind"          element={<LeadershipListPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
