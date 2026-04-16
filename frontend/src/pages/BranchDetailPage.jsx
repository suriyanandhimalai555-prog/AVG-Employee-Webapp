import { motion } from 'framer-motion';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Loader2, ChevronRight } from 'lucide-react';
import { useSelector } from 'react-redux';
import { Avatar } from '../components/Avatar';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetEmployeesQuery } from '../store/api/apiSlice';

/**
 * Full-screen page showing details for a single branch.
 * Branch data is passed via router state when navigating: navigate('/branches/:id', { state: { branch } })
 * Falls back gracefully if state is missing (e.g. on page refresh).
 */
export const BranchDetailPage = () => {
  const { branchId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  // Branch object from router state — populated by HomeTab on navigation
  const branch = state?.branch ?? { id: branchId };

  const { data: employeesResult, isLoading } = useGetEmployeesQuery(
    { viewerId: user?.id, branchId },
    { skip: !user?.id || !branchId, refetchOnMountOrArgChange: true }
  );

  const employees = employeesResult?.data ?? [];

  const present = branch?.present ?? 0;
  const absent = branch?.absent ?? 0;
  const total = branch?.total ?? (present + absent);
  const notMarked = Math.max(0, total - present - absent);
  const pct = branch?.presentPercent ?? (total > 0 ? Math.round((present / total) * 100) : 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.2 }}
      className="min-h-screen bg-surface"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-navy/5 px-4 py-4 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl text-navy/40 hover:text-navy hover:bg-navy/5 transition-all tactile-press shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="w-9 h-9 rounded-full bg-indigo/10 flex items-center justify-center shrink-0">
          <Building2 size={18} className="text-indigo" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate leading-tight">{branch?.name}</p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">
            Branch Overview
          </p>
        </div>
        {isLoading && <Loader2 className="animate-spin text-indigo shrink-0" size={16} />}
      </div>

      <div className="max-w-2xl mx-auto px-5 py-6 pb-24 space-y-6">
        {/* Stats strip */}
        <div className="bg-white rounded-3xl card-shadow overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-navy/5">
            <div className="flex flex-col items-center justify-center p-5 group">
              <p className="text-2xl font-bold text-indigo font-mono group-hover:scale-110 transition-transform duration-200">
                {present}
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-indigo/30 mt-2 mb-1" />
              <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Present</p>
            </div>
            <div className="flex flex-col items-center justify-center p-5 group">
              <p className="text-2xl font-bold text-red-500 font-mono group-hover:scale-110 transition-transform duration-200">
                {absent}
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-red-400/30 mt-2 mb-1" />
              <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Absent</p>
            </div>
            <div className="flex flex-col items-center justify-center p-5 group">
              <p className="text-2xl font-bold text-amber-500 font-mono group-hover:scale-110 transition-transform duration-200">
                {notMarked}
              </p>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400/30 mt-2 mb-1" />
              <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Not Marked</p>
            </div>
          </div>

          {/* Attendance progress bar */}
          <div className="px-5 pb-4">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest">Attendance Rate</p>
              <p className="text-[10px] font-bold text-indigo">{pct}%</p>
            </div>
            <div className="h-1.5 bg-navy/6 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                className="h-full bg-indigo/70 rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Employee list */}
        <div>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-3 font-mono">
            Team Members
          </p>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-indigo/40" size={28} />
            </div>
          ) : employees.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm font-bold text-navy/30">No employees found</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl card-shadow divide-y divide-navy/5 overflow-hidden">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => navigate(`/people/${emp.id}/calendar`, { state: { employee: emp } })}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy/3 transition-all duration-200 text-left tactile-press group"
                >
                  <div className="w-9 h-9 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                    <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={36} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-navy truncate leading-tight">{emp.name}</p>
                    <p className="text-[9px] font-medium text-navy/40 uppercase tracking-widest mt-0.5 truncate">
                      {emp.role?.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${
                      emp.status === 'present' ? 'text-emerald' :
                      emp.status === 'absent'  ? 'text-red-400'  :
                      emp.status === 'field'   ? 'text-indigo'   : 'text-navy/25'
                    }`}>
                      {emp.status ? emp.status.replace('_', ' ') : 'Not marked'}
                    </span>
                    <ChevronRight size={13} className="text-navy/15 transition-all duration-200 group-hover:text-navy/35 group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BranchDetailPage;
