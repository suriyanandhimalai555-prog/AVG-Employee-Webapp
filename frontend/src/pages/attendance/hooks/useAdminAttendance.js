import { useState } from 'react';
import {
  useAdminMarkMutation,
  useAdminCorrectMutation,
  useGetPhotoUrlQuery,
} from '../../../store/api/apiSlice';

/**
 * Encapsulates all state and async logic for the branch-admin attendance panel.
 * Covers: employee filter, mark modal, correction modal, photo fetching.
 */
export const useAdminAttendance = () => {
  const [staffFilter, setStaffFilter] = useState('all'); // 'all' | 'smartphone' | 'no-smartphone'

  // ── Mark modal (employees without an attendance record) ──
  const [markModal, setMarkModal] = useState({ open: false, employee: null });
  const [markStatus, setMarkStatus] = useState('present');
  const [markNote, setMarkNote] = useState('');

  // ── Correction modal (employees with an existing record) ──
  const [correctionModal, setCorrectionModal] = useState({ open: false, employee: null });
  const [correctionStatus, setCorrectionStatus] = useState('present');
  const [correctionNote, setCorrectionNote] = useState('');

  const [adminMark, { isLoading: markLoading }] = useAdminMarkMutation();
  const [adminCorrect, { isLoading: correctLoading }] = useAdminCorrectMutation();

  // Photo URL for the employee currently open in the correction modal.
  // RTK Query skips the request when no photo_key is set.
  const { data: correctionPhoto, isLoading: correctionPhotoLoading } = useGetPhotoUrlQuery(
    correctionModal.employee?.photo_key,
    { skip: !correctionModal.employee?.photo_key },
  );

  const openMarkModal = (emp) => {
    setMarkModal({ open: true, employee: emp });
    setMarkStatus('present');
    setMarkNote('');
  };

  const closeMarkModal = () => setMarkModal({ open: false, employee: null });

  const handleMarkSubmit = async () => {
    try {
      await adminMark({
        targetUserId: markModal.employee?.id,
        status: markStatus,
        note: markNote || 'Marked by branch admin',
      }).unwrap();
      closeMarkModal();
    } catch (err) {
      alert(err?.data?.error?.message || 'Could not mark attendance');
    }
  };

  const openCorrectionModal = (emp) => {
    setCorrectionModal({ open: true, employee: emp });
    setCorrectionStatus(emp.status || 'present');
    setCorrectionNote('');
  };

  const closeCorrectionModal = () => setCorrectionModal({ open: false, employee: null });

  const handleAdminCorrect = async () => {
    try {
      await adminCorrect({
        id: correctionModal.employee?.attendance_id,
        status: correctionStatus,
        note: correctionNote,
      }).unwrap();
      closeCorrectionModal();
    } catch (err) {
      alert(err?.data?.error?.message || 'Correction failed');
    }
  };

  return {
    // Filter
    staffFilter,
    setStaffFilter,
    // Mark modal
    markModal,
    markStatus,
    setMarkStatus,
    markNote,
    setMarkNote,
    markLoading,
    openMarkModal,
    closeMarkModal,
    handleMarkSubmit,
    // Correction modal
    correctionModal,
    correctionStatus,
    setCorrectionStatus,
    correctionNote,
    setCorrectionNote,
    correctLoading,
    openCorrectionModal,
    closeCorrectionModal,
    handleAdminCorrect,
    // Photo
    correctionPhoto,
    correctionPhotoLoading,
  };
};
