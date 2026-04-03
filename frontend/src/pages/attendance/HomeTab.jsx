import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { getISTToday } from '../../lib/date';
import { ArrowRight, AlertCircle, Building2, Users } from 'lucide-react';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/attendance/PageHeader';
import { AlertCard } from '../../components/attendance/AlertCard';
import { StatsGrid } from '../../components/attendance/StatsGrid';
import { StaffCard } from '../../components/attendance/StaffCard';
import { HistoryCalendar } from '../../components/HistoryCalendar';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetSummaryQuery,
  useGetHistoryQuery,
  useGetEmployeesQuery,
} from '../../store/api/apiSlice';

/** Today's stats card — shared by BM / GM / Director / MD / BranchAdmin home views. */
const TeamStatsCard = ({ summary, isLoading, thirdStat }) => (
  <Card className="p-0 border-none shadow-none bg-white rounded-3xl overflow-hidden card-shadow">
    <div className="flex divide-x divide-navy/5">
      <div className="flex-1 p-6 text-center">
        <p className="text-2xl font-bold text-navy font-mono">{isLoading ? '—' : (summary?.present ?? 0)}</p>
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Present</p>
      </div>
      <div className="flex-1 p-6 text-center">
        <p className="text-2xl font-bold text-red-500 font-mono">{isLoading ? '—' : (summary?.absent ?? 0)}</p>
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Absent</p>
      </div>
      <div className="flex-1 p-6 text-center">
        <p className={`text-2xl font-bold font-mono ${thirdStat?.color ?? 'text-navy'}`}>
          {isLoading ? '—' : (thirdStat?.value ?? 0)}
        </p>
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">
          {thirdStat?.label ?? 'Field'}
        </p>
      </div>
    </div>
  </Card>
);

