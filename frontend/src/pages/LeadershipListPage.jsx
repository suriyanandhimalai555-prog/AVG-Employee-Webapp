import { motion } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, ChevronRight, Users } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetUsersQuery, useGetEmployeesQuery } from '../store/api/apiSlice';


export const LeadershipListPage = () => {
  const { kind } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  const targetRole = kind === 'directors' ? 'director' : 'gm';
  const { data: usersResult = {}, isLoading } = useGetUsersQuery(
    { viewerId: user?.id, role: targetRole, limit: 500 },
    { skip: !user?.id }
  );

  const members = (usersResult.data ?? []).filter((u) =>
    user?.role === 'director' ? u.managerId === user.id : true
  );

  // Fetch today's attendance for all visible employees to get status for each member
  const { data: employeesResult = {} } = useGetEmployeesQuery(
    { viewerId: user?.id, limit: 500 },
    { skip: !user?.id }
  );
  const attendanceMap = new Map(
    (employeesResult.data ?? []).map((e) => [e.id, e.status ?? null])
  );

  const title = kind === 'directors' ? 'Directors' : 'General Managers';

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
        <div className={`w-9 h-9 rounded-xl ${kind === 'directors' ? 'gradient-directors border-l-2 border-rose-500 shadow-rose/10' : 'gradient-gms border-l-2 border-sky-500 shadow-sky/10'} flex items-center justify-center text-white shrink-0 shadow-lg`}>
          <Users size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate leading-tight">{title}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">{members.length} total</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-24">
        <div className="bg-white rounded-3xl card-shadow divide-y divide-navy/5 overflow-hidden">
          {members.map((member) => (
            <button
              key={member.id}
              onClick={() => navigate(`/people/${member.id}`)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy/3 transition-all duration-200 text-left tactile-press group"
            >
              <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                <Avatar url={member?.profilePhotoUrl} name={member.name} size={32} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-navy truncate">{member.name}</p>
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35 mt-0.5">
                  {(member.role ?? '').replace(/_/g, ' ')}
                </p>
              </div>
              <AttendanceBadge status={attendanceMap.get(member.id)} />
              <ChevronRight size={14} className="text-navy/15 transition-all duration-200 group-hover:text-navy/35 group-hover:translate-x-0.5 shrink-0 ml-2" />
            </button>
          ))}
          {!isLoading && members.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">No records found</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

const ATTENDANCE_STYLES = {
  present:   { cls: 'bg-emerald/10 text-emerald border border-emerald/20', label: 'Present' },
  absent:    { cls: 'bg-red-500/10 text-red-500 border border-red-500/20', label: 'Absent' },
  half_day:  { cls: 'bg-amber-500/10 text-amber-600 border border-amber-500/20', label: 'Half Day' },
};

const AttendanceBadge = ({ status }) => {
  const style = status ? ATTENDANCE_STYLES[status] : null;
  if (style) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap ${style.cls}`}>
        <span className={`w-1 h-1 rounded-full ${status === 'present' ? 'bg-emerald animate-pulse' : status === 'absent' ? 'bg-red-500' : 'bg-amber-500'}`} />
        {style.label}
      </span>
    );
  }
  // undefined means not yet in attendanceMap (data loading) — show nothing
  // null means data loaded but no attendance record
  if (status === null) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-navy/5 text-navy/30 border border-navy/8 whitespace-nowrap">
        Not Marked
      </span>
    );
  }
  return null;
};

export default LeadershipListPage;
