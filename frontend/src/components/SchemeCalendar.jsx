import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';
import {
  getCurrentPeriod,
  getNextPeriod,
  getPrevPeriod,
  getPeriodForDate,
} from '../lib/schemePeriod';

// Reusable 7-to-7 period picker used across all scheme, salary, and incentive pages.
// Shows the current business period (7th to 6th) with prev/next navigation.
// onPeriodChange is called with { label, startDate, endDate, periodMonth, periodYear }
export const SchemeCalendar = ({ onPeriodChange, initialDate, compact = false, allowFuture = false }) => {
  const [period, setPeriod] = useState(() => {
    const p = initialDate ? getPeriodForDate(initialDate) : getCurrentPeriod();
    return p;
  });

  const current = getCurrentPeriod();
  const isCurrent = period.periodMonth === current.periodMonth && period.periodYear === current.periodYear;

  const nextPeriod = getNextPeriod(period.periodMonth, period.periodYear);
  const canGoNext = allowFuture || (
    nextPeriod.periodYear < current.periodYear ||
    (nextPeriod.periodYear === current.periodYear && nextPeriod.periodMonth <= current.periodMonth)
  );

  const handlePrev = () => {
    const prev = getPrevPeriod(period.periodMonth, period.periodYear);
    setPeriod(prev);
    onPeriodChange?.(prev);
  };

  const handleNext = () => {
    if (!canGoNext) return;
    const next = getNextPeriod(period.periodMonth, period.periodYear);
    setPeriod(next);
    onPeriodChange?.(next);
  };

  const handleToday = () => {
    const p = getCurrentPeriod();
    setPeriod(p);
    onPeriodChange?.(p);
  };

  // Visual calendar showing which days are in the period
  const calendarDays = useMemo(() => {
    const start = new Date(period.startDate + 'T00:00:00');
    const end = new Date(period.endDate + 'T00:00:00');
    const days = [];
    const d = new Date(start);
    while (d <= end) {
      days.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return days;
  }, [period]);

  // Group days by week (Mon-Sun)
  const weeks = useMemo(() => {
    if (calendarDays.length === 0) return [];

    const firstDay = calendarDays[0];
    const lastDay = calendarDays[calendarDays.length - 1];

    // Find the Monday of the week containing the first day
    const startOfWeek = new Date(firstDay);
    const dayOfWeek = (startOfWeek.getDay() + 6) % 7; // Mon=0
    startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);

    // Find the Sunday of the week containing the last day
    const endOfWeek = new Date(lastDay);
    const endDayOfWeek = (endOfWeek.getDay() + 6) % 7;
    endOfWeek.setDate(endOfWeek.getDate() + (6 - endDayOfWeek));

    const periodStart = firstDay.getTime();
    const periodEnd = lastDay.getTime();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    const rows = [];
    const cursor = new Date(startOfWeek);
    let currentRow = [];

    while (cursor <= endOfWeek) {
      const t = cursor.getTime();
      currentRow.push({
        date: new Date(cursor),
        day: cursor.getDate(),
        inPeriod: t >= periodStart && t <= periodEnd,
        isToday: t === todayTime,
        isFuture: t > todayTime,
        monthLabel: cursor.getDate() === 1 || (currentRow.length === 0 && rows.length === 0)
          ? cursor.toLocaleString('default', { month: 'short' })
          : null,
      });

      if (currentRow.length === 7) {
        rows.push(currentRow);
        currentRow = [];
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    if (currentRow.length > 0) rows.push(currentRow);

    return rows;
  }, [calendarDays]);

  if (compact) {
    return (
      <div className="bg-white rounded-2xl card-shadow border border-border p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-navy/5 text-navy/40 hover:text-navy/70 transition-all tactile-press"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={isCurrent ? undefined : handleToday}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-navy/3 transition-colors"
          >
            <Calendar size={13} className="text-indigo" />
            <div className="text-center">
              <p className="text-xs font-bold text-navy">{period.label}</p>
              {isCurrent && (
                <p className="text-[8px] font-bold text-indigo uppercase tracking-widest">Current Period</p>
              )}
            </div>
          </button>

          <button
            onClick={handleNext}
            disabled={!canGoNext}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-navy/5 text-navy/40 hover:text-navy/70 transition-all tactile-press disabled:opacity-20 disabled:cursor-default"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl card-shadow border border-border overflow-hidden">
      {/* Period header */}
      <div className="p-4 flex items-center justify-between border-b border-border">
        <button
          onClick={handlePrev}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-navy/5 text-navy/40 hover:text-navy/70 transition-all tactile-press"
        >
          <ChevronLeft size={18} />
        </button>

        <button
          onClick={isCurrent ? undefined : handleToday}
          className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-2xl hover:bg-navy/3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-indigo" />
            <p className="text-sm font-bold text-navy">{period.label}</p>
          </div>
          {isCurrent ? (
            <p className="text-[8px] font-bold text-indigo uppercase tracking-widest">Current Period</p>
          ) : (
            <p className="text-[8px] font-bold text-navy/30 uppercase tracking-widest">Tap to go to current</p>
          )}
        </button>

        <button
          onClick={handleNext}
          disabled={!canGoNext}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-navy/5 text-navy/40 hover:text-navy/70 transition-all tactile-press disabled:opacity-20 disabled:cursor-default"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Visual calendar grid */}
      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[9px] font-bold text-navy/20 uppercase tracking-widest py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="space-y-0.5">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((cell, ci) => (
                <div
                  key={ci}
                  className={`flex flex-col items-center py-1 rounded-xl transition-all ${
                    cell.inPeriod
                      ? cell.isToday
                        ? 'bg-indigo/10'
                        : cell.isFuture
                          ? 'opacity-40'
                          : ''
                      : 'opacity-15'
                  }`}
                >
                  {cell.monthLabel && (
                    <span className="text-[7px] font-bold text-indigo uppercase tracking-wider leading-none mb-0.5">
                      {cell.monthLabel}
                    </span>
                  )}
                  <span className={`text-[10px] font-bold leading-none w-6 h-6 flex items-center justify-center rounded-full ${
                    cell.isToday && cell.inPeriod
                      ? 'bg-indigo text-white'
                      : cell.inPeriod
                        ? 'text-navy/60'
                        : 'text-navy/30'
                  }`}>
                    {cell.day}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Period info footer */}
      <div className="px-4 pb-4">
        <div className="bg-navy/3 rounded-2xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-indigo" />
            <span className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Period Days</span>
          </div>
          <span className="text-xs font-bold text-navy">{calendarDays.length} days</span>
        </div>
      </div>
    </div>
  );
};

export default SchemeCalendar;
