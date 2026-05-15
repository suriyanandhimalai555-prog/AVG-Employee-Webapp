import { useEffect, lazy, Suspense } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { selectIsAuthenticated, clearCredentials } from './store/slices/authSlice';
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
const MoneySubmitPage          = lazy(() => import('./pages/MoneySubmitPage').then(m => ({ default: m.MoneySubmitPage })));
const MoneyHistoryPage         = lazy(() => import('./pages/MoneyHistoryPage').then(m => ({ default: m.MoneyHistoryPage })));
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
const IncentiveWalletPage      = lazy(() => import('./pages/schemes/IncentiveWalletPage').then(m => ({ default: m.IncentiveWalletPage })));
const SalaryManagementPage     = lazy(() => import('./pages/SalaryManagementPage').then(m => ({ default: m.SalaryManagementPage })));
const TradingAcademyPage       = lazy(() => import('./pages/schemes/TradingAcademyPage').then(m => ({ default: m.TradingAcademyPage })));
const LeadershipListPage       = lazy(() => import('./pages/LeadershipListPage').then(m => ({ default: m.LeadershipListPage })));
const PersonAttendancePage     = lazy(() => import('./pages/PersonAttendancePage').then(m => ({ default: m.PersonAttendancePage })));
const BranchManagement         = lazy(() => import('./pages/BranchManagement').then(m => ({ default: m.BranchManagement })));
const UserManagement           = lazy(() => import('./pages/UserManagement').then(m => ({ default: m.UserManagement })));
const BranchDetailPage         = lazy(() => import('./pages/BranchDetailPage').then(m => ({ default: m.BranchDetailPage })));
const EmployeeCalendarPage     = lazy(() => import('./pages/EmployeeCalendarPage').then(m => ({ default: m.EmployeeCalendarPage })));

const RouteFallback = () => (
  <div className="w-full flex items-center justify-center py-16" role="status" aria-label="Loading page">
    <Loader2 className="animate-spin text-indigo" size={32} />
    <span className="sr-only">Loading</span>
  </div>
);

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
        <Route path="/branches"                  element={<BranchManagement />} />
        <Route path="/branches/:branchId"        element={<BranchDetailPage />} />

        {/* Staff management */}
        <Route path="/user-management"           element={<UserManagement />} />

        {/* People */}
        <Route path="/people/:userId"            element={<PersonAttendancePage />} />
        <Route path="/people/:userId/calendar"   element={<EmployeeCalendarPage />} />

        {/* Profile */}
        <Route path="/profile"                   element={<ProfilePage />} />

        {/* Money */}
        <Route path="/money"                     element={<MoneyManagementPage />} />
        <Route path="/money/submit"              element={<MoneySubmitPage />} />
        <Route path="/money/history"             element={<MoneyHistoryPage />} />
        <Route path="/money/wallet"              element={<MoneyWalletPage />} />
        <Route path="/money/rankings"            element={<BranchRankingsPage />} />
        <Route path="/money/add-entry"           element={<MdAddEntryPage />} />
        <Route path="/money/projects"            element={<ProjectManagementPage />} />
        <Route path="/money/holders/:holderId"   element={<CashHolderDetailPage />} />
        <Route path="/money/pending-transfers"   element={<MoneyPendingTransfersPage />} />

        {/* Schemes hub */}
        <Route path="/money/schemes"             element={<SchemesPage />} />
        <Route path="/money/schemes/gold"        element={<GoldSchemePage />} />
        <Route path="/money/schemes/gold/add"    element={<GoldSchemeAddPage />} />
        <Route path="/money/schemes/gold/:id"    element={<GoldMemberDetailPage />} />

        {/* Incentive Wallet */}
        <Route path="/money/incentives"          element={<IncentiveWalletPage />} />

        {/* Salary Management */}
        <Route path="/money/salaries"            element={<SalaryManagementPage />} />

        {/* Trading Academy Scheme */}
        <Route path="/money/schemes/trading-academy" element={<TradingAcademyPage />} />

        {/* Redirects for old /gold/* URLs */}
        <Route path="/gold"                      element={<Navigate to="/money/schemes/gold" replace />} />
        <Route path="/gold/add"                  element={<Navigate to="/money/schemes/gold/add" replace />} />
        <Route path="/gold/:id"                  element={<Navigate to="/money/schemes/gold" replace />} />

        {/* Leadership */}
        <Route path="/leadership/:kind"          element={<LeadershipListPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
