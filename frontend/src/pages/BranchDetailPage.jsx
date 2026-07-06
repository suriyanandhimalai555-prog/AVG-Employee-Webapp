import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Loader2, ChevronRight, Search, ChevronLeft, X,
} from 'lucide-react';
import { useSelector } from 'react-redux';
import { Avatar } from '../components/Avatar';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useGetEmployeesQuery } from '../store/api/apiSlice';

const PAGE_SIZE = 50;

export const BranchDetailPage = () => {
  const { branchId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const user = useSelector(selectCurrentUser);

  const branch = state?.branch ?? { id: branchId };

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce: fire query 350ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleSearchChange = useCallback((e) => {
    setSearchInput(e.target.value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setPage(1);
  }, []);

  const { data: employeesResult, isLoading, isFetching } = useGetEmployeesQuery(
    { viewerId: user?.id, branchId, search: search || undefined, page, limit: PAGE_SIZE },
    { skip: !user?.id || !branchId, refetchOnMountOrArgChange: true }
  );

  const employees = employeesResult?.data ?? [];
  const total = employeesResult?.total ?? 0;
  const totalPages = employeesResult?.totalPages ?? 1;

  const present = branch?.present ?? 0;
  const absent = branch?.absent ?? 0;
  const branchTotal = branch?.total ?? (present + absent);
  const notMarked = Math.max(0, branchTotal - present - absent);
  const pct = branch?.presentPercent ?? (branchTotal > 0 ? Math.round((present / branchTotal) * 100) : 0);

  return (
    <motion.div
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.2 }}
      className="flex-1 bg-surface"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-sm border-b border-border px-4 py-4 flex items-center gap-3">
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
        {isFetching && <Loader2 className="animate-spin text-indigo shrink-0" size={16} />}
      </div>

      <div className="px-5 py-6 pb-24 space-y-6 md:max-w-2xl">
        {/* Stats strip */}
        <div className="bg-white rounded-3xl card-shadow overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-border">
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

        {/* Search bar */}
        <div className="relative group">
          <Search
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/25 group-focus-within:text-indigo transition-colors duration-200 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search by name or role…"
            value={searchInput}
            onChange={handleSearchChange}
            className="w-full pl-10 pr-10 py-3.5 bg-white rounded-2xl card-shadow text-sm font-bold text-navy placeholder:text-navy/20 outline-none focus:ring-2 focus:ring-indigo/20 transition-all duration-200"
          />
          {searchInput && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/25 hover:text-navy/60 transition-colors duration-200"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {/* Employee list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono">
              Team Members
            </p>
            {!isLoading && (
              <span className="text-[9px] font-bold text-indigo/60 bg-indigo/6 px-2 py-0.5 rounded-full font-mono">
                {total} {total === 1 ? 'person' : 'people'}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="animate-spin text-indigo/40" size={28} />
            </div>
          ) : employees.length === 0 ? (
            <div className="bg-white rounded-3xl card-shadow px-5 py-12 flex flex-col items-center gap-2 border border-dashed border-navy/10">
              <Search size={22} className="text-navy/15" />
              <p className="text-sm font-bold text-navy/25">
                {searchInput ? `No results for "${searchInput}"` : 'No employees found'}
              </p>
            </div>
          ) : (
            <div className={`bg-white rounded-3xl card-shadow divide-y divide-border overflow-hidden transition-opacity duration-200 ${isFetching ? 'opacity-60' : 'opacity-100'}`}>
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  onClick={() => navigate(`/people/${emp.id}/calendar`, { state: { employee: emp } })}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-navy/[0.02] transition-all duration-200 text-left tactile-press group"
                >
                  <div className="w-9 h-9 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                    <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={36} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-navy truncate leading-tight group-hover:text-indigo transition-colors duration-200">
                      {emp.name}
                    </p>
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
                    <ChevronRight size={13} className="text-navy/15 transition-all duration-200 group-hover:text-indigo/40 group-hover:translate-x-0.5" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                disabled={page <= 1 || isFetching}
                onClick={() => setPage(p => p - 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white card-shadow text-[10px] font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono tactile-press"
              >
                <ChevronLeft size={13} /> PREV
              </button>
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest font-mono">
                {page} / {totalPages}
              </p>
              <button
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage(p => p + 1)}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white card-shadow text-[10px] font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono tactile-press"
              >
                NEXT <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export default BranchDetailPage;
