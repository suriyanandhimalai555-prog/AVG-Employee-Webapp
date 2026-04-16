import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useSelfAbsentMutation, apiSlice } from '../../../store/api/apiSlice';

/**
 * Encapsulates state and async logic for an employee self-marking absent.
 * Uses a two-step confirmation pattern to prevent accidental taps.
 *
 * @param {object} options
 * @param {() => void} options.onSuccess  Called after a successful absent submission.
 */
export const useMarkAbsent = ({ onSuccess } = {}) => {
  const dispatch = useDispatch();
  const [selfAbsent, { isLoading: isSubmitting }] = useSelfAbsentMutation();
  const [absentError, setAbsentError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  /** Show the inline confirmation card */
  const initiateAbsent = () => {
    setAbsentError(null);
    setConfirming(true);
  };

  /** Dismiss the confirmation card without submitting */
  const cancelAbsent = () => setConfirming(false);

  /** Execute the absent submission after the user confirms */
  const handleMarkAbsent = async () => {
    setAbsentError(null);
    try {
      await selfAbsent({}).unwrap();
      setConfirming(false);
      // Invalidate cache so dashboards reflect the absent immediately
      setTimeout(() => {
        dispatch(apiSlice.util.invalidateTags(['Summary', 'Attendance', 'Employees']));
      }, 1000);
      onSuccess?.();
    } catch (err) {
      setConfirming(false);
      setAbsentError(
        err?.data?.error?.message || err?.message || 'Could not mark absent. Please try again.'
      );
    }
  };

  return {
    isSubmitting,
    absentError,
    clearAbsentError: () => setAbsentError(null),
    confirming,
    initiateAbsent,
    cancelAbsent,
    handleMarkAbsent,
  };
};
