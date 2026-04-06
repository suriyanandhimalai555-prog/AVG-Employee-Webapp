/**
 * AttendanceHome — shell component.
 *
 * Responsibilities:
 *  - Owns the active tab state (home / attendance / money / alerts)
 *  - Handles two full-screen overlays: UserManagement and MD's AdminDashboard
 *  - Renders the correct tab component and the shared bottom nav
 *
 * All data-fetching, business logic, and UI details live in the sub-modules
 * under pages/attendance/ and components/attendance/.
 */

import { useState } from 'react';
import { useSelector } from 'react-redux';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { BottomNav } from '../components/attendance/BottomNav';
import { HomeTab } from './attendance/HomeTab';
import { AttendanceTab } from './attendance/AttendanceTab';
import { MoneyTab } from './attendance/MoneyTab';
import { AlertsTab } from './attendance/AlertsTab';
import { AdminDashboard } from './AdminDashboard';
import { UserManagement } from './UserManagement';
import { EmployeeCalendarPage } from './EmployeeCalendarPage';
import { BranchDetailPage } from './BranchDetailPage';
import { BranchManagement } from './BranchManagement';
import { useAttendanceSocket } from './attendance/hooks/useAttendanceSocket';
import { selectCurrentUser } from '../store/slices/authSlice';

export const AttendanceHome = () => {
  const user = useSelector(selectCurrentUser);
  const [activeTab, setActiveTab] = useState('home');
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [calendarEmployee, setCalendarEmployee] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);

  // Maintains a live Socket.io connection — invalidates RTK Query cache when
  // the worker confirms attendance has been persisted to the database
  useAttendanceSocket();

  // ── Full-screen overlay: Employee calendar (ABM → Sales Officer) ──
  if (calendarEmployee) {
    return (
      <EmployeeCalendarPage
        employee={calendarEmployee}
        onBack={() => setCalendarEmployee(null)}
      />
    );
  }

  // ── Full-screen overlay: Branch Management (MD only, via More menu) ──
  if (activeTab === 'branches') {
    return (
      <div className="min-h-screen bg-surface relative">
        <BranchManagement onBack={() => setActiveTab('home')} />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} user={user} />
      </div>
    );
  }

  // ── Full-screen overlay: Branch detail (MD / GM / Director → branch card) ──
  if (selectedBranch) {
    return (
      <BranchDetailPage
        branch={selectedBranch}
        onBack={() => setSelectedBranch(null)}
      />
    );
  }

  // ── Full-screen overlay: Staff Management ──
  if (showUserManagement) {
    return (
      <div className="min-h-screen bg-surface relative">
        <button
          onClick={() => setShowUserManagement(false)}
          className="fixed top-4 left-4 z-[200] flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-navy/5 rounded-2xl shadow-xl text-[10px] font-bold text-navy uppercase tracking-widest tactile-press"
        >
          <ArrowRight className="rotate-180" size={14} /> Back
        </button>
        <div className="pt-16">
          <UserManagement />
        </div>
      </div>
    );
  }

  // ── Full-screen override: MD on Attendance tab → full-width AdminDashboard ──
  if (activeTab === 'attendance' && user?.role === 'md') {
    return (
      <div className="min-h-screen bg-surface pb-24">
        <AdminDashboard />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} user={user} />
      </div>
    );
  }

  // ── Main Layout Shell ──
  return (
    <div className="app-shell relative">
      <div className="flex-1 w-full max-w-[480px] md:max-w-2xl lg:max-w-5xl mx-auto bg-white/40 md:shadow-2xl md:my-8 md:rounded-[40px] overflow-hidden relative border border-white/20 backdrop-blur-sm min-h-[100dvh] md:min-h-[850px]">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <HomeTab
              onNavigateToAttendance={() => setActiveTab('attendance')}
              onOpenUserManagement={() => setShowUserManagement(true)}
              onOpenCalendar={(emp) => setCalendarEmployee(emp)}
              onBranchSelect={(branch) => setSelectedBranch(branch)}
            />
          )}
          {activeTab === 'attendance' && (
            <AttendanceTab onCheckInSuccess={() => setActiveTab('home')} />
          )}
          {activeTab === 'money'  && <MoneyTab />}
          {activeTab === 'alerts' && <AlertsTab />}
        </AnimatePresence>

        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} user={user} />
      </div>
    </div>
  );
}
