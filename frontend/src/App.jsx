import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AttendanceHome } from './pages/AttendanceHome';
import { PersonAttendancePage } from './pages/PersonAttendancePage';
import { LeadershipListPage } from './pages/LeadershipListPage';
import { ProfilePage } from './pages/ProfilePage';
import { MoneyManagementPage } from './pages/MoneyManagementPage';
import { BranchRankingsPage } from './pages/BranchRankingsPage';
import { MdAddEntryPage } from './pages/MdAddEntryPage';
import { ProjectManagementPage } from './pages/ProjectManagementPage';
import { Login } from './pages/Login';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { selectCurrentUser, selectIsAuthenticated, clearCredentials } from './store/slices/authSlice';
import { useGetMeQuery } from './store/api/apiSlice';

import { AppLayout } from './components/layout/AppLayout';

function App() {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);

  // Verify token on mount — skip if no token
  const { isLoading: isMeLoading, isError: isMeError } = useGetMeQuery(undefined, {
    skip: !isAuthenticated,
  });

  // If token verification fails, clear credentials
  useEffect(() => {
    if (isMeError) {
      dispatch(clearCredentials());
    }
  }, [isMeError, dispatch]);

  // Show spinner only while verifying an existing token
  if (isAuthenticated && isMeLoading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="animate-spin text-indigo" size={40} />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Login />;
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<AttendanceHome />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/money" element={<MoneyManagementPage />} />
        <Route path="/money/rankings" element={<BranchRankingsPage />} />
        <Route path="/money/add-entry" element={<MdAddEntryPage />} />
        <Route path="/money/projects" element={<ProjectManagementPage />} />
        <Route path="/leadership/:kind" element={<LeadershipListPage />} />
        <Route path="/people/:userId" element={<PersonAttendancePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;