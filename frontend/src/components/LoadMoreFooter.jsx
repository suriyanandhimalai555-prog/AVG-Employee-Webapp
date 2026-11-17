// frontend/src/components/LoadMoreFooter.jsx
// Footer for a paged list (see hooks/usePagedList.js). Shows how many rows are loaded
// out of how many exist, with a "Load more" button while more pages remain — so a list
// never ends silently part-way through.
import { Loader2 } from 'lucide-react';

const LoadMoreFooter = ({
  shown,
  total,
  hasMore,
  onLoadMore,
  loading = false,
  noun = 'entries',
  className = '',
}) => {
  // Nothing to say when the whole list is already on screen.
  if (!hasMore) return null;
  return (
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-navy/40">
        Showing {shown} of {total} {noun}
      </p>
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="px-3 py-1.5 rounded-xl border border-navy/10 bg-white text-[10px] font-bold uppercase tracking-wider text-indigo disabled:opacity-50 tactile-press flex items-center gap-1.5 flex-shrink-0"
      >
        {loading && <Loader2 size={11} className="animate-spin" aria-hidden="true" />}
        Load more
      </button>
    </div>
  );
};

export default LoadMoreFooter;