export const HomeTab = ({ onNavigateToAttendance, onOpenUserManagement }) => {
  const user = useSelector(selectCurrentUser);

  const nowDate = new Date();
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [calYear, setCalYear] = useState(nowDate.getFullYear());

  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id },
  );
  const { data: historyData = [] } = useGetHistoryQuery(
    { userId: user?.id, month: calMonth, year: calYear },
    { skip: !user?.id },
  );
  // Only fetched for branch_admin (needs "needs action" count); skipped for all other roles
  const { data: employeesResult, isLoading: empLoading } = useGetEmployeesQuery(
    { viewerId: user?.id },
    { skip: !user?.id || user?.role !== 'branch_admin' },
  );

  const todayRecord = summary?.today ?? null;
  // Use IST date to avoid showing yesterday's date on devices not set to IST
  const todayFormatted = new Date(getISTToday() + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // employeesResult is { data: [], total, ... } — extract the array before filtering
  const needsActionCount = (employeesResult?.data ?? []).filter((e) => !e.has_smartphone && !e.status).length;

  return (
    <motion.div
      key="home"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex-1"
    >
      <PageHeader user={user} title="Workforce" />

      <div className="px-6 mb-6">
        <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-1 font-mono">
          {todayFormatted}
        </p>
        <h2 className="text-3xl font-bold text-navy tracking-tight">Home</h2>
      </div>

      {/* ── Sales Officer / ABM ── */}
      {['sales_officer', 'abm'].includes(user?.role) && (
        <>
          <AlertCard
            isMarked={todayRecord}
            onAction={onNavigateToAttendance}
          />
          {/* myMonth holds this month's aggregated stats — not just today's */}
          <StatsGrid summary={summary?.myMonth} isLoading={summaryLoading} />
          <div className="px-6 pb-32">
            <HistoryCalendar
              historyData={historyData}
              onDaySelect={(cell) => {
                const [yr, mo] = cell.isoStr.split('-');
                setCalMonth(parseInt(mo));
                setCalYear(parseInt(yr));
              }}
            />
          </div>
        </>
      )}

      {/* ── Branch Manager ── */}
      {user?.role === 'branch_manager' && (
        <div className="px-6 pb-32 space-y-6">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">
            Today's Team
          </p>
          <TeamStatsCard
            summary={summary}
            isLoading={summaryLoading}
            thirdStat={{
              value: summary?.not_marked ?? summary?.notMarked ?? 0,
              label: 'Not Marked',
              color: 'text-amber-500',
            }}
          />
          <button
            onClick={onNavigateToAttendance}
            className="w-full p-5 bg-white rounded-3xl card-shadow flex items-center gap-4 tactile-press"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo">
              <Users size={22} />
            </div>
            <div className="flex-1 text-left">
              <p className="text-sm font-bold text-navy">View Full Team List</p>
              <p className="text-[10px] font-medium text-navy/40 mt-0.5">All team attendance records</p>
            </div>
            <ArrowRight size={16} className="text-navy/30" />
          </button>
          <HistoryCalendar
            historyData={historyData}
            onDaySelect={(cell) => {
              const [yr, mo] = cell.isoStr.split('-');
              setCalMonth(parseInt(mo));
              setCalYear(parseInt(yr));
            }}
          />
        </div>
      )}

      {/* ── GM / Director / MD ── */}
      {['gm', 'director', 'md'].includes(user?.role) && (
        <div className="px-6 pb-32 space-y-6">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">
            {user?.role === 'md' ? 'Organisation Overview' : 'Overseen Branches'}
          </p>
          <TeamStatsCard
            summary={summary}
            isLoading={summaryLoading}
            thirdStat={{ value: summary?.field ?? 0, label: 'Field', color: 'text-indigo' }}
          />

          {/* Per-branch breakdown — rendered if the API returns a branches array */}
          {summary?.branches?.length > 0 && (
            <div className="space-y-3">
              {summary.branches.map((branch) => (
                <div key={branch.id} className="p-4 bg-white rounded-2xl card-shadow flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-indigo/10 flex items-center justify-center text-indigo">
                    <Building2 size={18} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-bold text-navy">{branch.name}</p>
                    <p className="text-[10px] font-medium text-navy/40 mt-0.5">
                      {branch.present ?? 0} present today
                    </p>
                  </div>
                  {branch.presentPercent != null && (
                    <p className="text-sm font-bold text-indigo">{branch.presentPercent}%</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <StaffCard onOpen={onOpenUserManagement} />
        </div>
      )}

      {/* ── Branch Admin ── */}
      {user?.role === 'branch_admin' && (
        <div className="px-6 pb-32 space-y-6">
          <TeamStatsCard
            summary={summary}
            isLoading={summaryLoading}
            thirdStat={{
              value: empLoading ? '—' : needsActionCount,
              label: 'Need Action',
              color: 'text-amber-500',
            }}
          />

          {needsActionCount > 0 && (
            <button
              onClick={onNavigateToAttendance}
              className="w-full p-5 rounded-3xl gradient-yellow flex items-center gap-4 tactile-press shadow-xl shadow-yellow/20"
            >
              <div className="w-12 h-12 rounded-2xl bg-navy/10 flex items-center justify-center text-navy">
                <AlertCircle size={22} />
              </div>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-navy">
                  {needsActionCount} employee{needsActionCount !== 1 ? 's' : ''} need marking
                </p>
                <p className="text-[10px] font-medium text-navy/60 mt-0.5">
                  No smartphone — mark for them
                </p>
              </div>
              <ArrowRight size={16} className="text-navy/40" />
            </button>
          )}

          <StaffCard onOpen={onOpenUserManagement} />
          <HistoryCalendar
            historyData={historyData}
            onDaySelect={(cell) => {
              const [yr, mo] = cell.isoStr.split('-');
              setCalMonth(parseInt(mo));
              setCalYear(parseInt(yr));
            }}
          />
        </div>
      )}
    </motion.div>
  );
};
