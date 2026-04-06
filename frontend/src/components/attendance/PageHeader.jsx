import { useState } from 'react';
import { ArrowRight, LogOut, KeyRound, X, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { apiSlice, useLogoutMutation, useChangePasswordMutation } from '../../store/api/apiSlice';
import { clearCredentials } from '../../store/slices/authSlice';

export const PageHeader = ({ user, title, showBack, onBack, hideLogout }) => {
  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();
  const [changePassword] = useChangePasswordMutation();

  // Change-password modal state
  const [showPwModal, setShowPwModal] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwLoading, setPwLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch {
      /* clear local session anyway */
    }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  const openPwModal = () => {
    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setPwError('');
    setPwSuccess(false);
    setShowCurrent(false);
    setShowNew(false);
    setShowPwModal(true);
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('New passwords do not match');
      return;
    }
    setPwLoading(true);
    try {
      await changePassword(pwForm).unwrap();
      setPwSuccess(true);
      // Give the user a moment to read the success message, then log out
      setTimeout(() => {
        dispatch(apiSlice.util.resetApiState());
        dispatch(clearCredentials());
      }, 1500);
    } catch (err) {
      setPwError(err?.data?.error?.message || 'Failed to change password');
    } finally {
      setPwLoading(false);
    }
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
        <div className="flex items-center gap-2">
          <button
            onClick={openPwModal}
            className="p-3 rounded-2xl bg-white text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all duration-300 card-shadow border border-navy/5 tactile-press"
            title="Change Password"
          >
            <KeyRound size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="p-3 rounded-2xl bg-white text-navy/20 hover:text-red-500 hover:bg-red-50 transition-all duration-300 card-shadow border border-navy/5 tactile-press group"
            title="Logout Account"
          >
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      )}

      {/* Change Password Modal */}
      {showPwModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy/30 backdrop-blur-sm">
          <div className="bg-white rounded-3xl card-shadow w-full max-w-sm p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy">Change Password</h2>
              <button
                onClick={() => setShowPwModal(false)}
                className="p-2 rounded-xl text-navy/20 hover:text-navy hover:bg-navy/5 transition-all"
              >
                <X size={18} />
              </button>
            </div>

            {pwSuccess ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 size={40} className="text-emerald" />
                <p className="text-sm font-bold text-navy text-center">Password changed! Logging you out…</p>
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-4">
                {pwError && (
                  <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2">
                    <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs font-bold text-red-600">{pwError}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest">Current Password</label>
                  <div className="relative">
                    <input
                      required
                      type={showCurrent ? 'text' : 'password'}
                      placeholder="Enter current password"
                      className="w-full px-4 py-3 bg-navy/[0.03] rounded-xl text-sm font-bold text-navy placeholder:text-navy/20 focus:outline-none focus:ring-2 ring-indigo/20 pr-10"
                      value={pwForm.currentPassword}
                      onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowCurrent((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/20 hover:text-navy transition-colors">
                      {showCurrent ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest">New Password</label>
                  <div className="relative">
                    <input
                      required
                      type={showNew ? 'text' : 'password'}
                      placeholder="Min 6 characters"
                      className="w-full px-4 py-3 bg-navy/[0.03] rounded-xl text-sm font-bold text-navy placeholder:text-navy/20 focus:outline-none focus:ring-2 ring-indigo/20 pr-10"
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                    />
                    <button type="button" onClick={() => setShowNew((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/20 hover:text-navy transition-colors">
                      {showNew ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest">Confirm New Password</label>
                  <input
                    required
                    type="password"
                    placeholder="Repeat new password"
                    className="w-full px-4 py-3 bg-navy/[0.03] rounded-xl text-sm font-bold text-navy placeholder:text-navy/20 focus:outline-none focus:ring-2 ring-indigo/20"
                    value={pwForm.confirmPassword}
                    onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowPwModal(false)}
                    className="flex-1 py-3 rounded-xl border border-navy/10 text-navy/40 text-sm font-bold hover:bg-navy/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="flex-1 py-3 rounded-xl bg-indigo text-white text-sm font-bold shadow-lg shadow-indigo/20 hover:bg-indigo/90 transition-all disabled:opacity-50"
                  >
                    {pwLoading ? 'Saving…' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
