// Shared page header for scheme sub-pages.
// Renders: back-arrow button → title block → optional right-side action.
// All scheme pages that sit below /money/schemes use this identical header pattern.
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export const SchemePageHeader = ({ backTo, title, subtitle, action }) => {
  const navigate = useNavigate();

  return (
    <div className="px-4 flex items-center gap-4 mb-5">
      <button
        onClick={() => navigate(backTo)}
        type="button"
        aria-label="Go back"
        className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"
      >
        <ArrowRight className="rotate-180" size={20} aria-hidden="true" />
      </button>
      <div className="flex-1">
        <h2 className="text-2xl font-bold text-navy tracking-tight">{title}</h2>
        {subtitle && (
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">{subtitle}</p>
        )}
      </div>
      {action && action}
    </div>
  );
};
