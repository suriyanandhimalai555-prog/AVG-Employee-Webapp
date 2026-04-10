import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Users, CheckCircle2,
  Search, Filter, Download, MapPin,
  ArrowRight, ChevronLeft, Clock, ShieldCheck, Activity, Globe, Loader2, RefreshCw,
  UserX, Building2, LogOut
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Avatar } from '../components/Avatar';
import { clearCredentials, selectCurrentUser } from '../store/slices/authSlice';
import { apiSlice, useLogoutMutation } from '../store/api/apiSlice';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
import { EmployeeCalendarPage } from './EmployeeCalendarPage';
import {

  useGetEmployeesQuery,
  useGetSummaryQuery,
  useAdminCorrectMutation,
  useAdminMarkMutation,
  useGetPhotoUrlQuery
} from '../store/api/apiSlice';

export const AdminDashboard = () => {
  const user = useSelector(selectCurrentUser);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [calendarEmployee, setCalendarEmployee] = useState(null);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedBranch, setSelectedBranch] = useState(null); // { id, name } or null = all

  // Admin correction form
  const [newStatus, setNewStatus] = useState('present');
  const [correctionNote, setCorrectionNote] = useState('');

  const PAGE_SIZE = 50;

  // Build query args — branch detail drill-down passes filterBranchId to server
  const employeeQueryArgs = {
    viewerId: user?.id,
    page: currentPage,
    limit: PAGE_SIZE,
    search: searchQuery || undefined,
    branchId: selectedBranch?.id || undefined,
  };

  // RTK Query hooks — auto-cached, auto-refetch after mutations
  const { data: employeesResult = {}, isLoading: empLoading, refetch: refetchEmployees } = useGetEmployeesQuery(
    employeeQueryArgs,
    { skip: !user?.id }
  );
  const employees = employeesResult.data ?? [];
  const pagination = {
    page: employeesResult.page ?? 1,
    total: employeesResult.total ?? 0,
    totalPages: employeesResult.totalPages ?? 0,
  };

  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery(
    { viewerId: user?.id },
    { skip: !user?.id }
  );
  const [adminCorrect, { isLoading: correctLoading }] = useAdminCorrectMutation();
  const [adminMark, { isLoading: markLoading }] = useAdminMarkMutation();

  // Photo fetching hook (only fires if they have a photo_key open in modal)
  const { data: photoData, isLoading: photoLoading } = useGetPhotoUrlQuery(
    selectedEmployee?.photo_key,
    { skip: !selectedEmployee?.photo_key }
  );

  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch { /* ignore */ }
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
    setSearchQuery('');
  };

  const handleApplyChanges = async () => {
    if (!selectedEmployee) return;
    try {
      if (selectedEmployee.attendance_id) {
        // Employee already checked in — correct the record
        await adminCorrect({
          id: selectedEmployee.attendance_id,
          newStatus,
          correctionNote: correctionNote || 'Administrative adjustment',
        }).unwrap();
      } else {
        // Employee hasn't checked in — admin marks on their behalf
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

  // Stats come from summary (org-wide or branch-wide), not the paginated employee slice
  const stats = {
    total: summary?.total ?? 0,
    present: summary?.present ?? 0,
    absent: summary?.absent ?? 0,
    field: summary?.field ?? 0,
    notMarked: summary?.notMarked ?? 0,
  };

  // Summary branches — shown as clickable cards for MD/Director/GM
  const summaryBranches = summary?.branches ?? [];

  // Stats for the currently selected branch (used in the drill-down header strip)
  const selectedBranchStats = selectedBranch
    ? (summaryBranches.find((b) => b.id === selectedBranch.id) ?? null)
    : null;

  // Full-screen overlay: individual employee calendar page
  if (calendarEmployee) {
    return (
      <EmployeeCalendarPage
        employee={calendarEmployee}
        onBack={() => setCalendarEmployee(null)}
      />
    );
  }

  if (empLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
        <Loader2 className="animate-spin text-indigo" size={40} />
        <p className="text-xs font-bold text-navy/30 uppercase tracking-widest">Synchronizing Center Data...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 lg:p-12 overflow-x-hidden">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-5">
          <div className="p-4 rounded-[24px] bg-white shadow-premium border border-navy/5 text-indigo relative group">
            <ShieldCheck size={32} className="relative z-10" />
            <div className="absolute inset-0 bg-indigo/5 rounded-[24px] scale-0 group-hover:scale-100 transition-transform duration-500" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono">
                {user?.branchId ? 'Center Operations' : 'Global Operations'}
              </p>
              <span className="text-navy/10 text-[8px]">•</span>
              <p className="text-[9px] font-bold text-indigo uppercase tracking-[0.15em] font-mono">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <h1 className="text-3xl md:text-4xl font-bold text-navy tracking-tight">
                {user?.branchId ? 'Monitor' : 'Command Center'}
              </h1>
              <div className="flex items-center gap-2">
                {!user?.branchId && (
                  <span className="bg-indigo/5 text-indigo text-[9px] font-bold px-2.5 py-1 rounded-lg uppercase tracking-widest border border-indigo/10 shadow-sm">
                    Active
                  </span>
                )}
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">{user?.name}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={refetchEmployees}
            className="p-3.5 rounded-2xl bg-white text-navy/40 hover:text-indigo hover:bg-indigo/5 transition-all card-shadow border border-navy/5 tactile-press"
          >
            <RefreshCw size={20} />
          </button>
          <button className="px-6 py-3.5 rounded-2xl bg-white text-navy font-bold text-xs card-shadow tactile-press flex items-center gap-2.5 border border-navy/5 hover:bg-navy/[0.02]">
            <Download size={16} /> Export Data
          </button>
          <button
            onClick={handleLogout}
            className="p-3.5 rounded-2xl bg-white text-navy/20 hover:text-red-500 hover:bg-red-50 transition-all duration-300 card-shadow border border-navy/5 tactile-press group"
            title="Logout Account"
          >
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard icon={Users} label="Total Workforce" value={stats.total} color="indigo" />
        <StatCard icon={Activity} label="Present Today" value={stats.present} color="emerald" />
        <StatCard icon={UserX} label="Not Marked" value={stats.notMarked} color="amber" />
        <StatCard icon={Globe} label="Field Ops" value={stats.field} color="indigo" />
      </div>

      {/* Branch Cards — visible for MD / Director / GM; clicking drills into that branch */}
      {summaryBranches.length > 0 && !selectedBranch && (
        <div className="mb-12">
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.3em] mb-5 font-mono ml-1">Branch Locations</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {summaryBranches.map((b) => (
              <button
                key={b.id}
                onClick={() => handleBranchSelect(b)}
                className="text-left p-7 bg-white rounded-[32px] card-shadow border border-transparent hover:border-indigo/20 hover-lift group relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-24 h-24 bg-indigo/5 rounded-full -mr-12 -mt-12 transition-transform group-hover:scale-110" />
                <div className="flex items-center justify-between mb-6 relative z-10">
                  <div className="p-3 bg-indigo/5 rounded-2xl text-indigo group-hover:bg-indigo group-hover:text-white transition-all duration-300">
                    <Building2 size={20} />
                  </div>
                  <div className="text-right">
                    <span className="text-2xl font-bold text-navy font-mono tracking-tighter">{b.presentPercent}%</span>
                    <p className="text-[8px] font-bold uppercase text-navy/20">Attendance</p>
                  </div>
                </div>
                <p className="font-bold text-navy text-lg tracking-tight mb-2 relative z-10">{b.name}</p>
                <div className="flex items-center gap-2 relative z-10">
                  <div className="flex-1 h-1.5 bg-navy/5 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo transition-all duration-500" style={{ width: `${b.presentPercent}%` }} />
                  </div>
                  <p className="text-[9px] text-navy/40 font-bold uppercase tracking-widest whitespace-nowrap">
                    {b.present}/{b.total} P
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Employee Table */}
      <Card className="p-0 overflow-hidden bg-white/70 backdrop-blur-md rounded-[40px] card-shadow border border-white/50 mb-32">
        <div className="p-8 border-b border-navy/5 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            {/* Branch detail breadcrumb */}
            {selectedBranch && (
              <button
                onClick={() => { setSelectedBranch(null); setCurrentPage(1); setSearchQuery(''); }}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo/5 text-indigo rounded-2xl text-[10px] font-bold hover:bg-indigo/10 transition-all tactile-press"
              >
                <ChevronLeft size={16} /> All Regions
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-navy tracking-tight flex items-center gap-2.5">
                {selectedBranch ? <Building2 size={20} className="text-indigo/40" /> : <Users size={20} className="text-indigo/40" />}
                {selectedBranch ? selectedBranch.name : 'Workforce Roster'}
              </h2>
              <p className="text-[10px] font-bold text-navy/20 uppercase tracking-widest mt-0.5">
                Managing {pagination.total ?? 0} active records
              </p>
            </div>
          </div>
          
          <div className="flex flex-1 max-w-xl gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" size={18} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                placeholder="Search by name, ID or role..."
                className="w-full pl-12 pr-4 py-3.5 bg-surface-container-low/50 rounded-2xl text-navy font-bold placeholder:text-navy/20 outline-none transition-all focus:ring-4 ring-indigo/5 focus:bg-white border border-transparent focus:border-indigo/10"
              />
            </div>
            <button className="p-3.5 rounded-2xl bg-surface-container-low text-navy/40 hover:text-indigo hover:bg-indigo/5 transition-all tactile-press border border-transparent">
              <Filter size={20} />
            </button>
          </div>
        </div>

        {/* Branch stats strip — present/total/not-marked for the selected branch */}
        {selectedBranch && selectedBranchStats && (
          <div className="px-6 py-4 border-b border-navy/5 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-navy font-mono">{selectedBranchStats.total}</p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald font-mono">{selectedBranchStats.present}</p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Present</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-500 font-mono">
                {selectedBranchStats.total - selectedBranchStats.present}
              </p>
              <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">Not Marked</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-navy/[0.02]">
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Identity</th>
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Designation</th>
                {!user?.branchId && (
                  <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Deployment</th>
                )}
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Time Logs</th>
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Live Status</th>
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5">Operating Mode</th>
                <th className="px-8 py-5 text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] font-mono border-b border-navy/5 text-right">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {empLoading ? (
                <tr>
                  <td colSpan={user?.branchId ? 6 : 7} className="py-16 text-center">
                    <Loader2 className="animate-spin text-indigo mx-auto" size={24} />
                  </td>
                </tr>
              ) : employees.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-container-low/20 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0">
                        <Avatar url={emp?.profilePhotoUrl} name={emp.name} size={32} />
                      </div>
                      <div>
                        <div className="font-bold text-navy group-hover:text-indigo transition-colors text-sm">{emp.name}</div>
                        <div className="text-[10px] font-mono font-bold text-navy/20 mt-0.5">{emp.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-xs font-bold text-navy/60 uppercase tracking-tighter">{emp.role?.replace(/_/g, ' ')}</div>
                  </td>
                  {!user?.branchId && (
                    <td className="px-8 py-6">
                      <button
                        onClick={() => !selectedBranch && emp.employee_branch_id && handleBranchSelect({ id: emp.employee_branch_id, name: emp.branch_name })}
                        className={`text-xs font-bold text-navy uppercase tracking-tighter ${!selectedBranch && emp.employee_branch_id ? 'hover:text-indigo cursor-pointer' : ''}`}
                      >
                        {emp.branch_name || 'Unassigned'}
                      </button>
                    </td>
                  )}
                  <td className="px-8 py-6">
                    {emp.check_in_time ? (
                      <div className="space-y-1">
                        <p className="text-sm font-mono font-bold text-navy tracking-tight">
                          {new Date(emp.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </p>
                        {emp.check_out_time ? (
                          <p className="text-xs font-mono text-navy/40">
                            → {new Date(emp.check_out_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        ) : emp.status === 'present' ? (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest bg-emerald/10 text-emerald px-2 py-0.5 rounded-full">
                            <span className="w-1 h-1 rounded-full bg-emerald animate-pulse" />
                            Active
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-navy/20">—</p>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    {emp.status ? (
                      <StatusChip status={emp.status} />
                    ) : (
                      <span className="text-[9px] font-bold text-navy/20 uppercase tracking-widest bg-navy/5 px-3 py-1 rounded-full">
                        Not Marked
                      </span>
                    )}
                  </td>
                  <td className="px-8 py-6">
                    {emp.mode ? (
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${emp.mode === 'field' ? 'bg-indigo' : 'bg-emerald'}`}></div>
                        <p className="text-xs font-bold text-navy/60">{emp.mode.toUpperCase()}</p>
                      </div>
                    ) : (
                      <p className="text-xs font-bold text-navy/20">—</p>
                    )}
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setCalendarEmployee(emp)}
                        className="p-3 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                        title="View attendance history"
                      >
                        <Clock size={18} />
                      </button>
                      <button
                        onClick={() => handleEdit(emp)}
                        className="p-3 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!empLoading && employees.length === 0 && (
                <tr>
                  <td
                    colSpan={user?.branchId ? 6 : 7}
                    className="px-8 py-12 text-center text-xs font-bold text-navy/20 uppercase tracking-widest"
                  >
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="p-6 border-t border-navy/5 flex items-center justify-between">
            <button
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-4 py-2 text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-colors flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </p>
            <button
              disabled={currentPage >= pagination.totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-4 py-2 text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-colors flex items-center gap-1"
            >
              Next <ArrowRight size={14} />
            </button>
          </div>
        )}
      </Card>

      {/* Admin Override Modal */}
      <GlassModal
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title={selectedEmployee?.attendance_id ? 'Correct Attendance' : 'Mark Attendance'}
      >
        {selectedEmployee && (
          <div className="space-y-6">
            <div className="p-6 bg-surface-container-low rounded-3xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm overflow-hidden">
                <Avatar url={selectedEmployee?.profilePhotoUrl} name={selectedEmployee.name} size={56} />
              </div>
              <div>
                <p className="text-xl font-bold text-navy">{selectedEmployee.name}</p>
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest leading-none mt-1">{selectedEmployee.role?.replace(/_/g, ' ')}</p>
                {selectedEmployee.status && (
                  <p className="text-[9px] font-bold text-indigo uppercase mt-1">Currently: {selectedEmployee.status}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5 px-1">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
                {selectedEmployee.attendance_id ? 'New Status' : 'Set Status'}
              </label>
              <select 
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                className="w-full p-4 bg-white rounded-2xl text-navy font-bold outline-none border border-navy/5 card-shadow appearance-none"
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
              <div className="rounded-3xl overflow-hidden bg-navy/5 border border-navy/5 relative h-48 flex items-center justify-center">
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

            <div className="space-y-1.5 px-1">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">
                {selectedEmployee.attendance_id ? 'Correction Justification' : 'Note (Optional)'}
              </label>
              <textarea 
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
                className="w-full p-5 shadow-inner bg-surface-container-low rounded-3xl text-navy text-sm font-medium outline-none h-24 resize-none"
                placeholder={selectedEmployee.attendance_id ? 'Required for audit trail (min 10 chars)...' : 'Optional note for this marking...'}
              />
            </div>

            <div className="flex gap-3 pt-6">
              <button 
                disabled={isActionLoading}
                onClick={() => setIsModalOpen(false)} 
                className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors disabled:opacity-50"
              >
                Dismiss
              </button>
              <button 
                disabled={isActionLoading || (selectedEmployee.attendance_id && correctionNote.length < 10)}
                onClick={handleApplyChanges}
                className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20 disabled:opacity-50 flex items-center justify-center"
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
    indigo: "text-indigo bg-indigo/5 border-indigo/10",
    emerald: "text-emerald bg-emerald/5 border-emerald/10",
    amber: "text-amber-600 bg-amber-500/5 border-amber-500/10",
  };
  
  return (
    <Card className="hover-lift bg-white/70 backdrop-blur-md card-shadow border-white/50 p-7 group">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-6 shadow-sm border ${colors[color]} group-hover:scale-110 transition-transform duration-500`}>
        <Icon size={26} />
      </div>
      <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.3em] mb-1.5 font-mono">{label}</p>
      <div className="flex items-baseline gap-2">
        <p className="text-4xl font-bold text-navy tracking-tight">{value}</p>
        <div className={`w-1.5 h-1.5 rounded-full ${color === 'emerald' ? 'bg-emerald animate-pulse' : 'bg-navy/10'}`} />
      </div>
    </Card>
  );
};
