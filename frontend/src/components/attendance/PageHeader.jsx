import { ArrowRight } from 'lucide-react';

export const PageHeader = ({ user, title, showBack, onBack }) => (
  <header className="px-6 pt-12 pb-6 flex items-center gap-3">
    {showBack ? (
      <button onClick={onBack} className="p-2 -ml-2 text-navy opacity-60">
        <ArrowRight className="rotate-180" size={20} />
      </button>
    ) : (
      <div className="w-10 h-10 rounded-full bg-navy/10 overflow-hidden border border-white shrink-0">
        <img
          src={`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'U')}&background=0B1C30&color=fff`}
          alt="avatar"
        />
      </div>
    )}
    <div className="flex flex-col">
      <h1 className="text-lg font-bold text-navy tracking-tight leading-none">{title}</h1>
      {user?.branchName && (
        <p className="text-[9px] font-bold text-indigo uppercase tracking-widest mt-1">
          {user.branchName}
        </p>
      )}
    </div>
  </header>
);
