import { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AttendanceHome } from './pages/AttendanceHome';
import { Login } from './pages/Login';
import { UserCircle, ShieldCheck, LogOut, Loader2 } from 'lucide-react';
import { selectCurrentUser, selectIsAuthenticated, clearCredentials } from './store/slices/authSlice';
import { apiSlice, useGetMeQuery, useLogoutMutation } from './store/api/apiSlice';

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

  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      /* still clear local session */
    }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

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

  const isAdmin = ['branch_admin', 'gm', 'md', 'director', 'branch_manager'].includes(user.role);

  return (
    <div className="relative">
      {/* All authenticated roles land on AttendanceHome — bottom nav controls sub-views */}
      <main>
        <AttendanceHome />
      </main>
    </div>
  );
}

export default App;