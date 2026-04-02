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
      {/* Profile — fixed top right, shown on all roles */}
      <div className="fixed top-4 right-4 z-[100]">
        <div className="px-4 py-2 bg-white/80 backdrop-blur-md border border-navy/5 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo/10 flex items-center justify-center text-indigo">
            {isAdmin ? <ShieldCheck size={16} /> : <UserCircle size={16} />}
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy uppercase tracking-tight leading-none">{user.name}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <p className="text-[8px] font-bold text-navy/30 uppercase tracking-[0.1em]">{user.role.replace(/_/g, ' ')}</p>
              <span className="text-[8px] text-navy/20">•</span>
              <p className="text-[8px] font-bold text-indigo uppercase tracking-[0.1em]">{user.branchName || 'Unassigned'}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="p-2 text-navy/20 hover:text-red-500 transition-colors ml-2"
            title="Log Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* All authenticated roles land on AttendanceHome — bottom nav controls sub-views */}
      <main>
        <AttendanceHome />
      </main>
    </div>
  );
}

export default App;