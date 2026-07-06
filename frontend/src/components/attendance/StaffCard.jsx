import { Users, ArrowRight } from 'lucide-react';

// Full-width home-screen navigation card. Defaults to the Staff Management
// shortcut; pass icon/title/subtitle to reuse the same card for other
// destinations (e.g. the OA "My Salary" / "My Incentives" cards).
export const StaffCard = ({
  onOpen,
  icon: Icon = Users,
  title = 'Staff Management',
  subtitle = 'Create and manage employees',
}) => (
  <button
    onClick={onOpen}
    className="w-full p-5 bg-white rounded-3xl card-shadow flex items-center gap-4 tactile-press group hover:shadow-lg hover:shadow-navy/6 transition-all duration-300"
  >
    <div className="w-12 h-12 rounded-2xl bg-indigo/8 flex items-center justify-center text-indigo transition-all duration-300 group-hover:bg-indigo group-hover:text-white group-hover:shadow-lg group-hover:shadow-indigo/25">
      <Icon size={22} />
    </div>
    <div className="flex-1 text-left min-w-0">
      <p className="text-sm font-bold text-navy">{title}</p>
      <p className="text-[10px] font-medium text-navy/40 mt-0.5">{subtitle}</p>
    </div>
    <ArrowRight size={16} className="text-navy/25 transition-all duration-300 group-hover:text-navy/50 group-hover:translate-x-1 shrink-0" />
  </button>
);
