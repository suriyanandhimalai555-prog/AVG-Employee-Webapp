import { Users, ArrowRight } from 'lucide-react';

export const StaffCard = ({ onOpen }) => (
  <button
    onClick={onOpen}
    className="w-full p-5 bg-white rounded-3xl card-shadow flex items-center gap-4 tactile-press"
  >
    <div className="w-12 h-12 rounded-2xl bg-indigo/10 flex items-center justify-center text-indigo">
      <Users size={22} />
    </div>
    <div className="flex-1 text-left">
      <p className="text-sm font-bold text-navy">Staff Management</p>
      <p className="text-[10px] font-medium text-navy/40 mt-0.5">Create and manage employees</p>
    </div>
    <ArrowRight size={16} className="text-navy/30" />
  </button>
);
