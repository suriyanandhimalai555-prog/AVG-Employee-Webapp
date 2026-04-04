import { Card } from '../Card';

export const StatsGrid = ({ summary, isLoading, label = 'Your Month at a Glance' }) => (
  <div className="px-6 mb-8 w-full max-w-lg mx-auto md:max-w-none">
    <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-4 font-mono flex justify-between items-center">
      {label}
      <span className="bg-navy/5 px-2 py-0.5 rounded-md">
        {new Date().toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase()}
      </span>
    </p>
    <Card className="p-0 border-none shadow-none bg-white/70 backdrop-blur-md rounded-[32px] overflow-hidden card-shadow">
      <div className="grid grid-cols-3 divide-x divide-navy/5">
        {/* Present */}
        <div className="flex flex-col items-center justify-center p-5 group hover:bg-indigo/[0.02] transition-colors">
          <p className="text-2xl md:text-3xl font-bold text-indigo font-mono transition-transform duration-200 group-hover:scale-110">
            {isLoading ? '—' : (summary?.present ?? 0)}
          </p>
          <div className="w-1.5 h-1.5 rounded-full bg-indigo/30 mt-2 mb-1" />
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Present</p>
        </div>
        {/* Absent */}
        <div className="flex flex-col items-center justify-center p-5 group hover:bg-red-500/[0.02] transition-colors">
          <p className="text-2xl md:text-3xl font-bold text-red-500 font-mono transition-transform duration-200 group-hover:scale-110">
            {isLoading ? '—' : (summary?.absent ?? 0)}
          </p>
          <div className="w-1.5 h-1.5 rounded-full bg-red-400/30 mt-2 mb-1" />
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Absent</p>
        </div>
        {/* Field */}
        <div className="flex flex-col items-center justify-center p-5 group hover:bg-emerald/[0.02] transition-colors">
          <p className="text-2xl md:text-3xl font-bold text-emerald font-mono transition-transform duration-200 group-hover:scale-110">
            {isLoading ? '—' : (summary?.field ?? 0)}
          </p>
          <div className="w-1.5 h-1.5 rounded-full bg-emerald/30 mt-2 mb-1" />
          <p className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Field</p>
        </div>
      </div>
    </Card>
  </div>
);
