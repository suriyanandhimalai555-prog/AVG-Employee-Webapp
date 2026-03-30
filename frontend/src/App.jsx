import React, { useState } from 'react'
import { AttendanceHome } from './pages/AttendanceHome'
import { AdminDashboard } from './pages/AdminDashboard'
import { Monitor, UserCircle, ShieldCheck } from 'lucide-react'

function App() {
  const [role, setRole] = useState('employee') // 'employee' or 'admin'

  return (
    <div className="relative">
      {/* Demo Role Switcher */}
      <div className="fixed top-4 right-4 z-[100] flex gap-2">
        <button 
          onClick={() => setRole('employee')}
          className={`p-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-xs ${role === 'employee' ? 'bg-white shadow-xl border-navy/10 text-indigo' : 'bg-white/50 backdrop-blur-md border-white/20 text-navy/40 opacity-50'}`}
        >
          <UserCircle size={16} /> Employee
        </button>
        <button 
          onClick={() => setRole('admin')}
          className={`p-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-xs ${role === 'admin' ? 'bg-white shadow-xl border-navy/10 text-indigo' : 'bg-white/50 backdrop-blur-md border-white/20 text-navy/40 opacity-50'}`}
        >
          <ShieldCheck size={16} /> Monitor
        </button>
      </div>

      {role === 'employee' ? <AttendanceHome /> : <AdminDashboard />}
    </div>
  )
}

export default App
