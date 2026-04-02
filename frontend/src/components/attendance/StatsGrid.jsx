import { Card } from '../Card';

export const StatsGrid = ({ summary, isLoading, label = 'Your Month at a Glance' }) => (
  <div className="px-6 mb-8">
    <p className="text-[10px] font-bold text-navy/30 uppercase tracking-[0.2em] mb-4 font-mono flex justify-between items-center">
      {label}
      <span>
        {new Date().toLocaleString('default', { month: 'short', year: 'numeric' }).toUpperCase()}
      </span>
    </p>
    <Card className="p-0 border-none shadow-none bg-white rounded-3xl overflow-hidden card-shadow">
      <div className="flex divide-x divide-navy/5">
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">
            {isLoading ? '—' : (summary?.present ?? 0)}
          </p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Present</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-red-500 font-mono">
            {isLoading ? '—' : (summary?.absent ?? 0)}
          </p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Absent</p>
        </div>
        <div className="flex-1 p-6 text-center">
          <p className="text-2xl font-bold text-navy font-mono">
            {isLoading ? '—' : (summary?.field ?? 0)}
          </p>
          <p className="text-[9px] font-bold text-navy/30 uppercase tracking-widest mt-1">Field</p>
        </div>
      </div>
    </Card>
  </div>
);
