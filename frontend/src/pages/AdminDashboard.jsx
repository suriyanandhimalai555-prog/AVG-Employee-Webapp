import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Clock, AlertCircle, CheckCircle2, MoreVertical, 
  Edit2, Search, Filter, Download, MapPin, 
  ArrowRight, ShieldCheck, Activity, Globe
} from 'lucide-react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';

const MOCK_WORKFORCE = [
  { id: 'EMP001', name: 'Alex Rivera', role: 'Sales Officer', status: 'present', time: '08:45 AM', location: 'Office' },
  { id: 'EMP002', name: 'Sara Chen', role: 'Field Agent', status: 'late', time: '09:15 AM', location: 'Site A' },
  { id: 'EMP003', name: 'Marcus Bell', role: 'Branch Admin', status: 'present', time: '08:30 AM', location: 'Office' },
  { id: 'EMP004', name: 'Jordan Lee', role: 'Field Agent', status: 'absent', time: '-', location: '-' },
  { id: 'EMP005', name: 'Elena Gomez', role: 'Sales Officer', status: 'present', time: '08:55 AM', location: 'Office' },
];

export const AdminDashboard = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const handleEdit = (emp) => {
    setSelectedEmployee(emp);
    setIsModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-surface p-6 lg:p-12 overflow-x-hidden">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-12">
        <div className="flex items-center gap-4">
           <div className="p-3 rounded-2xl bg-indigo/10 text-indigo">
              <ShieldCheck size={32} />
           </div>
           <div>
              <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-1 font-mono">Branch Management</p>
              <h1 className="text-3xl font-bold text-navy tracking-tight">Center Monitor</h1>
           </div>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-3 rounded-xl bg-white text-navy font-bold text-xs card-shadow tactile-press flex items-center gap-2 border border-navy/5">
            <Download size={16} /> Export Data
          </button>
          <Button className="px-6 py-3 rounded-xl">Generate Report</Button>
        </div>
      </header>

      {/* Modern Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <StatCard icon={Users} label="Total Workforce" value="124" color="indigo" />
        <StatCard icon={Activity} label="On-Duty Now" value="98" color="emerald" />
        <StatCard icon={Clock} label="Late Avg" value="08:42" color="amber" fontMono />
        <StatCard icon={Globe} label="Field Ops" value="12" color="indigo" />
      </div>

      <Card className="p-0 overflow-hidden bg-white rounded-3xl card-shadow border-none">
        <div className="p-6 border-b border-navy/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
            <input 
              type="text" 
              placeholder="Search center database..."
              className="w-full pl-12 pr-4 py-3 bg-surface-container-low rounded-xl text-navy font-bold placeholder:text-navy/20 outline-none transition-all focus:ring-2 ring-indigo/10"
            />
          </div>
          <div className="flex gap-2">
            <button className="p-3 rounded-xl bg-surface-container-low text-navy/40 hover:text-navy transition-colors"><Filter size={18} /></button>
            <button className="p-3 rounded-xl bg-surface-container-low text-navy/40 hover:text-navy transition-colors"><MoreVertical size={18} /></button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low/30">
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Employee Identity</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Operations Role</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono">Live Status</th>
                <th className="px-8 py-4 text-[9px] font-bold text-navy/30 uppercase tracking-widest font-mono text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-navy/5">
              {MOCK_WORKFORCE.map((emp) => (
                <tr key={emp.id} className="hover:bg-surface-container-low/20 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="font-bold text-navy group-hover:text-indigo transition-colors">{emp.name}</div>
                    <div className="text-[10px] font-mono font-bold text-navy/20 mt-0.5">{emp.id}</div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="text-xs font-bold text-navy/60">{emp.role}</div>
                  </td>
                  <td className="px-8 py-6">
                    <StatusChip status={emp.status} />
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
            </tbody>
          </table>
        </div>
      </Card>

      <GlassModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Admin Override"
      >
        {selectedEmployee && (
          <div className="space-y-6">
            <div className="p-6 bg-surface-container-low rounded-3xl flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-white shadow-sm overflow-hidden flex items-center justify-center text-indigo">
                <Users size={28} />
              </div>
              <div>
                <p className="text-xl font-bold text-navy">{selectedEmployee.name}</p>
                <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest leading-none mt-1">{selectedEmployee.role}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5 px-1">
                  <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">New Status</label>
                  <select className="w-full p-4 bg-white rounded-2xl text-navy font-bold outline-none border border-navy/5 card-shadow appearance-none">
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                  </select>
               </div>
               <div className="space-y-1.5 px-1">
                  <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Shift Start</label>
                  <input type="time" defaultValue="09:00" className="w-full p-4 bg-white rounded-2xl text-navy font-bold outline-none border border-navy/5 card-shadow" />
               </div>
            </div>

            <div className="space-y-1.5 px-1">
              <label className="text-[10px] font-bold text-navy/30 uppercase tracking-widest ml-1">Correction Justification</label>
              <textarea 
                className="w-full p-5 shadow-inner bg-surface-container-low rounded-3xl text-navy text-sm font-medium outline-none h-32 resize-none"
                placeholder="Required documentation for audit trail..."
              />
            </div>

            <div className="flex gap-3 pt-6">
              <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-navy/40 hover:text-navy transition-colors">Dismiss</button>
              <button 
                onClick={() => { alert('Record updated'); setIsModalOpen(false); }}
                className="flex-1 gradient-primary text-white py-4 rounded-2xl font-bold tactile-press shadow-xl shadow-indigo/20"
              >
                Apply Changes
              </button>
            </div>
          </div>
        )}
      </GlassModal>
    </div>
  );
};

const StatCard = ({ icon: Icon, label, value, color, fontMono }) => {
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
      <p className={`text-4xl font-bold text-navy tracking-tight ${fontMono ? 'font-mono' : 'font-sans'}`}>{value}</p>
    </Card>
  );
};
