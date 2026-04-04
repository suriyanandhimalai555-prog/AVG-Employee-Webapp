import { ArrowRight, LogOut } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { apiSlice, useLogoutMutation } from '../../store/api/apiSlice';
import { clearCredentials } from '../../store/slices/authSlice';

export const PageHeader = ({ user, title, showBack, onBack, hideLogout }) => {
  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      /* clear local session anyway */
    }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  return (
    <header className="px-4 md:px-8 lg:px-12 pt-8 md:pt-12 pb-6 flex items-center justify-between gap-4 transition-all duration-300">
      <div className="flex items-center gap-4 min-w-0">
        {showBack ? (
          <button
            onClick={onBack}
            className="p-3 -ml-2 text-navy/40 hover:text-indigo hover:bg-indigo/5 rounded-2xl transition-all duration-300 tactile-press border border-transparent hover:border-indigo/10"
          >
            <ArrowRight className="rotate-180" size={22} />
          </button>
        ) : (
          <div className="w-12 h-12 rounded-[18px] overflow-hidden shrink-0 ring-4 ring-white shadow-premium border border-navy/5 group hover:rotate-3 transition-transform duration-500">
            <img
              src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0B1C30&color=fff&size=48`}
              alt="avatar"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            />
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className="text-[9px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono truncate">
              {user?.branchName || 'ORGANIZATION'}
            </p>
            <span className="text-navy/10 text-[8px]">•</span>
            <p className="text-[8px] font-bold text-indigo uppercase tracking-[0.15em] font-mono truncate">
              {user?.role?.replace(/_/g, ' ') || 'SYSTEM'}
            </p>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-navy tracking-tight leading-tight truncate">
            {title}
          </h1>
          {user?.name && !showBack && (
            <div className="flex items-center gap-2 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
              <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest truncate">{user.name}</p>
            </div>
          )}
        </div>
      </div>

      {!hideLogout && (
        <button
          onClick={handleLogout}
          className="p-3 rounded-2xl bg-white text-navy/20 hover:text-red-500 hover:bg-red-50 transition-all duration-300 card-shadow border border-navy/5 tactile-press group"
          title="Logout Account"
        >
          <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
        </button>
      )}
    </header>
  );
};
