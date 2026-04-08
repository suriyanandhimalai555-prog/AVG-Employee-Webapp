import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { getISTToday } from '../../lib/date';
import { ArrowRight, AlertCircle, Building2, Users, ChevronRight } from 'lucide-react';
import { Avatar } from '../../components/Avatar';
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
  useGetTeamHistoryQuery,
  useGetEmployeesQuery,
  useGetUsersQuery,
} from '../../store/api/apiSlice';

/** Today's stats card — shared by BM / GM / Director / MD / BranchAdmin home views. */
const TeamStatsCard = ({ summary, isLoading, thirdStat }) => (
  <Card className="p-0 border-none shadow-none bg-white rounded-3xl overflow-hidden card-shadow">
    <div className="flex divide-x divide-navy/5">
      <div className="flex-1 p-5 text-center group">
        <p className="text-2xl font-bold text-indigo font-mono transition-transform duration-200 group-hover:scale-105">
          {isLoading ? '—' : (summary?.present ?? 0)}
        </p>
        <div className="w-5 h-0.5 rounded-full bg-indigo/20 mx-auto mt-1.5 mb-1" />
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Present</p>
      </div>
      <div className="flex-1 p-5 text-center group">
        <p className="text-2xl font-bold text-red-500 font-mono transition-transform duration-200 group-hover:scale-105">
          {isLoading ? '—' : (summary?.absent ?? 0)}
        </p>
        <div className="w-5 h-0.5 rounded-full bg-red-400/20 mx-auto mt-1.5 mb-1" />
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Absent</p>
      </div>
      <div className="flex-1 p-5 text-center group">
        <p className={`text-2xl font-bold font-mono transition-transform duration-200 group-hover:scale-105 ${thirdStat?.color ?? 'text-navy/70'}`}>
          {isLoading ? '—' : (thirdStat?.value ?? 0)}
        </p>
        <div className="w-5 h-0.5 rounded-full bg-navy/10 mx-auto mt-1.5 mb-1" />
        <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">
          {thirdStat?.label ?? 'Field'}
        </p>
      </div>
    </div>
  </Card>
);

const TEAM_LIST_ROLES = ['abm', 'branch_manager'];

