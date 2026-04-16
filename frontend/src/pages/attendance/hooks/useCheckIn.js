import { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { selectCurrentUser } from '../../../store/slices/authSlice';
import {
  useGetSummaryQuery,
  useSubmitAttendanceMutation,
  useGetUploadUrlMutation,
  apiSlice,
} from '../../../store/api/apiSlice';

/**
 * Encapsulates all state and async logic for the employee self-check-in flow.
 * GPS fetching, S3 photo upload, and attendance submission live here.
 * @param {object} options
 * @param {() => void} options.onSuccess  Called after a successful submission so the
 *                                        parent can navigate away (e.g. back to Home tab).
 */
export const useCheckIn = ({ onSuccess } = {}) => {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();

  const [fieldStep, setFieldStep] = useState(1);
  const [fieldNote, setFieldNote] = useState('');
  const [fieldPhoto, setFieldPhoto] = useState(null); // { file, previewUrl }
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [gpsStatus, setGpsStatus] = useState(null); // null | 'fetching' | { lat, lng } | 'error'

  // Inline error message — replaces browser alert() for production
  const [checkInError, setCheckInError] = useState(null);

  // True when the browser has permanently denied location access (error code 1).
  // Distinguished from a transient failure (no signal, timeout) so the UI can show
  // "go to browser settings" instead of just "try again".
  const [gpsPermissionDenied, setGpsPermissionDenied] = useState(false);

  // Optimistic flag: show as marked immediately after submit (worker writes async)
  const [submittedThisSession, setSubmittedThisSession] = useState(false);

  const { data: summary, refetch: refetchSummary } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id },
  );
  const [submitAttendance, { isLoading: isSubmitting }] = useSubmitAttendanceMutation();
  // Mutation (not lazy query) so each call generates a fresh presigned URL — never a stale cached one
  const [getUploadUrl] = useGetUploadUrlMutation();

  // Treat an auto-absent record (status='absent') the same as no record — show check-in buttons.
  // The only exception is when the user submitted this session (optimistic fallback):
  // even if the DB still shows absent (worker hasn't overwritten it yet), we know
  // the check-in is queued so we hold the "present" optimistic state.
  const rawToday = summary?.today;
  const todayRecord =
    (rawToday && rawToday.status !== 'absent')
      ? rawToday
      : (submittedThisSession ? { status: 'present', mode: 'office' } : null);

  /** Call this when the user enters the office or field check-in view, or to re-prompt after error. */
  const fetchGps = () => {
    setGpsStatus('fetching');
    setGpsPermissionDenied(false); // reset on every attempt
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsStatus({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        setGpsStatus('error');
        // code 1 = PERMISSION_DENIED — user blocked location; must go to browser settings
        if (err.code === 1) setGpsPermissionDenied(true);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  const handlePhotoCapture = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setFieldPhoto({ file, previewUrl });
    setFieldStep(2);
  };

  const resetFieldState = () => {
    setFieldStep(1);
    setFieldNote('');
    if (fieldPhoto?.previewUrl) URL.revokeObjectURL(fieldPhoto.previewUrl);
    setFieldPhoto(null);
  };

  const handleCheckIn = async (mode) => {
    setCheckInError(null);
    try {
      // GPS never started — trigger the permission prompt now
      if (!gpsStatus) {
        fetchGps();
        return;
      }
      // If GPS errored, re-trigger the request — the browser will re-show the permission
      // dialog if the user previously chose "Ask again next time" (permission = 'prompt').
      if (gpsStatus === 'error') {
        fetchGps();
        return;
      }
      // GPS prompt is open but not resolved yet
      if (gpsStatus === 'fetching') {
        setCheckInError('Waiting for GPS location...');
        return;
      }

      if (mode === 'office') {
        await submitAttendance({
          mode: 'office',
          checkInLat: gpsStatus.lat,
          checkInLng: gpsStatus.lng,
        }).unwrap();
      } else {
        if (!fieldPhoto) {
          setCheckInError('A photo must be captured before submitting.');
          return;
        }

        setIsUploading(true);
        const fileType = fieldPhoto.file.type || 'image/jpeg';
        // Pass the file's MIME type so the presigned URL is signed for the correct Content-Type
        const { uploadUrl, photoKey } = await getUploadUrl(fileType).unwrap();
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: fieldPhoto.file,
          headers: { 'Content-Type': fileType },
        });
        if (!uploadResponse.ok) {
          throw new Error('Photo upload failed. Please try again.');
        }
        await submitAttendance({
          mode: 'field',
          fieldNote,
          photoKey,
          checkInLat: gpsStatus.lat,
          checkInLng: gpsStatus.lng,
        }).unwrap();
      }

      setSubmittedThisSession(true);
      // Immediately refetch summary so HomeTab shows "Checked In" via the server's
      // Redis fallback check (att:{userId}:{date} key exists → status: 'present').
      refetchSummary();
      // 5-second fallback: if the Socket.io confirmation never arrives (e.g. socket
      // disconnected), invalidate the RTK cache so the UI updates regardless.
      setTimeout(() => {
        dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
      }, 5000);
      resetFieldState();
      onSuccess?.();
    } catch (err) {
      setCheckInError(err?.data?.error?.message || err?.message || 'Submission failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  return {
    todayRecord,
    gpsStatus,
    gpsPermissionDenied,
    fetchGps,
    fieldStep,
    setFieldStep,
    fieldNote,
    setFieldNote,
    fieldPhoto,
    isSubmitting,
    isUploading,
    fileInputRef,
    handlePhotoCapture,
    handleCheckIn,
    checkInError,
    clearCheckInError: () => setCheckInError(null),
  };
};
