import { useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { HistoryCalendar } from '../components/HistoryCalendar';
import { useGetHistoryQuery, useGetPhotoUrlQuery } from '../store/api/apiSlice';
import { getISTToday } from '../lib/date';

/**
 * Full-page calendar view for any employee.
 * Employee object is passed via router state on navigation:
 *   navigate('/people/:id/calendar', { state: { employee } })
 * Falls back gracefully if state is missing (e.g. on page refresh).
 */
export const EmployeeCalendarPage = () => {
  const { userId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  // Employee data from router state — populated by the navigating page
  const employee = state?.employee ?? { id: userId };

  const today = getISTToday();
  const [yr, mo] = today.split('-');
  const [month, setMonth] = useState(parseInt(mo));
  const [year, setYear] = useState(parseInt(yr));
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const { data: historyData = [], isFetching } = useGetHistoryQuery(
    { userId, month, year },
    { skip: !userId }
  );

  const { data: photoData, isLoading: photoLoading } = useGetPhotoUrlQuery(
    selectedRecord?.photo_key,
    { skip: !selectedRecord?.photo_key }
  );

  const handleDaySelect = (cell) => {
    if (!cell) return;
    setSelectedRecord(cell.record ?? null);
    setPhotoLoadError(false);
    const [y, m] = cell.isoStr.split('-');
    const parsedY = parseInt(y);
    const parsedM = parseInt(m);
    if (parsedY !== year || parsedM !== month) {
      setYear(parsedY);
      setMonth(parsedM);
    }
  };

  const roleBadge = employee?.role?.replace(/_/g, ' ').toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen bg-surface"
    >
      {/* Sticky header bar */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-navy/5 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-navy/40 hover:text-navy hover:bg-navy/5 transition-all tactile-press shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full bg-navy/5 overflow-hidden shrink-0">
          <Avatar url={employee?.profilePhotoUrl} name={employee?.name} size={36} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate leading-tight">{employee?.name}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold text-indigo uppercase tracking-widest">{roleBadge}</span>
            {employee?.branch_name && (
              <span className="text-[9px] font-bold text-navy/30 uppercase tracking-widest truncate">
                · {employee.branch_name}
              </span>
            )}
          </div>
        </div>
        {isFetching && <Loader2 className="animate-spin text-indigo shrink-0" size={16} />}
      </div>

      {/* Calendar + detail cards */}
      <div className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <HistoryCalendar
          historyData={historyData}
          onDaySelect={handleDaySelect}
        />

        {/* Field photo — shown when a field record with a photo_key is selected */}
        {selectedRecord?.photo_key && (
          <div className="mt-4 rounded-3xl overflow-hidden bg-navy/5 border border-navy/5 relative h-52 flex items-center justify-center">
            {photoLoading ? (
              <Loader2 className="animate-spin text-navy/30" size={24} />
            ) : photoData?.downloadUrl && !photoLoadError ? (
              <img
                src={photoData.downloadUrl}
                alt="Field capture"
                className="w-full h-full object-cover"
                onError={() => setPhotoLoadError(true)}
              />
            ) : (
              <p className="text-xs font-bold text-navy/30">Photo unavailable</p>
            )}
          </div>
        )}

        {/* Correction audit info */}
        {selectedRecord?.is_corrected && (
          <div className="mt-4 p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl flex items-start gap-3">
            <AlertCircle size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1">
                Record Corrected
              </p>
              {selectedRecord.correction_note && (
                <p className="text-xs text-navy/60 leading-relaxed">
                  {selectedRecord.correction_note}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default EmployeeCalendarPage;
