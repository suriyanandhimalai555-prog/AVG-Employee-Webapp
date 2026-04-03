import { useState } from 'react';
import { Loader2, MapPin, Clock, FileText, AlertCircle } from 'lucide-react';
import { GlassModal } from '../GlassModal';
import { HistoryCalendar } from '../HistoryCalendar';
import { useGetHistoryQuery, useGetPhotoUrlQuery } from '../../store/api/apiSlice';
import { getISTToday } from '../../lib/date';

/**
 * Modal that lets any admin view an individual employee's full attendance history.
 * Reuses HistoryCalendar (already shows calendar + day-detail card).
 * Adds photo display and correction audit info on top of what the calendar shows.
 *
 * Props:
 *   isOpen    — boolean
 *   onClose   — function
 *   employee  — employee row object from getEmployees / getBranchEmployees
 */
export const EmployeeHistoryModal = ({ isOpen, onClose, employee }) => {
  const today = getISTToday();
  const [yr, mo] = today.split('-');
  const [month, setMonth] = useState(parseInt(mo));
  const [year, setYear] = useState(parseInt(yr));

  // Selected record is lifted up from HistoryCalendar so we can show photo + audit info
  const [selectedRecord, setSelectedRecord] = useState(null);

  const { data: historyData = [], isFetching } = useGetHistoryQuery(
    { userId: employee?.id, month, year },
    { skip: !isOpen || !employee?.id }
  );

  // Only fetch photo URL when a field record with a photo is selected
  const { data: photoData, isLoading: photoLoading } = useGetPhotoUrlQuery(
    selectedRecord?.photo_key,
    { skip: !selectedRecord?.photo_key }
  );

  const handleDaySelect = (cell) => {
    if (!cell) return;
    setSelectedRecord(cell.record ?? null);
    // Sync the query when the user clicks a day in a different month
    const [y, m] = cell.isoStr.split('-');
    const parsedY = parseInt(y);
    const parsedM = parseInt(m);
    if (parsedY !== year || parsedM !== month) {
      setYear(parsedY);
      setMonth(parsedM);
    }
  };

  return (
    <GlassModal
      isOpen={isOpen}
      onClose={onClose}
      title={employee?.name ?? 'Attendance History'}
    >
      <div className="overflow-y-auto max-h-[65vh] -mx-8 px-8 pb-2">
        {isFetching && (
          <div className="flex justify-center py-4">
            <Loader2 className="animate-spin text-indigo" size={20} />
          </div>
        )}

        <HistoryCalendar
          historyData={historyData}
          onDaySelect={handleDaySelect}
        />

        {/* Photo — shown below the calendar when a field record with a photo is selected */}
        {selectedRecord?.photo_key && (
          <div className="mt-4 rounded-3xl overflow-hidden bg-navy/5 border border-navy/5 relative h-48 flex items-center justify-center">
            {photoLoading ? (
              <Loader2 className="animate-spin text-navy/30" size={24} />
            ) : photoData?.downloadUrl ? (
              <img
                src={photoData.downloadUrl}
                alt="Field capture"
                className="w-full h-full object-cover"
              />
            ) : (
              <p className="text-xs font-bold text-navy/30">Photo unavailable</p>
            )}
          </div>
        )}

        {/* Correction audit info — shown when the selected record was corrected by an admin */}
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
    </GlassModal>
  );
};
