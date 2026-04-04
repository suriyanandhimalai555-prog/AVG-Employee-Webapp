import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, MapPin, FileText, Clock } from 'lucide-react';
import { getISTToday } from '../lib/date';

const DOT_CONFIG = {
  present_office: { bg: 'bg-indigo',    ring: 'ring-indigo/20',    label: 'Office',   text: 'text-indigo' },
  present_field:  { bg: 'bg-emerald',   ring: 'ring-emerald/20',   label: 'Field',    text: 'text-emerald' },
  half_day:       { bg: 'bg-amber-500', ring: 'ring-amber-500/20', label: 'Half Day', text: 'text-amber-500' },
  absent:         { bg: 'bg-red-400',   ring: 'ring-red-400/20',   label: 'Absent',   text: 'text-red-500' },
};

const getRecordKey = (record) => {
  if (record.status === 'absent')   return 'absent';
  if (record.status === 'half_day') return 'half_day';
  if (record.mode === 'field')      return 'present_field';
  return 'present_office';
};

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const pad  = (n) => String(n).padStart(2, '0');

export const HistoryCalendar = ({ historyData = [], onDaySelect }) => {
  const today = new Date();
  const [viewDate, setViewDate]   = useState({ month: today.getMonth(), year: today.getFullYear() });
  const [selectedIso, setSelectedIso] = useState(getISTToday());

  const recordsByDate = useMemo(() => {
    const map = {};
    (historyData || []).forEach((r) => {
      const key = typeof r.date === 'string'
        ? r.date.slice(0, 10)
        : new Date(r.date).toISOString().slice(0, 10);
      map[key] = r;
    });
    return map;
  }, [historyData]);

  const calendarRows = useMemo(() => {
    const firstDay   = new Date(viewDate.year, viewDate.month, 1);
    const lastDay    = new Date(viewDate.year, viewDate.month + 1, 0);
    const startOffset = (firstDay.getDay() + 6) % 7;

    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) {
      const date   = new Date(viewDate.year, viewDate.month, d);
      const isoStr = `${viewDate.year}-${pad(viewDate.month + 1)}-${pad(d)}`;
      cells.push({ day: d, isoStr, record: recordsByDate[isoStr] || null, date });
    }

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [viewDate, recordsByDate]);

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

  const todayIso = getISTToday();

  const monthStats = useMemo(() => {
    const records = Object.values(recordsByDate).filter(r => {
      const iso = typeof r.date === 'string'
        ? r.date.slice(0, 10)
        : new Date(r.date).toISOString().slice(0, 10);
      const [yr, mo] = iso.split('-');
      return parseInt(yr) === viewDate.year && parseInt(mo) === viewDate.month + 1;
    });
    return {
      present: records.filter(r => r.status === 'present').length,
      absent:  records.filter(r => r.status === 'absent').length,
      field:   records.filter(r => r.mode === 'field').length,
    };
  }, [recordsByDate, viewDate]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">Attendance Log</p>
          <p className="text-base font-bold text-navy mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={prevMonth}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-navy/6 text-navy/35 hover:text-navy/70 transition-all duration-200 tactile-press"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={nextMonth}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-navy/6 text-navy/35 hover:text-navy/70 transition-all duration-200 tactile-press"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Calendar Card */}
      <div className="bg-white rounded-3xl card-shadow p-5 overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS.map((d, i) => (
            <div key={i} className="text-center text-[9px] font-bold text-navy/20 uppercase tracking-widest py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="space-y-0.5">
          {calendarRows.map((row, ri) => (
            <div key={ri} className="grid grid-cols-7">
              {Array.from({ length: 7 }).map((_, ci) => {
                const cell    = row[ci];
                if (!cell) return <div key={ci} />;

                const isToday    = cell.isoStr === todayIso;
                const isSelected = cell.isoStr === selectedIso;
                const isFuture   = cell.date > today && !isToday;
                const dotKey     = cell.record ? getRecordKey(cell.record) : null;
                const dot        = dotKey ? DOT_CONFIG[dotKey] : null;

                return (
                  <button
                    key={ci}
                    onClick={() => handleDayClick(cell)}
                    disabled={isFuture}
                    className={`flex flex-col items-center py-1.5 rounded-2xl transition-all duration-200
                      ${isSelected ? 'bg-indigo/6' : 'hover:bg-navy/4'}
                      ${isFuture   ? 'opacity-20 cursor-default' : 'tactile-press'}
                    `}
                  >
                    {/* Date circle */}
                    <span className={`text-[11px] font-bold leading-none w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200
                      ${isSelected && isToday   ? 'bg-indigo text-white shadow-md shadow-indigo/30'    : ''}
                      ${isSelected && !isToday  ? 'ring-2 ring-indigo/60 text-indigo'                 : ''}
                      ${!isSelected && isToday  ? 'text-indigo font-extrabold ring-1 ring-indigo/30'  : ''}
                      ${!isSelected && !isToday ? 'text-navy/55'                                      : ''}
                    `}>
                      {cell.day}
                    </span>

                    {/* Status dot */}
                    {dot ? (
                      <span className={`w-1.5 h-1.5 rounded-full mt-1 ${dot.bg}`} />
                    ) : !isFuture ? (
                      <span className="w-1.5 h-1.5 rounded-full mt-1 bg-navy/8" />
                    ) : (
                      <span className="w-1.5 h-1.5 mt-1" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-navy/5 flex-wrap">
          {Object.entries(DOT_CONFIG).map(([key, cfg]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${cfg.bg}`} />
              <span className="text-[9px] font-bold text-navy/30 uppercase tracking-wider">{cfg.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Monthly Quick Stats */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl p-4 card-shadow text-center border-t-2 border-indigo/20">
          <p className="text-xl font-bold text-indigo font-mono">{monthStats.present}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Present</p>
        </div>
        <div className="bg-white rounded-2xl p-4 card-shadow text-center border-t-2 border-red-400/20">
          <p className="text-xl font-bold text-red-500 font-mono">{monthStats.absent}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Absent</p>
        </div>
        <div className="bg-white rounded-2xl p-4 card-shadow text-center border-t-2 border-emerald/20">
          <p className="text-xl font-bold text-emerald font-mono">{monthStats.field}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Field</p>
        </div>
      </div>

      {/* Selected Day Detail */}
      <AnimatePresence mode="wait">
        {selectedRecord ? (
          <motion.div
            key={selectedIso + '-record'}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-3xl card-shadow overflow-hidden"
          >
            {/* Colored top strip */}
            <div className={`h-1 w-full ${DOT_CONFIG[getRecordKey(selectedRecord)]?.bg ?? 'bg-navy/10'}`} />

            <div className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest font-mono">
                    {new Date(selectedIso + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long', month: 'long', day: 'numeric',
                    })}
                  </p>
                  <p className={`text-sm font-bold mt-1 ${DOT_CONFIG[getRecordKey(selectedRecord)]?.text ?? 'text-navy'}`}>
                    {selectedRecord.status?.replace('_', ' ').toUpperCase()}
                    {' '}<span className="opacity-40">·</span>{' '}
                    {selectedRecord.mode?.toUpperCase()}
                  </p>
                </div>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  DOT_CONFIG[getRecordKey(selectedRecord)]?.bg ?? 'bg-navy/10'
                } text-white`}>
                  {selectedRecord.mode === 'field' ? <MapPin size={16} /> : <Clock size={16} />}
                </div>
              </div>

              {selectedRecord.check_in_time && (
                <div className="flex items-center gap-2 text-navy/40">
                  <Clock size={13} />
                  <p className="text-xs font-bold font-mono">
                    {new Date(selectedRecord.check_in_time).toLocaleTimeString('en-US', {
                      hour: 'numeric', minute: '2-digit', hour12: true,
                    })}
                  </p>
                </div>
              )}

              {selectedRecord.check_in_lat && selectedRecord.check_in_lng && (
                <a
                  href={`https://maps.google.com/?q=${selectedRecord.check_in_lat},${selectedRecord.check_in_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-indigo hover:text-indigo/70 transition-colors duration-200 group"
                >
                  <MapPin size={13} />
                  <p className="text-xs font-bold font-mono group-hover:underline underline-offset-2">
                    {Number(selectedRecord.check_in_lat).toFixed(5)}, {Number(selectedRecord.check_in_lng).toFixed(5)}
                  </p>
                </a>
              )}

              {selectedRecord.field_note && (
                <div className="flex items-start gap-2 pt-3 border-t border-navy/5">
                  <FileText size={13} className="text-navy/25 mt-0.5 shrink-0" />
                  <p className="text-xs text-navy/45 leading-relaxed">{selectedRecord.field_note}</p>
                </div>
              )}
            </div>
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
