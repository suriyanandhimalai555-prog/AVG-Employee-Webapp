import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, CheckCircle2,
  Search, Filter, Download, MapPin,
  ArrowRight, ChevronLeft, ChevronRight, Clock, ShieldCheck, Activity, Globe, Loader2, RefreshCw,
  UserX, Building2, LogOut, X,
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { clearCredentials, selectCurrentUser } from '../store/slices/authSlice';
import { apiSlice, useLogoutMutation } from '../store/api/apiSlice';
import { Card } from '../components/Card';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
import {
  useGetEmployeesQuery,
  useGetSummaryQuery,
  useAdminCorrectMutation,
  useAdminMarkMutation,
  useGetPhotoUrlQuery,
} from '../store/api/apiSlice';

const PAGE_SIZE = 50;

export const AdminDashboard = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  // Separate input state (instant) from debounced query state
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState(null);

  const [newStatus, setNewStatus] = useState('present');
  const [correctionNote, setCorrectionNote] = useState('');

  // Debounce search — 350 ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => { setSearchQuery(searchInput); setCurrentPage(1); }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const handleSearchChange = useCallback((e) => setSearchInput(e.target.value), []);
  const clearSearch = useCallback(() => { setSearchInput(''); setSearchQuery(''); setCurrentPage(1); }, []);
  const handleRoleFilter = useCallback((e) => { setRoleFilter(e.target.value); setCurrentPage(1); }, []);

  const employeeQueryArgs = {
    viewerId: user?.id,
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    branchId: selectedBranch?.id || undefined,
    role: roleFilter || undefined,
  };

  const { data: employeesResult = {}, isLoading: empLoading, isFetching: empFetching, refetch: refetchEmployees } = useGetEmployeesQuery(
    employeeQueryArgs,
    { skip: !user?.id }
  );
  const employees = employeesResult.data ?? [];
  const pagination = {
    page: employeesResult.page ?? 1,
    total: employeesResult.total ?? 0,
    totalPages: employeesResult.totalPages ?? 0,
  };

  const { data: summary } = useGetSummaryQuery({ viewerId: user?.id }, { skip: !user?.id });
  const [adminCorrect, { isLoading: correctLoading }] = useAdminCorrectMutation();
  const [adminMark, { isLoading: markLoading }] = useAdminMarkMutation();

  const { data: photoData, isLoading: photoLoading } = useGetPhotoUrlQuery(
    selectedEmployee?.photo_key,
    { skip: !selectedEmployee?.photo_key }
  );

  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try { await logoutApi().unwrap(); } catch { /* ignore */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  const isActionLoading = correctLoading || markLoading;

  const handleEdit = (emp) => {
    setSelectedEmployee(emp);
    setNewStatus(emp.status || 'present');
    setCorrectionNote('');
    setPhotoLoadError(false);
    setIsModalOpen(true);
  };

  const handleBranchSelect = (branch) => {
    setSelectedBranch(branch);
    setCurrentPage(1);
    setSearchInput('');
    setSearchQuery('');
    setRoleFilter('');
  };

  const handleApplyChanges = async () => {
    if (!selectedEmployee) return;
    try {
      if (selectedEmployee.attendance_id) {
        await adminCorrect({
          id: selectedEmployee.attendance_id,
          newStatus,
          correctionNote: correctionNote || 'Administrative adjustment',
        }).unwrap();
      } else {
        await adminMark({
          targetUserId: selectedEmployee.id,
          status: newStatus,
          note: correctionNote || 'Marked by admin',
        }).unwrap();
      }
      setIsModalOpen(false);
    } catch (err) {
      alert(err?.data?.error?.message || err?.message || 'Action failed');
    }
  };

  const stats = {
    total: summary?.total ?? 0,
    present: summary?.present ?? 0,
    absent: summary?.absent ?? 0,
    field: summary?.field ?? 0,
    notMarked: summary?.notMarked ?? 0,
  };

  const summaryBranches = summary?.branches ?? [];
  const selectedBranchStats = selectedBranch
    ? (summaryBranches.find((b) => b.id === selectedBranch.id) ?? null)
    : null;

  if (empLoading && !searchQuery && currentPage === 1) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="animate-spin text-indigo" size={40} />
        <p className="text-xs font-bold text-navy/30 uppercase tracking-widest">Synchronizing Center Data…</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 lg:p-12 xl:p-16 xl:px-20 overflow-x-hidden transition-all duration-500">

      {/* ── Header ── */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 md:mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3 sm:p-4 rounded-xl sm:rounded-xl bg-white shadow-premium border border-border text-indigo shrink-0">
            <ShieldCheck size={26} className="sm:w-8 sm:h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-[9px] sm:text-[10px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono">
                {user?.branchId ? 'Center Operations' : 'Global Operations'}
              </p>
              <span className="text-navy/10 text-[8px]">•</span>
              <p className="text-[9px] font-bold text-indigo uppercase tracking-[0.15em] font-mono">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-navy tracking-tight">
              {user?.branchId ? 'Monitor' : 'Command Center'}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
          <button
            onClick={refetchEmployees}
            className="p-3 rounded-2xl bg-white text-navy/40 hover:text-indigo hover:bg-indigo/5 transition-all card-shadow border border-border tactile-press"
          >
            <RefreshCw size={18} />
          </button>
          <button className="px-4 sm:px-6 py-3 rounded-2xl bg-white text-navy font-bold text-xs card-shadow tactile-press flex items-center gap-2 border border-border hover:bg-navy/[0.02]">
            <Download size={15} /> <span className="hidden sm:inline">Export</span>
          </button>
          <button
            onClick={handleLogout}
            className="p-3 rounded-2xl bg-white text-navy/20 hover:text-red-500 hover:bg-red-50 transition-all card-shadow border border-border tactile-press group"
          >
            <LogOut size={18} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </header>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6 mb-8 md:mb-12">
        <StatCard icon={Users}    label="Total"    value={stats.total}     color="indigo" />
        <StatCard icon={Activity} label="Present"  value={stats.present}   color="emerald" />
        <StatCard icon={UserX}    label="Unmarked" value={stats.notMarked} color="amber" />
        <StatCard icon={Globe}    label="Field"    value={stats.field}     color="indigo" />
      </div>

      {/* ── Workforce Roster (FIRST) ── */}
      <Card className="p-0 overflow-hidden bg-white rounded-2xl sm:rounded-2xl card-shadow border border-border mb-8 md:mb-12">

        {/* Roster header */}
        <div className="p-4 sm:p-6 md:p-8 border-b border-border flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {selectedBranch && (
                <button
                  onClick={() => { setSelectedBranch(null); setCurrentPage(1); setSearchInput(''); setSearchQuery(''); setRoleFilter(''); }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-indigo/5 text-indigo rounded-xl text-[10px] font-bold hover:bg-indigo/10 transition-all tactile-press"
                >
                  <ChevronLeft size={14} /> All
                </button>
              )}
              <div>
                <h2 className="text-base sm:text-xl font-bold text-navy tracking-tight flex items-center gap-2">
                  {selectedBranch ? <Building2 size={18} className="text-indigo/40" /> : <Users size={18} className="text-indigo/40" />}
                  {selectedBranch ? selectedBranch.name : 'Workforce Roster'}
                </h2>
                <p className="text-[9px] sm:text-[10px] font-bold text-navy/20 uppercase tracking-widest mt-0.5">
                  {pagination.total} active records
                </p>
              </div>
            </div>
            {empFetching && <Loader2 className="animate-spin text-indigo/40 shrink-0" size={16} />}
          </div>

          {/* Search + Role filter row */}
          <div className="flex gap-2 sm:gap-3">
            <div className="relative group flex-1">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/25 group-focus-within:text-indigo transition-colors pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={handleSearchChange}
                placeholder="Search by name…"
                className="w-full pl-10 pr-10 py-3 sm:py-3.5 bg-navy/[0.03] rounded-2xl text-sm font-bold text-navy placeholder:text-navy/20 outline-none focus:ring-2 focus:ring-indigo/20 transition-all"
              />
              {searchInput && (
                <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-navy/25 hover:text-navy/60 transition-colors">
                  <X size={15} />
                </button>
              )}
            </div>
            <div className="relative shrink-0">
              <select
                value={roleFilter}
                onChange={handleRoleFilter}
                className={`h-full pl-3 pr-8 py-3 sm:py-3.5 bg-navy/[0.03] rounded-2xl text-[11px] font-bold outline-none focus:ring-2 focus:ring-indigo/20 transition-all appearance-none cursor-pointer ${roleFilter ? 'text-indigo bg-indigo/5' : 'text-navy/50'}`}
              >
                <option value="">All Roles</option>
                <option value="branch_manager">Branch Manager</option>
                <option value="abm">ABM</option>
                <option value="oa">OA</option>
                <option value="sales_officer">Sales Officer</option>
                <option value="branch_admin">Branch Admin</option>
              </select>
              <Filter size={13} className={`absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${roleFilter ? 'text-indigo' : 'text-navy/30'}`} />
            </div>
          </div>
        </div>

        {/* Branch stats strip (when drilling into a branch) */}
        {selectedBranch && selectedBranchStats && (
          <div className="px-4 sm:px-6 py-4 border-b border-border grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xl sm:text-2xl font-bold text-navy font-mono">{selectedBranchStats.total}</p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Total</p>
            </div>
            <div className="text-center">
              <p className="text-xl sm:text-2xl font-bold text-emerald font-mono">{selectedBranchStats.present}</p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Present</p>
            </div>
            <div className="text-center">
              <p className="text-xl sm:text-2xl font-bold text-amber-500 font-mono">
                {selectedBranchStats.total - selectedBranchStats.present}
              </p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Not Marked</p>
            </div>
          </div>
        )}

        {/* ── Mobile card list (< md) ── */}
        <div className={`md:hidden divide-y divide-border transition-opacity duration-200 ${empFetching ? 'opacity-60' : ''}`}>
          {empLoading ? (
            <div className="py-16 flex justify-center"><Loader2 className="animate-spin text-indigo/40" size={28} /></div>
          ) : employees.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-2">
              <Users size={28} className="text-navy/10" />
              <p className="text-xs font-bold text-navy/25 uppercase tracking-widest">
                {searchInput ? `No results for "${searchInput}"` : 'No employees found'}
              </p>
            </div>
          ) : employees.map((emp) => (
            <div key={emp.id} className="px-4 py-4 flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-full bg-navy/5 overflow-hidden shrink-0 ring-1 ring-navy/8">
                <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={40} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-navy truncate">{emp.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-navy/35">{emp.role?.replace(/_/g, ' ')}</p>
                  {!user?.branchId && emp.branch_name && (
                    <>
                      <span className="text-[8px] text-navy/20">·</span>
                      <p className="text-[9px] font-bold text-navy/35 truncate max-w-[80px]">{emp.branch_name}</p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {emp.status ? (
                    <StatusChip status={emp.status} />
                  ) : (
                    <span className="text-[9px] font-bold text-navy/20 uppercase tracking-widest bg-navy/5 px-2 py-0.5 rounded-full">
                      Not marked
                    </span>
                  )}
                  {emp.check_in_time && (
                    <span className="text-[9px] font-mono font-bold text-navy/30">
                      {new Date(emp.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => navigate(`/people/${emp.id}/calendar`, { state: { employee: emp } })}
                  className="p-2.5 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                >
                  <Clock size={16} />
                </button>
                <button
                  onClick={() => handleEdit(emp)}
                  className="p-2.5 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                >
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Desktop table (≥ md) ── */}
        <div className={`hidden md:block overflow-x-auto custom-scrollbar transition-opacity duration-200 ${empFetching ? 'opacity-60' : ''}`}>
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-navy/[0.02]">
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Identity</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Designation</th>
                {!user?.branchId && (
                  <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Branch</th>
                )}
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Time</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Status</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border">Mode</th>
                <th className="px-6 lg:px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-border text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {empLoading ? (
                <tr>
                  <td colSpan={user?.branchId ? 6 : 7} className="py-16 text-center">
                    <Loader2 className="animate-spin text-indigo mx-auto" size={24} />
                  </td>
                </tr>
              ) : employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-navy/[0.015] transition-colors group">
                  <td className="px-6 lg:px-8 py-5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0">
                        <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={32} />
                      </div>
                      <div>
                        <div className="font-bold text-navy group-hover:text-indigo transition-colors text-sm">{emp.name}</div>
                        <div className="text-[10px] font-mono font-bold text-navy/20 mt-0.5 truncate max-w-[160px]">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 lg:px-8 py-5">
                    <span className="text-xs font-bold text-navy/60 uppercase tracking-tighter">{emp.role?.replace(/_/g, ' ')}</span>
                  </td>
                  {!user?.branchId && (
                    <td className="px-6 lg:px-8 py-5">
                      <button
                        onClick={() => !selectedBranch && emp.employee_branch_id && handleBranchSelect({ id: emp.employee_branch_id, name: emp.branch_name })}
                        className={`text-xs font-bold text-navy uppercase tracking-tighter ${!selectedBranch && emp.employee_branch_id ? 'hover:text-indigo cursor-pointer' : ''}`}
                      >
                        {emp.branch_name || '—'}
                      </button>
                    </td>
                  )}
                  <td className="px-6 lg:px-8 py-5">
                    {emp.check_in_time ? (
                      <div className="space-y-0.5">
                        <p className="text-sm font-mono font-bold text-navy tracking-tight">
                          {new Date(emp.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                        {emp.check_out_time ? (
                          <p className="text-xs font-mono text-navy/40">
                            → {new Date(emp.check_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        ) : emp.status === 'present' ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest bg-emerald/10 text-emerald px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-emerald animate-pulse" /> Active
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-navy/20">—</p>
                    )}
                  </td>
                  <td className="px-6 lg:px-8 py-5">
                    {emp.status ? (
                      <StatusChip status={emp.status} />
                    ) : (
                      <span className="text-[9px] font-bold text-navy/20 uppercase tracking-widest bg-navy/5 px-3 py-1 rounded-full">Not Marked</span>
                    )}
                  </td>
                  <td className="px-6 lg:px-8 py-5">
                    {emp.mode ? (
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${emp.mode === 'field' ? 'bg-indigo' : 'bg-emerald'}`} />
                        <p className="text-xs font-bold text-navy/60">{emp.mode.toUpperCase()}</p>
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-navy/20">—</p>
                    )}
                  </td>
                  <td className="px-6 lg:px-8 py-5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => navigate(`/people/${emp.id}/calendar`, { state: { employee: emp } })}
                        className="p-2.5 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                        title="View history"
                      >
                        <Clock size={17} />
                      </button>
                      <button
                        onClick={() => handleEdit(emp)}
                        className="p-2.5 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                        title="Manage"
                      >
                        <ArrowRight size={17} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!empLoading && employees.length === 0 && (
                <tr>
                  <td colSpan={user?.branchId ? 6 : 7} className="px-8 py-12 text-center text-xs font-bold text-navy/20 uppercase tracking-widest">
                    {searchInput ? `No results for "${searchInput}"` : 'No employees found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-4 sm:px-6 py-4 border-t border-border flex items-center justify-between">
            <button
              disabled={currentPage <= 1 || empFetching}
              onClick={() => setCurrentPage(p => p - 1)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-navy/[0.03] text-[10px] font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono tactile-press"
            >
              <ChevronLeft size={13} /> PREV
            </button>
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest font-mono">
              {pagination.page} / {pagination.totalPages}
            </p>
            <button
              disabled={currentPage >= pagination.totalPages || empFetching}
              onClick={() => setCurrentPage(p => p + 1)}
              className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-navy/[0.03] text-[10px] font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono tactile-press"
            >
              NEXT <ChevronRight size={13} />
            </button>
          </div>
        )}
      </Card>

      {/* ── Branch Cards (SECOND — below roster) ── */}
      {summaryBranches.length > 0 && !selectedBranch && (
        <div className="mb-32">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.3em] mb-4 sm:mb-5 font-mono ml-1">Branch Locations</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {summaryBranches.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBranchSelect(b)}
                className="text-left p-5 sm:p-7 bg-white rounded-xl sm:rounded-2xl card-shadow border border-transparent hover:border-indigo/20 hover-lift group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo/5 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-125" />
                <div className="flex items-center justify-between mb-4 sm:mb-6 relative z-10">
                  <div className="p-2.5 sm:p-3 bg-indigo/5 rounded-xl sm:rounded-2xl text-indigo group-hover:bg-indigo group-hover:text-white transition-all duration-300">
                    <Building2 size={18} />
                  </div>
                  <div className="text-right">
                    <span className="text-xl sm:text-2xl font-bold text-navy font-mono tracking-tighter">{b.presentPercent}%</span>
                    <p className="text-[8px] font-bold uppercase text-navy/20">Attendance</p>
                  </div>
                </div>
                <p className="font-bold text-navy text-base sm:text-lg tracking-tight mb-2 relative z-10 truncate">{b.name}</p>
                <div className="flex items-center gap-2 relative z-10">
                  <div className="flex-1 h-1.5 bg-navy/5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo transition-all duration-500" style={{ width: `${b.presentPercent}%` }} />
                  </div>
                  <p className="text-[9px] text-navy/40 font-bold uppercase tracking-widest whitespace-nowrap">
                    {b.present}/{b.total}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Admin Override Modal ── */}
      <GlassModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={selectedEmployee?.attendance_id ? 'Correct Attendance' : 'Mark Attendance'}
      >
        {selectedEmployee && (
          <div className="space-y-5">
            <div className="p-5 bg-navy/[0.03] rounded-3xl flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white shadow-sm overflow-hidden shrink-0">
                <Avatar url={selectedEmployee?.profilePhotoUrl} name={selectedEmployee.name} size={56} />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold text-navy">{selectedEmployee.name}</p>
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest mt-1">{selectedEmployee.role?.replace(/_/g, ' ')}</p>
                {selectedEmployee.status && (
                  <p className="text-[9px] font-bold text-indigo uppercase mt-1">Currently: {selectedEmployee.status}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
                {selectedEmployee.attendance_id ? 'New Status' : 'Set Status'}
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full p-4 bg-white rounded-2xl text-navy font-bold outline-none border border-border card-shadow appearance-none"
              >
                <option value="present">Present</option>
                <option value="absent">Absent</option>
                <option value="half_day">Half Day</option>
              </select>
            </div>

            {selectedEmployee.check_in_lat && selectedEmployee.check_in_lng && (
              <div className="p-4 bg-emerald/5 border border-emerald/10 rounded-2xl flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-emerald uppercase tracking-widest mb-1">Verified Location</p>
                  <p className="text-xs font-mono text-navy font-bold">
                    {Number(selectedEmployee.check_in_lat).toFixed(5)}, {Number(selectedEmployee.check_in_lng).toFixed(5)}
                  </p>
                </div>
                <a
                  href={`https://maps.google.com/?q=${selectedEmployee.check_in_lat},${selectedEmployee.check_in_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-3 bg-white text-emerald rounded-xl card-shadow hover:scale-105 transition-all"
                >
                  <MapPin size={18} />
                </a>
              </div>
            )}

            {selectedEmployee.photo_key && (
              <div className="rounded-3xl overflow-hidden bg-navy/5 border border-border relative h-44 flex items-center justify-center">
                {photoLoading ? (
                  <Loader2 className="animate-spin text-navy/30" size={24} />
                ) : photoData?.downloadUrl && !photoLoadError ? (
                  <img
                    src={photoData.downloadUrl}
                    alt="Field Capture"
                    className="w-full h-full object-cover"
                    onError={() => setPhotoLoadError(true)}
                  />
                ) : (
                  <p className="text-xs font-bold text-navy/30">Photo unavailable</p>
                )}
                {selectedEmployee.field_note && (
                  <div className="absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-navy/80 to-transparent">
                    <p className="text-white text-xs font-medium line-clamp-2">"{selectedEmployee.field_note}"</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
                {selectedEmployee.attendance_id ? 'Correction Justification' : 'Note (Optional)'}
              </label>
              <textarea
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                className="w-full p-4 sm:p-5 bg-navy/[0.03] rounded-3xl text-navy text-sm font-medium outline-none h-24 resize-none focus:ring-2 focus:ring-indigo/20 transition-all"
                placeholder={selectedEmployee.attendance_id ? 'Required for audit trail (min 10 chars)…' : 'Optional note for this marking…'}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                disabled={isActionLoading}
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors disabled:opacity-50 text-sm"
              >
                Dismiss
              </button>
              <button
                disabled={isActionLoading || (selectedEmployee.attendance_id && correctionNote.length < 10)}
                onClick={handleApplyChanges}
                className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50 flex items-center justify-center text-sm"
              >
                {isActionLoading ? <Loader2 className="animate-spin" size={20} /> : (
                  selectedEmployee.attendance_id ? 'Apply Correction' : 'Mark Attendance'
                )}
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color }) => {
  const colors = {
    indigo:  'text-indigo  bg-indigo/5  border-indigo/10',
    emerald: 'text-emerald bg-emerald/5 border-emerald/10',
    amber:   'text-amber-600 bg-amber-500/5 border-amber-500/10',
  };
  return (
    <Card className="hover-lift bg-white card-shadow border-border p-4 sm:p-6 md:p-7 group">
      <div className={`w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-5 md:mb-6 shadow-sm border ${colors[color]} group-hover:scale-110 transition-transform duration-500`}>
        <Icon size={20} className="sm:w-[22px] sm:h-[22px] md:w-[26px] md:h-[26px]" />
      </div>
      <p className="text-[9px] sm:text-[10px] font-bold text-navy/30 uppercase tracking-[0.3em] mb-1 font-mono">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl sm:text-3xl md:text-4xl font-bold text-navy tracking-tight">{value}</p>
        <div className={`w-1.5 h-1.5 rounded-full ${color === 'emerald' ? 'bg-emerald animate-pulse' : 'bg-navy/10'}`} />
      </div>
    </Card>
  );
};
