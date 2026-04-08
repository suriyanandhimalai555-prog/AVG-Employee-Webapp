import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import { HistoryCalendar } from '../components/HistoryCalendar';
import { useGetHistoryQuery, useGetPhotoUrlQuery, useGetUsersQuery } from '../store/api/apiSlice';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../store/slices/authSlice';
import { getISTToday } from '../lib/date';

export const PersonAttendancePage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const me = useSelector(selectCurrentUser);

  const today = getISTToday();
  const [yr, mo] = today.split('-');
  const [month, setMonth] = useState(parseInt(mo, 10));
  const [year, setYear] = useState(parseInt(yr, 10));
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const { data: usersResult = {} } = useGetUsersQuery(
    { viewerId: me?.id, limit: 500 },
    { skip: !me?.id }
  );
  const targetUser = useMemo(
    () => (usersResult.data ?? []).find((u) => u.id === userId) ?? null,
    [usersResult.data, userId]
  );

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
    const nextYear = parseInt(y, 10);
    const nextMonth = parseInt(m, 10);
    if (nextYear !== year || nextMonth !== month) {
      setYear(nextYear);
      setMonth(nextMonth);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen bg-surface"
    >
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-navy/5 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate('/')}
          className="p-2 rounded-xl text-navy/40 hover:text-navy hover:bg-navy/5 transition-all tactile-press shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full bg-navy/5 overflow-hidden shrink-0">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(targetUser?.name ?? 'Employee')}&background=0B1C30&color=fff&size=36`}
            alt=""
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate leading-tight">{targetUser?.name ?? 'Employee'}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-bold text-indigo uppercase tracking-widest">
              {(targetUser?.role ?? '').replace(/_/g, ' ')}
            </span>
            {targetUser?.branchName && (
              <span className="text-[9px] font-bold text-navy/30 uppercase tracking-widest truncate">
                · {targetUser.branchName}
              </span>
            )}
          </div>
        </div>
        {isFetching && <Loader2 className="animate-spin text-indigo shrink-0" size={16} />}
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <HistoryCalendar
          historyData={historyData}
          onDaySelect={handleDaySelect}
        />

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

export default PersonAttendancePage;
