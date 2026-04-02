import { useState, useRef } from 'react';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../../store/slices/authSlice';
import {
  useGetSummaryQuery,
  useSubmitAttendanceMutation,
  useLazyGetUploadUrlQuery,
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

  const [fieldStep, setFieldStep] = useState(1);
  const [fieldNote, setFieldNote] = useState('');
  const [fieldPhoto, setFieldPhoto] = useState(null); // { file, previewUrl }
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const [gpsStatus, setGpsStatus] = useState(null); // null | 'fetching' | { lat, lng } | 'error'

  // Inline error message — replaces browser alert() for production
  const [checkInError, setCheckInError] = useState(null);

  // Optimistic flag: show as marked immediately after submit (worker writes async)
  const [submittedThisSession, setSubmittedThisSession] = useState(false);

  const { data: summary, refetch: refetchSummary } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id },
  );
  const [submitAttendance, { isLoading: isSubmitting }] = useSubmitAttendanceMutation();
  const [getUploadUrl] = useLazyGetUploadUrlQuery();

  const todayRecord =
    summary?.today || (submittedThisSession ? { status: 'present', mode: 'office' } : null);

  /** Call this when the user enters the office or field check-in view. */
  const fetchGps = () => {
    setGpsStatus('fetching');
    if (!navigator.geolocation) { setGpsStatus('error'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setGpsStatus({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGpsStatus('error'),
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
      if (!gpsStatus || gpsStatus === 'error' || gpsStatus === 'fetching') {
        setCheckInError('GPS location is required. Please allow location access and try again.');
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
        const { uploadUrl, photoKey } = await getUploadUrl().unwrap();
        await fetch(uploadUrl, {
          method: 'PUT',
          body: fieldPhoto.file,
          headers: { 'Content-Type': fieldPhoto.file.type },
        });
        await submitAttendance({
          mode: 'field',
          fieldNote,
          photoKey,
          checkInLat: gpsStatus.lat,
          checkInLng: gpsStatus.lng,
        }).unwrap();
      }

      setSubmittedThisSession(true);
      resetFieldState();
      // Cache invalidation is now handled by useAttendanceSocket when the
      // worker publishes attendance:confirmed to Redis pub/sub → Socket.io
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
