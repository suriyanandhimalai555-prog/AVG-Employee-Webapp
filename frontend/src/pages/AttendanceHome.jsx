import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';

import { HomeTab } from './attendance/HomeTab';
import { AttendanceTab } from './attendance/AttendanceTab';
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
  const navigate = useNavigate();
  const { setActiveTab: setContextActiveTab, setOnTabChange: setContextOnTabChange } = useOutletContext();
  
  const [activeTab, setActiveTab] = useState(() => {
    const saved = sessionStorage.getItem('attendanceHomeTab');
    sessionStorage.removeItem('attendanceHomeTab');
    return saved || 'home';
  });
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [calendarEmployee, setCalendarEmployee] = useState(null);
  const [selectedBranch, setSelectedBranch] = useState(null);

  useEffect(() => {
    if (setContextActiveTab) setContextActiveTab(activeTab);
  }, [activeTab, setContextActiveTab]);

  useEffect(() => {
    if (setContextOnTabChange) setContextOnTabChange(() => handleTabChange);
  }, [setContextOnTabChange]);

  const handleTabChange = (tab) => {
    if (tab === 'profile') {
      navigate('/profile');
      return;
    }
    if (tab === 'money') {
      navigate('/money');
      return;
    }
    setActiveTab(tab);
  };

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
      <BranchManagement onBack={() => setActiveTab('home')} />
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
      <AdminDashboard />
    );
  }

  // ── Main Content ──
  return (
    <AnimatePresence mode="wait">
      {activeTab === 'home' && (
        <HomeTab
          onNavigateToAttendance={() => setActiveTab('attendance')}
          onOpenUserManagement={() => setShowUserManagement(true)}
          onOpenCalendar={(emp) => setCalendarEmployee(emp)}
          onBranchSelect={(branch) => setSelectedBranch(branch)}
          onOpenLeadershipList={(kind) => navigate(`/leadership/${kind}`)}
        />
      )}
      {activeTab === 'attendance' && (
        <AttendanceTab onCheckInSuccess={() => setActiveTab('home')} />
      )}
      {activeTab === 'alerts' && <AlertsTab />}
    </AnimatePresence>
  );
}

