import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { selectCurrentUser } from '../../../store/slices/authSlice';
import {
  useSubmitSignOffMutation,
  useGetSummaryQuery,
  apiSlice,
} from '../../../store/api/apiSlice';
import { useGeolocation } from '../../../hooks/useGeolocation';

/**
 * Encapsulates all state and async logic for the employee self sign-off (clock-out) flow.
 * GPS fetching and attendance sign-off submission live here.
 * Mirrors the structure of useCheckIn so the patterns are consistent.
 *
 * @param {object} options
 * @param {() => void} [options.onSuccess]  Called after a successful sign-off submission.
 */
export const useSignOff = ({ onSuccess } = {}) => {
  const user = useSelector(selectCurrentUser);
  const dispatch = useDispatch();

  // GPS state via the shared hook. Map to the existing gpsStatus shape
  // (null | 'fetching' | { lat, lng, accuracy } | 'error') so callers need no changes.
  const geo = useGeolocation();
  const gpsStatus = geo.status === 'ready' ? geo.coords
                  : geo.status === 'idle'  ? null
                  : geo.status;             // 'fetching' | 'error'
  const gpsPermissionDenied = geo.errorCode === 1;

  // Inline error — replaces any browser alert()
  const [signOffError, setSignOffError] = useState(null);

  // Optimistic flag: show "Shift Complete" immediately after submit
  const [signedOffThisSession, setSignedOffThisSession] = useState(false);

  const { refetch: refetchSummary } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id },
  );

  const [submitSignOff, { isLoading: isSubmitting }] = useSubmitSignOffMutation();

  /** Trigger a fresh GPS location request. Call when entering the sign-off view. */
  const fetchGps = geo.request;

  /** Submit the sign-off with current GPS coordinates. */
  const handleSignOff = async () => {
    setSignOffError(null);
    try {
      // GPS never started — trigger the permission prompt now
      if (!gpsStatus) {
        fetchGps();
        return;
      }
      // Re-trigger GPS if it previously errored
      if (gpsStatus === 'error') {
        fetchGps();
        return;
      }
      // GPS prompt is open but not resolved yet
      if (gpsStatus === 'fetching') {
        setSignOffError('Waiting for GPS location...');
        return;
      }

      await submitSignOff({
        checkOutLat: gpsStatus.lat,
        checkOutLng: gpsStatus.lng,
        checkOutAccuracy: gpsStatus.accuracy ?? undefined,
      }).unwrap();

      setSignedOffThisSession(true);
      // Immediately refetch summary so the UI reflects sign-off via Redis fallback
      refetchSummary();
      // 5-second fallback: invalidate RTK cache in case Socket.io confirmation is delayed
      setTimeout(() => {
        dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
      }, 5000);
      onSuccess?.();
    } catch (err) {
      setSignOffError(err?.data?.error?.message || err?.message || 'Sign-off failed. Please try again.');
    }
  };

  return {
    gpsStatus,
    fetchGps,
    gpsPermissionDenied,
    isSubmitting,
    signOffError,
    clearSignOffError: () => setSignOffError(null),
    signedOffThisSession,
    handleSignOff,
  };
};
