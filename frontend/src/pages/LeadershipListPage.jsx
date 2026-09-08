import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ArrowLeft, ChevronRight, ChevronDown, Users, MapPin } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetUsersQuery,
  useGetEmployeesQuery,
  useGetDirectorLeadershipTreeQuery,
} from '../store/api/apiSlice';


export const LeadershipListPage = () => {
  const { kind } = useParams();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  // ── Expand state (directors view only) ──────────────────────────────────
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const toggleExpand = (id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Directors tree (only fetched for directors view) ─────────────────────
  const { data: directorsTree = [], isLoading: treeLoading } = useGetDirectorLeadershipTreeQuery(
    undefined,
    { skip: !user?.id || kind !== 'directors' }
  );

  // ── GM flat list (only fetched for gms view — unchanged path) ────────────
  const targetRole = kind === 'directors' ? 'director' : 'gm';
  const { data: usersResult = {}, isLoading: usersLoading } = useGetUsersQuery(
    { viewerId: user?.id, role: targetRole, limit: 500 },
    { skip: !user?.id || kind === 'directors' }
  );

  const gmMembers = (usersResult.data ?? []).filter((u) =>
    user?.role === 'director' ? u.managerId === user.id : true
  );

  // ── Attendance map (used by both views) ──────────────────────────────────
  const { data: employeesResult = {} } = useGetEmployeesQuery(
    { viewerId: user?.id, limit: 500 },
    { skip: !user?.id }
  );
  const attendanceMap = new Map(
    (employeesResult.data ?? []).map((e) => [e.id, e.status ?? null])
  );

  const title = kind === 'directors' ? 'Directors' : 'General Managers';
  const isLoading = kind === 'directors' ? treeLoading : usersLoading;
  const totalCount = kind === 'directors' ? directorsTree.length : gmMembers.length;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="flex-1 bg-surface"
    >
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-4 py-4 flex items-center gap-3">
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
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">{totalCount} total</p>
        </div>
      </div>

      <div className="px-5 py-6 pb-24 md:max-w-2xl">
        {/* ── Directors expandable view ── */}
        {kind === 'directors' && (
          <div className="space-y-3">
            {directorsTree.map((director) => {
              const isExpanded = expandedIds.has(director.id);
              return (
                <div key={director.id} className="bg-white rounded-3xl card-shadow overflow-hidden">
                  {/* Director row */}
                  <div className="flex items-center gap-3 px-5 py-3.5">
                    {/* Avatar + name → navigate to profile */}
                    <button
                      onClick={() => navigate(`/people/${director.id}`)}
                      className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8 tactile-press"
                    >
                      <Avatar url={director?.profilePhotoUrl} name={director.name} size={32} />
                    </button>
                    <button
                      onClick={() => navigate(`/people/${director.id}`)}
                      className="flex-1 min-w-0 text-left tactile-press"
                    >
                      <p className="text-xs font-bold text-navy truncate">{director.name}</p>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35 mt-0.5">
                        {director.gmCount} GM{director.gmCount !== 1 ? 's' : ''} · {director.branchCount} branch{director.branchCount !== 1 ? 'es' : ''}
                      </p>
                    </button>
                    <AttendanceBadge status={attendanceMap.get(director.id)} />
                    {/* Expand / collapse toggle */}
                    <button
                      onClick={() => toggleExpand(director.id)}
                      className="p-1.5 rounded-lg text-navy/30 hover:text-navy hover:bg-navy/5 transition-all tactile-press shrink-0 ml-1"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <motion.div
                        animate={{ rotate: isExpanded ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown size={14} />
                      </motion.div>
                    </button>
                  </div>

                  {/* GM + branches expandable panel */}
                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="panel"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: 'easeInOut' }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div className="border-t border-border bg-navy/[0.015] px-4 py-3 space-y-3">
                          {director.gms.length === 0 ? (
                            <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest text-center py-2">
                              No GMs assigned
                            </p>
                          ) : (
                            director.gms.map((gm) => (
                              <div key={gm.id} className="space-y-2">
                                {/* GM row */}
                                <button
                                  onClick={() => navigate(`/people/${gm.id}`)}
                                  className="w-full flex items-center gap-2.5 hover:bg-navy/5 rounded-2xl px-2.5 py-1.5 transition-all tactile-press text-left"
                                >
                                  <div className="w-7 h-7 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                                    <Avatar url={gm?.profilePhotoUrl} name={gm.name} size={28} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[11px] font-bold text-navy truncate">{gm.name}</p>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35">
                                      {gm.branchName ?? 'General Manager'}
                                    </p>
                                  </div>
                                  <AttendanceBadge status={attendanceMap.get(gm.id)} />
                                  <ChevronRight size={12} className="text-navy/15 shrink-0" />
                                </button>

                                {/* Overseen branch chips */}
                                {gm.branches.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 pl-10">
                                    {gm.branches.map((branch) => (
                                      <span
                                        key={branch.id}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/8 text-primary border border-primary/15 text-[9px] font-bold uppercase tracking-wider"
                                      >
                                        <MapPin size={8} />
                                        {branch.name}
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-[9px] font-bold text-navy/25 uppercase tracking-widest pl-10">
                                    No branches assigned
                                  </p>
                                )}
                              </div>
                            ))
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}

            {!isLoading && directorsTree.length === 0 && (
              <div className="bg-white rounded-3xl card-shadow py-10 text-center">
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">No records found</p>
              </div>
            )}
          </div>
        )}

        {/* ── GMs flat list (unchanged) ── */}
        {kind !== 'directors' && (
          <div className="bg-white rounded-3xl card-shadow divide-y divide-border overflow-hidden">
            {gmMembers.map((member) => (
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
            {!isLoading && gmMembers.length === 0 && (
              <div className="py-10 text-center">
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">No records found</p>
              </div>
            )}
          </div>
        )}
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
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-navy/5 text-navy/30 border border-border whitespace-nowrap">
        Not Marked
      </span>
    );
  }
  return null;
};

export default LeadershipListPage;
