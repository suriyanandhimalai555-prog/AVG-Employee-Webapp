import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { AttendanceHome } from './pages/AttendanceHome';
import { AdminDashboard } from './pages/AdminDashboard';
import { UserManagement } from './pages/UserManagement';
import { Login } from './pages/Login';
import { UserCircle, ShieldCheck, LogOut, Loader2, Users, LayoutDashboard } from 'lucide-react';
import { selectCurrentUser, selectIsAuthenticated, clearCredentials } from './store/slices/authSlice';
import { apiSlice, useGetMeQuery, useLogoutMutation } from './store/api/apiSlice';

function App() {
  const dispatch = useDispatch();
  const user = useSelector(selectCurrentUser);
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const [view, setView] = React.useState('dashboard'); // 'dashboard' or 'users'

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

  const isAdmin = ['branch_admin', 'gm', 'md', 'director'].includes(user.role);

  return (
    <div className="relative">
      {/* Session Header */}
      {/* Session Header */}
      <div className="fixed top-4 right-4 z-[100] flex gap-3 items-center">
        {/* Admin Navigation Tabs */}
        {['md', 'branch_admin', 'gm'].includes(user.role) && (
          <div className="flex bg-white/80 backdrop-blur-md border border-navy/5 rounded-2xl p-1 shadow-xl">
            <button 
              onClick={() => setView('dashboard')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                view === 'dashboard' ? 'bg-indigo text-white shadow-lg shadow-indigo/20' : 'text-navy/40 hover:text-navy'
              }`}
            >
              <LayoutDashboard size={14} />
              Overview
            </button>
            <button 
              onClick={() => setView('users')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                view === 'users' ? 'bg-indigo text-white shadow-lg shadow-indigo/20' : 'text-navy/40 hover:text-navy'
              }`}
            >
              <Users size={14} />
              Staff
            </button>
          </div>
        )}

        <div className="px-4 py-2 bg-white/80 backdrop-blur-md border border-navy/5 rounded-2xl shadow-xl flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo/10 flex items-center justify-center text-indigo">
            {isAdmin ? <ShieldCheck size={16} /> : <UserCircle size={16} />}
          </div>
          <div className="hidden sm:block">
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

      <main className="max-w-7xl mx-auto px-4 pt-24 pb-12">
        {isAdmin ? (
          view === 'users' && ['md', 'branch_admin', 'gm'].includes(user.role) ? <UserManagement /> : <AdminDashboard />
        ) : (
          <AttendanceHome />
        )}
      </main>
    </div>
  );
}

export default App;
