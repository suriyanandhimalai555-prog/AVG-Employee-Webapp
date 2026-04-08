import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Loader2, UserCircle2, ShieldCheck } from 'lucide-react';
import { BottomNav } from '../components/attendance/BottomNav';
import { selectCurrentUser, clearCredentials } from '../store/slices/authSlice';
import {
  apiSlice,
  useChangePasswordMutation,
  useGetMeQuery,
  useGetPhotoUrlQuery,
  useGetProfileUploadUrlMutation,
  useUpdateProfileAssetsMutation,
} from '../store/api/apiSlice';

export const ProfilePage = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const { data: me, isLoading: meLoading, refetch: refetchMe } = useGetMeQuery();
  const [changePassword, { isLoading: isChangingPassword }] = useChangePasswordMutation();
  const [getProfileUploadUrl] = useGetProfileUploadUrlMutation();
  const [updateProfileAssets, { isLoading: isSavingAssets }] = useUpdateProfileAssetsMutation();

  const { data: profilePhotoData } = useGetPhotoUrlQuery(me?.profilePhotoKey, {
    skip: !me?.profilePhotoKey,
  });
  const { data: proofData } = useGetPhotoUrlQuery(me?.profileProofKey, {
    skip: !me?.profileProofKey,
  });

  const handleTabChange = (tab) => {
    if (tab === 'profile') return;
    sessionStorage.setItem('attendanceHomeTab', tab);
    navigate('/');
  };

  const uploadAsset = async (file, kind) => {
    const contentType = file.type || 'application/octet-stream';
    const { uploadUrl, fileKey } = await getProfileUploadUrl({ kind, contentType }).unwrap();
    const uploadRes = await fetch(uploadUrl, {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': contentType },
    });
    if (!uploadRes.ok) {
      throw new Error('Upload failed. Please try again.');
    }
    return fileKey;
  };

  const handleFileChange = async (e, kind) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const key = await uploadAsset(file, kind);
      await updateProfileAssets(
        kind === 'photo' ? { profilePhotoKey: key } : { profileProofKey: key }
      ).unwrap();
      refetchMe();
      setMessage(kind === 'photo' ? 'Profile photo updated' : 'Proof uploaded');
    } catch (err) {
      setError(err?.data?.error?.message || err?.message || 'Upload failed');
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await changePassword(passwordData).unwrap();
      dispatch(apiSlice.util.resetApiState());
      dispatch(clearCredentials());
      setMessage('Password changed. Please login again.');
      navigate('/');
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to change password');
    }
  };

  return (
    <div className="min-h-screen bg-surface pb-24">
      <div className="max-w-2xl mx-auto px-5 py-6 space-y-5">
        <h1 className="text-2xl font-bold text-navy">Profile</h1>

        <div className="bg-white rounded-3xl card-shadow p-5">
          {meLoading ? (
            <div className="flex items-center gap-2 text-navy/40 text-sm font-bold">
              <Loader2 className="animate-spin" size={16} /> Loading profile...
            </div>
          ) : (
            <div className="space-y-2 text-sm">
              <p><span className="font-bold text-navy">Name:</span> {me?.name}</p>
              <p><span className="font-bold text-navy">Email:</span> {me?.email}</p>
              <p><span className="font-bold text-navy">Role:</span> {(me?.role || '').replace(/_/g, ' ')}</p>
              <p><span className="font-bold text-navy">Branch:</span> {me?.branchName || 'Unassigned'}</p>
            </div>
          )}
        </div>

        <div className="bg-white rounded-3xl card-shadow p-5 space-y-4">
          <p className="text-xs font-bold text-navy/40 uppercase tracking-widest">Assets</p>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-navy/5 overflow-hidden flex items-center justify-center">
              {profilePhotoData?.downloadUrl ? (
                <img src={profilePhotoData.downloadUrl} alt="profile" className="w-full h-full object-cover" />
              ) : (
                <UserCircle2 className="text-navy/25" size={30} />
              )}
            </div>
            <label className="px-4 py-2 rounded-xl bg-indigo text-white text-xs font-bold cursor-pointer">
              Upload Profile Picture
              <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFileChange(e, 'photo')} />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <label className="px-4 py-2 rounded-xl bg-white border border-navy/10 text-xs font-bold cursor-pointer">
              Upload Proof
              <input type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => handleFileChange(e, 'proof')} />
            </label>
            {proofData?.downloadUrl && (
              <a href={proofData.downloadUrl} target="_blank" rel="noreferrer" className="text-xs font-bold text-indigo">
                View current proof
              </a>
            )}
          </div>
        </div>

        <form onSubmit={handleChangePassword} className="bg-white rounded-3xl card-shadow p-5 space-y-3">
          <p className="text-xs font-bold text-navy/40 uppercase tracking-widest">Change Password</p>
          <input
            type="password"
            placeholder="Current password"
            className="w-full px-3 py-2.5 rounded-xl bg-navy/[0.03]"
            value={passwordData.currentPassword}
            onChange={(e) => setPasswordData((p) => ({ ...p, currentPassword: e.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="New password"
            className="w-full px-3 py-2.5 rounded-xl bg-navy/[0.03]"
            value={passwordData.newPassword}
            onChange={(e) => setPasswordData((p) => ({ ...p, newPassword: e.target.value }))}
            required
          />
          <input
            type="password"
            placeholder="Confirm new password"
            className="w-full px-3 py-2.5 rounded-xl bg-navy/[0.03]"
            value={passwordData.confirmPassword}
            onChange={(e) => setPasswordData((p) => ({ ...p, confirmPassword: e.target.value }))}
            required
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-emerald text-white text-sm font-bold inline-flex items-center gap-2"
            disabled={isChangingPassword}
          >
            {isChangingPassword ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
            Update Password
          </button>
        </form>

        {(busy || isSavingAssets) && <p className="text-xs text-navy/40 font-bold">Uploading...</p>}
        {message && <p className="text-xs text-emerald font-bold">{message}</p>}
        {error && <p className="text-xs text-red-500 font-bold">{error}</p>}
      </div>

      <BottomNav activeTab="profile" onTabChange={handleTabChange} user={user} />
    </div>
  );
};

export default ProfilePage;
