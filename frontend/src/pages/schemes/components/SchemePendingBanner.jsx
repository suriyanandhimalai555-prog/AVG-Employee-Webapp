// Small entry button inside a scheme page → opens that scheme's pending enrollments
// (deposits still awaiting their balance). Shows a count badge when any exist so the
// admin notices them, but stays unobtrusive otherwise. Branch-scoped like the page's
// other queries.
import { useNavigate } from 'react-router-dom';
import { Clock } from 'lucide-react';
import { useGetPendingEnrollmentsQuery } from '../../../store/api/apiSlice';

export const SchemePendingBanner = ({ schemeCode }) => {
  const navigate = useNavigate();
  const { data } = useGetPendingEnrollmentsQuery({ schemeCode, status: 'collecting' });
  const count = data?.data?.length || 0;

  return (
    <div className="px-4 mb-4">
      <button
        type="button"
        onClick={() => navigate(`/money/schemes/pending?scheme=${schemeCode}`)}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold tactile-press transition-colors ${
          count > 0
            ? 'bg-orange-50 border-orange-200 text-orange-700'
            : 'bg-white border-navy/10 text-navy/50'
        }`}
      >
        <Clock size={14} aria-hidden="true" />
        Pending
        {count > 0 && (
          <span className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
    </div>
  );
};
