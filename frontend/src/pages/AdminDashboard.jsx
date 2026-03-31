import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Clock, AlertCircle, CheckCircle2, MoreVertical, 
  Search, Filter, Download, MapPin, 
  ArrowRight, ShieldCheck, Activity, Globe, Loader2, RefreshCw,
  UserX, UserCheck
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import { useSelector } from 'react-redux';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
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
  const [searchQuery, setSearchQuery] = useState('');

  // Admin correction form
  const [newStatus, setNewStatus] = useState('present');
  const [correctionNote, setCorrectionNote] = useState('');

  // RTK Query hooks — auto-cached, auto-refetch after mutations
  const { data: employees = [], isLoading: empLoading, refetch: refetchEmployees } = useGetEmployeesQuery();
  const { data: summary, isLoading: summaryLoading } = useGetSummaryQuery();
  const [adminCorrect, { isLoading: correctLoading }] = useAdminCorrectMutation();
  const [adminMark, { isLoading: markLoading }] = useAdminMarkMutation();

  // Photo fetching hook (only fires if they have a photo_key open in modal)
  const { data: photoData, isLoading: photoLoading } = useGetPhotoUrlQuery(
    selectedEmployee?.photo_key, 
    { skip: !selectedEmployee?.photo_key }
  );

  const isActionLoading = correctLoading || markLoading;

  const handleEdit = (emp) => {
    setSelectedEmployee(emp);
    setNewStatus(emp.status || 'present');
    setCorrectionNote('');
    setIsModalOpen(true);
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

  const filteredEmployees = employees.filter(emp =>
    emp.role !== 'md' &&
    (emp.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Compute live stats explicitly excluding the MD role
  const statEmployees = employees.filter(e => e.role !== 'md');
  const stats = {
    total: statEmployees.length,
    present: statEmployees.filter(e => e.status === 'present').length,
    absent: statEmployees.filter(e => e.status === 'absent').length,
    field: statEmployees.filter(e => e.mode === 'field').length,
    notMarked: statEmployees.filter(e => !e.status).length,
  };

  if (empLoading) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <Loader2 className="animate-spin text-indigo" size={40} />
        <p className="text-xs font-bold text-navy/30 uppercase tracking-widest">Synchronizing Center Data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface p-6 lg:p-12 overflow-x-hidden">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-indigo/10 text-indigo">
            <ShieldCheck size={32} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-1 font-mono">
              {user?.branchId ? 'Branch Management' : 'Organization Management'}
            </p>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-navy tracking-tight">
                {user?.branchId ? 'Center Monitor' : 'Organization Monitor'}
              </h1>
              {!user?.branchId && (
                <span className="bg-indigo/10 text-indigo text-[9px] font-bold px-2 py-1 rounded-md uppercase tracking-widest border border-indigo/10">
                  Global Stats
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={refetchEmployees}
            className="p-3 rounded-xl bg-white text-navy/40 hover:text-indigo transition-all card-shadow border border-navy/5"
          >
            <RefreshCw size={20} />
          </button>
          <button className="px-5 py-3 rounded-xl bg-white text-navy font-bold text-xs card-shadow tactile-press flex items-center gap-2 border border-navy/5">
            <Download size={16} /> Export
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

      {/* Employee Table */}
      <Card className="p-0 overflow-hidden bg-white rounded-3xl card-shadow border-none">
        <div className="p-6 border-b border-navy/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search employees..."
              className="w-full pl-12 pr-4 py-3 bg-surface-container-low rounded-xl text-navy font-bold placeholder:text-navy/20 outline-none transition-all focus:ring-2 ring-indigo/10"
            />
          </div>
          <div className="flex gap-2 items-center">
            <p className="text-[10px] font-bold text-navy/20 uppercase tracking-wider mr-2">{filteredEmployees.length} employees</p>
            <button className="p-3 rounded-xl bg-surface-container-low text-navy/40 hover:text-navy transition-colors"><Filter size={18} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/30">
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Employee</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Role</th>
                {!user?.branchId && (
                  <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Branch</th>
                )}
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Time</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Status</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Mode</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {filteredEmployees.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-container-low/20 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-navy/5 overflow-hidden shrink-0">
                        <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=0B1C30&color=fff&size=32`} alt="" />
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
                      <div className="text-xs font-bold text-navy uppercase tracking-tighter">
                        {emp.branch_name || 'Unassigned'}
                      </div>
                    </td>
                  )}
                  <td className="px-8 py-6">
                    {emp.check_in_time ? (
                      <p className="text-sm font-mono font-bold text-navy tracking-tight">
                        {new Date(emp.check_in_time).toLocaleTimeString('en-US', { hour: 'numeric', minute:'2-digit' })}
                      </p>
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
                    <button 
                      onClick={() => handleEdit(emp)}
                      className="p-3 rounded-xl text-navy/20 hover:text-indigo hover:bg-indigo/5 transition-all"
                    >
                      <ArrowRight size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredEmployees.length === 0 && (
                <tr>
                  <td colSpan="5" className="px-8 py-12 text-center text-xs font-bold text-navy/20 uppercase tracking-widest">
                    No employees found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(selectedEmployee.name)}&background=0B1C30&color=fff&size=56`} alt="" />
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
                ) : photoData?.downloadUrl ? (
                  <img src={photoData.downloadUrl} alt="Field Capture" className="w-full h-full object-cover" />
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
    indigo: "text-indigo bg-indigo/10",
    emerald: "text-emerald bg-emerald/10",
    amber: "text-amber-600 bg-amber-500/10",
  };
  
  return (
    <Card className="hover:scale-[1.02] transition-all duration-300 bg-white card-shadow border-none pb-8">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-sm border border-navy/5 ${colors[color]}`}>
        <Icon size={24} />
      </div>
      <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.15em] mb-1 font-mono">{label}</p>
      <p className="text-4xl font-bold text-navy tracking-tight">{value}</p>
    </Card>
  );
};
