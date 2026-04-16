import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

import { selectIsAuthenticated, clearCredentials } from './store/slices/authSlice';
import { useGetMeQuery } from './store/api/apiSlice';

import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { AttendanceHome } from './pages/AttendanceHome';
import { ProfilePage } from './pages/ProfilePage';
import { MoneyManagementPage } from './pages/MoneyManagementPage';
import { MoneySubmitPage } from './pages/MoneySubmitPage';
import { MoneyHistoryPage } from './pages/MoneyHistoryPage';
import { MoneyWalletPage } from './pages/MoneyWalletPage';
import { BranchRankingsPage } from './pages/BranchRankingsPage';
import { MdAddEntryPage } from './pages/MdAddEntryPage';
import { ProjectManagementPage } from './pages/ProjectManagementPage';
import { LeadershipListPage } from './pages/LeadershipListPage';
import { PersonAttendancePage } from './pages/PersonAttendancePage';
import { AttendanceTab } from './pages/attendance/AttendanceTab';
import { OfficeCheckIn } from './pages/attendance/OfficeCheckIn';
import { FieldCheckIn } from './pages/attendance/FieldCheckIn';
import { AlertsTab } from './pages/attendance/AlertsTab';
import { BranchManagement } from './pages/BranchManagement';
import { UserManagement } from './pages/UserManagement';
import { BranchDetailPage } from './pages/BranchDetailPage';
import { EmployeeCalendarPage } from './pages/EmployeeCalendarPage';

function ProtectedLayout() {
  const isAuthenticated = useSelector(selectIsAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Layout />;
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

        {/* Leadership */}
        <Route path="/leadership/:kind"          element={<LeadershipListPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