const TeamListSection = ({ title = 'My Team', members = [], onOpenCalendar }) => {
  if (!members.length) return null;
  return (
    <div className="px-6 pb-4">
      <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
        {title}
      </p>
      <div className="bg-white rounded-3xl card-shadow divide-y divide-navy/5 overflow-hidden">
        {members.map((emp) => (
          <button
            key={emp.id}
            onClick={() => onOpenCalendar?.(emp)}
            className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy/3 transition-all duration-200 text-left tactile-press group"
          >
            <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
              <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={32} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-navy truncate">{emp.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35">
                  {(emp.role ?? '').replace(/_/g, ' ')}
                </p>
                <span className="text-[8px] text-navy/20">•</span>
                <p className={`text-[9px] font-bold uppercase tracking-widest ${
                  emp.status === 'present' ? 'text-emerald' :
                  emp.status === 'absent'  ? 'text-red-400'  : 'text-navy/30'
                }`}>
                  {emp.status ? emp.status.replace('_', ' ') : 'Not marked'}
                </p>
              </div>
            </div>
            <ChevronRight size={14} className="text-navy/15 transition-all duration-200 group-hover:text-navy/35 group-hover:translate-x-0.5 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

const LeadershipSection = ({ title, members = [], onOpenList }) => {
  if (!members.length) return null;
  return (
    <div className="bg-white rounded-3xl card-shadow overflow-hidden">
      <button
        onClick={onOpenList}
        className="w-full flex items-center gap-4 px-5 py-4 text-left tactile-press hover:bg-navy/3 transition-all duration-200"
      >
        <div className="w-10 h-10 rounded-xl bg-indigo/8 flex items-center justify-center text-indigo shrink-0">
          <Users size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-navy truncate">{title}</p>
          <p className="text-[10px] font-medium text-navy/40 mt-0.5">{members.length} total</p>
        </div>
        <ChevronRight size={14} className="text-navy/25 shrink-0" />
      </button>
    </div>
  );
};

export const HomeTab = ({ onNavigateToAttendance, onOpenUserManagement, onOpenCalendar, onBranchSelect, onOpenLeadershipList }) => {
  const user = useSelector(selectCurrentUser);

  const nowDate = new Date();
  const [calMonth, setCalMonth] = useState(nowDate.getMonth() + 1);
  const [calYear, setCalYear] = useState(nowDate.getFullYear());

  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id, refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  // Self history — only for sales_officer (their own record)
  const { data: historyData = [] } = useGetHistoryQuery(
    { userId: user?.id, month: calMonth, year: calYear },
    { skip: !user?.id || user?.role !== 'sales_officer', refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );

  // Team history — aggregated counts for all manager/admin roles; skipped for sales_officer
  const { data: teamHistoryData = [] } = useGetTeamHistoryQuery(
    { month: calMonth, year: calYear },
    { skip: !user?.id || user?.role === 'sales_officer', refetchOnMountOrArgChange: true, refetchOnFocus: true },
  );
  // Fetched for branch_admin (needs "needs action" count) and abm (team list)
  const { data: employeesResult, isLoading: empLoading } = useGetEmployeesQuery(
    { viewerId: user?.id },
    { skip: !user?.id || !['branch_admin', ...TEAM_LIST_ROLES].includes(user?.role) },
  );
  const { data: gmUsersResult = {} } = useGetUsersQuery(
    { viewerId: user?.id, role: 'gm', limit: 500 },
    { skip: !user?.id || !['director', 'md'].includes(user?.role) }
  );
  const { data: directorUsersResult = {} } = useGetUsersQuery(
    { viewerId: user?.id, role: 'director', limit: 500 },
    { skip: !user?.id || user?.role !== 'md' }
  );

  const todayRecord = summary?.today ?? null;
  // Use IST date to avoid showing yesterday's date on devices not set to IST
  const todayFormatted = new Date(getISTToday() + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // employeesResult is { data: [], total, ... } — extract the array before filtering
  const needsActionCount = (employeesResult?.data ?? []).filter((e) => !e.has_smartphone && !e.status).length;
  const teamMembers = employeesResult?.data ?? [];
  const gmMembers = (gmUsersResult?.data ?? []).filter((u) =>
    user?.role === 'director' ? u.managerId === user.id : true
  );
  const directorMembers = directorUsersResult?.data ?? [];

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

      {/* ── Sales Officer ── */}
      {user?.role === 'sales_officer' && (
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

      {/* ── ABM ── */}
      {user?.role === 'abm' && (
        <>
          <AlertCard
            isMarked={todayRecord}
            onAction={onNavigateToAttendance}
          />
          <StatsGrid summary={summary?.myMonth} isLoading={summaryLoading} />

          {/* Team list — Sales Officers under this ABM */}
          <TeamListSection members={teamMembers} onOpenCalendar={onOpenCalendar} />

          <div className="px-6 pb-32">
            <HistoryCalendar
              historyData={teamHistoryData}
              mode="team"
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
            className="w-full p-5 bg-white rounded-3xl card-shadow flex items-center gap-4 tactile-press group hover:shadow-lg hover:shadow-navy/6 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-2xl bg-indigo/8 flex items-center justify-center text-indigo transition-all duration-300 group-hover:bg-indigo group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo/25">
              <Users size={22} />
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-sm font-bold text-navy">View Full Team List</p>
              <p className="text-[10px] font-medium text-navy/40 mt-0.5">All team attendance records</p>
            </div>
            <ArrowRight size={16} className="text-navy/25 transition-all duration-300 group-hover:text-navy/50 group-hover:translate-x-1 shrink-0" />
          </button>

          <TeamListSection members={teamMembers} onOpenCalendar={onOpenCalendar} />
          <HistoryCalendar
            historyData={teamHistoryData}
            mode="team"
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
            <div className="space-y-2">
              {summary.branches.map((branch) => (
                <button
                  key={branch.id}
                  onClick={() => onBranchSelect?.(branch)}
                  className="w-full p-4 bg-white rounded-2xl card-shadow flex items-center gap-4 hover-lift tactile-press group text-left transition-all duration-200"
                >
                  <div className="w-10 h-10 rounded-xl bg-indigo/8 flex items-center justify-center text-indigo shrink-0 group-hover:bg-indigo group-hover:text-white transition-all duration-300">
                    <Building2 size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-navy truncate">{branch.name}</p>
                    <p className="text-[10px] font-medium text-navy/40 mt-0.5">
                      {branch.present ?? 0} present today
                    </p>
                  </div>
                  {branch.presentPercent != null ? (
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-indigo">{branch.presentPercent}%</p>
                      <div className="w-12 h-1 bg-navy/8 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-indigo/60 rounded-full transition-all duration-500"
                          style={{ width: `${branch.presentPercent}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <ChevronRight size={14} className="text-navy/15 group-hover:text-navy/35 group-hover:translate-x-0.5 transition-all duration-200 shrink-0" />
                  )}
                </button>
              ))}
            </div>
          )}

          {user?.role === 'director' && (
            <LeadershipSection
              title="General Managers"
              members={gmMembers}
              onOpenList={() => onOpenLeadershipList?.('gms')}
            />
          )}
          {user?.role === 'md' && (
            <>
              <LeadershipSection
                title="Directors"
                members={directorMembers}
                onOpenList={() => onOpenLeadershipList?.('directors')}
              />
              <LeadershipSection
                title="General Managers"
                members={gmMembers}
                onOpenList={() => onOpenLeadershipList?.('gms')}
              />
            </>
          )}

          <StaffCard onOpen={onOpenUserManagement} />
          <HistoryCalendar
            historyData={teamHistoryData}
            mode="team"
            onDaySelect={(cell) => {
              const [yr, mo] = cell.isoStr.split('-');
              setCalMonth(parseInt(mo));
              setCalYear(parseInt(yr));
            }}
          />
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

          <TeamListSection members={teamMembers} onOpenCalendar={onOpenCalendar} />
          <StaffCard onOpen={onOpenUserManagement} />
          <HistoryCalendar
            historyData={teamHistoryData}
            mode="team"
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
