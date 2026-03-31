import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, Camera, FileText, Clock } from 'lucide-react';

// Dot colors mapped to attendance status/mode
const DOT_CONFIG = {
  present_office: { bg: 'bg-indigo',   ring: 'ring-indigo/20',   label: 'Office' },
  present_field:  { bg: 'bg-emerald',  ring: 'ring-emerald/20',  label: 'Field' },
  half_day:       { bg: 'bg-amber-500',ring: 'ring-amber-500/20',label: 'Half Day' },
  absent:         { bg: 'bg-red-500',  ring: 'ring-red-500/20',  label: 'Absent' },
};

const getRecordKey = (record) => {
  if (record.status === 'absent') return 'absent';
  if (record.status === 'half_day') return 'half_day';
  if (record.mode === 'field') return 'present_field';
  return 'present_office';
};

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const HistoryCalendar = ({ historyData = [], onDaySelect }) => {
  const today = new Date();
  const [viewDate, setViewDate] = useState({ month: today.getMonth(), year: today.getFullYear() });

  // Build a lookup map: { 'YYYY-MM-DD': record }
  const recordsByDate = useMemo(() => {
    const map = {};
    (historyData || []).forEach((r) => {
      const key = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      map[key] = r;
    });
    return map;
  }, [historyData]);

  // Build calendar grid — returns array of { date, dayOfWeek, isoStr, record | null }
  const calendarRows = useMemo(() => {
    const firstDay = new Date(viewDate.year, viewDate.month, 1);
    const lastDay  = new Date(viewDate.year, viewDate.month + 1, 0);

    // Monday = 0 ... Sunday = 6
    const startOffset = (firstDay.getDay() + 6) % 7; 

    const cells = [];
    // Pad start
    for (let i = 0; i < startOffset; i++) cells.push(null);

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date = new Date(viewDate.year, viewDate.month, d);
      const isoStr = date.toISOString().slice(0, 10);
      cells.push({ day: d, isoStr, record: recordsByDate[isoStr] || null, date });
    }

    // Chunk into rows of 7
    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewDate, recordsByDate]);

  const [selectedIso, setSelectedIso] = useState(today.toISOString().slice(0, 10));
  const selectedRecord = recordsByDate[selectedIso] || null;

  const monthLabel = new Date(viewDate.year, viewDate.month, 1)
    .toLocaleString('default', { month: 'long', year: 'numeric' });

  const prevMonth = () => setViewDate(v => {
    const d = new Date(v.year, v.month - 1, 1);
    return { month: d.getMonth(), year: d.getFullYear() };
  });
  const nextMonth = () => setViewDate(v => {
    const d = new Date(v.year, v.month + 1, 1);
    return { month: d.getMonth(), year: d.getFullYear() };
  });

  const handleDayClick = (cell) => {
    if (!cell) return;
    setSelectedIso(cell.isoStr);
    onDaySelect?.(cell);
  };

  const todayIso = today.toISOString().slice(0, 10);

  // Monthly stats from the calendar data currently viewed
  const monthStats = useMemo(() => {
    const records = Object.values(recordsByDate).filter(r => {
      const recIso = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const [yr, mo] = recIso.split('-');
      return parseInt(yr) === viewDate.year && parseInt(mo) === viewDate.month + 1;
    });
    return {
      present: records.filter(r => r.status === 'present').length,
      absent: records.filter(r => r.status === 'absent').length,
      field: records.filter(r => r.mode === 'field').length,
      total: records.length,
    };
  }, [recordsByDate, viewDate]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">Attendance Log</p>
          <p className="text-base font-bold text-navy">{monthLabel}</p>
        </div>
        <div className="flex gap-1">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-navy/5 text-navy/40 hover:text-navy transition-all tactile-press">
            <ChevronLeft size={18} />
          </button>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-navy/5 text-navy/40 hover:text-navy transition-all tactile-press">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="bg-white rounded-3xl card-shadow p-5 overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-3">
          {DAYS.map((d, i) => (
            <div key={i} className="text-center text-[10px] font-bold text-navy/25 uppercase tracking-widest py-1">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="space-y-1">
          {calendarRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7">
              {Array.from({ length: 7 }).map((_, ci) => {
                const cell = row[ci];
                if (!cell) return <div key={ci} />;

                const isToday = cell.isoStr === todayIso;
                const isSelected = cell.isoStr === selectedIso;
                const isFuture = cell.date > today && !isToday;
                const dotKey = cell.record ? getRecordKey(cell.record) : null;
                const dot = dotKey ? DOT_CONFIG[dotKey] : null;

                return (
                  <button
                    key={ci}
                    onClick={() => handleDayClick(cell)}
                    disabled={isFuture}
                    className={`flex flex-col items-center py-2 rounded-2xl transition-all duration-200 relative
                      ${isSelected  ? 'bg-indigo/8' : 'hover:bg-navy/5'}
                      ${isFuture    ? 'opacity-25 cursor-default' : 'tactile-press'}
                    `}
                  >
                    {/* Date Number */}
                    <span className={`text-xs font-bold leading-none mb-1.5 w-7 h-7 flex items-center justify-center rounded-full transition-all
                      ${isSelected && isToday  ? 'bg-indigo text-white shadow-lg shadow-indigo/30' : ''}
                      ${isSelected && !isToday ? 'ring-2 ring-indigo text-indigo' : ''}
                      ${!isSelected && isToday  ? 'text-indigo font-extrabold' : ''}
                      ${!isSelected && !isToday ? 'text-navy/60' : ''}
                    `}>
                      {cell.day}
                    </span>

                    {/* Status Dot */}
                    {dot ? (
                      <span className={`w-1.5 h-1.5 rounded-full ${dot.bg} ring-2 ${dot.ring}`} />
                    ) : !isFuture ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-navy/10" />
                    ) : (
                      <span className="w-1.5 h-1.5" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-navy/5 flex-wrap">
          {Object.entries(DOT_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.bg}`} />
              <span className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 card-shadow text-center">
          <p className="text-lg font-bold text-indigo font-mono">{monthStats.present}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Present</p>
        </div>
        <div className="bg-white rounded-2xl p-4 card-shadow text-center">
          <p className="text-lg font-bold text-red-500 font-mono">{monthStats.absent}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Absent</p>
        </div>
        <div className="bg-white rounded-2xl p-4 card-shadow text-center">
          <p className="text-lg font-bold text-emerald font-mono">{monthStats.field}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Field</p>
        </div>
      </div>

      {/* Selected Day Detail Card */}
      <AnimatePresence mode="wait">
        {selectedRecord ? (
          <motion.div
            key={selectedIso}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-3xl card-shadow p-5 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest font-mono">
                  {new Date(selectedIso + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
                <p className={`text-sm font-bold mt-0.5 ${
                  selectedRecord.status === 'absent' ? 'text-red-500' :
                  selectedRecord.status === 'half_day' ? 'text-amber-500' : 'text-emerald'
                }`}>
                  {selectedRecord.status?.replace('_', ' ').toUpperCase()} — {selectedRecord.mode?.toUpperCase()}
                </p>
              </div>
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                DOT_CONFIG[getRecordKey(selectedRecord)]?.bg
              } text-white`}>
                {selectedRecord.mode === 'field' ? <MapPin size={18} /> : <Clock size={18} />}
              </div>
            </div>

            {selectedRecord.check_in_time && (
              <div className="flex items-center gap-2 text-navy/40">
                <Clock size={14} />
                <p className="text-xs font-bold font-mono">
                  {new Date(selectedRecord.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </p>
              </div>
            )}

            {selectedRecord.check_in_lat && selectedRecord.check_in_lng && (
              <a
                href={`https://maps.google.com/?q=${selectedRecord.check_in_lat},${selectedRecord.check_in_lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-indigo hover:underline"
              >
                <MapPin size={14} />
                <p className="text-xs font-bold font-mono">
                  {Number(selectedRecord.check_in_lat).toFixed(5)}, {Number(selectedRecord.check_in_lng).toFixed(5)}
                </p>
              </a>
            )}

            {selectedRecord.field_note && (
              <div className="flex items-start gap-2 pt-2 border-t border-navy/5">
                <FileText size={14} className="text-navy/30 mt-0.5 shrink-0" />
                <p className="text-xs text-navy/50 leading-relaxed">{selectedRecord.field_note}</p>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="bg-white rounded-3xl card-shadow p-6 text-center"
          >
            <p className="text-[10px] font-bold text-navy/20 uppercase tracking-widest">
              {selectedIso === todayIso ? 'No record yet today' : 'No attendance record'}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default HistoryCalendar;
