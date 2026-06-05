import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, BookOpen, ChevronRight } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetLandBookingsQuery } from '../../store/api/apiSlice';
import { formatDate } from '../../lib/formatters';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

const STATUS_STYLES = {
  booked:          'text-blue-600 bg-blue-50',
  advance_paid:    'text-amber-700 bg-amber-50',
  full_paid:       'text-emerald-600 bg-emerald-50',
  completed:       'text-indigo bg-indigo/10',
  cancelled:       'text-red-500 bg-red-50',
};

const STATUS_LABELS = {
  booked:       'Booked',
  advance_paid: 'Advance',
  full_paid:    'Full Paid',
  completed:    'Completed',
  cancelled:    'Cancelled',
};

const STATUS_FILTERS = [
  ['',            'All'],
  ['booked',      'Booked'],
  ['advance_paid','Advance'],
  ['full_paid',   'Full Paid'],
  ['completed',   'Done'],
  ['cancelled',   'Cancelled'],
];

export const LandBookingsPage = () => {
  const user         = useSelector(selectCurrentUser);
  const navigate     = useNavigate();
  const isBranchAdmin = user?.role === 'branch_admin';
  const [statusFilter, setStatusFilter] = useState('');

  const { data: result, isLoading } = useGetLandBookingsQuery({
    status: statusFilter || undefined,
    limit:  200,
  });
  const bookings = result?.data || [];

  const rightAction = isBranchAdmin ? (
    <button
      type="button"
      onClick={() => navigate('/money/schemes/land/bookings/new')}
      aria-label="New booking"
      className="w-10 h-10 rounded-2xl bg-stone-700 flex items-center justify-center text-white shadow-md tactile-press"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/land"
        title="Bookings"
        subtitle="Land plot bookings"
        action={rightAction}
      />

      {/* Status filter chips */}
      <div className="px-4 mb-4">
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4">
          <div className="flex gap-1 w-max">
            {STATUS_FILTERS.map(([key, label]) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all ${
                  statusFilter === key
                    ? 'bg-stone-700 text-white shadow-sm'
                    : 'bg-navy/5 text-navy/40 hover:text-navy/60'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="animate-spin text-stone-400" size={28} aria-hidden="true" />
        </div>
      ) : bookings.length === 0 ? (
        <div className="px-4">
          <div className="bg-white rounded-2xl p-10 border border-navy/5 card-shadow text-center">
            <BookOpen size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No bookings found</p>
            {isBranchAdmin && <p className="text-xs text-navy/40 mt-1">Tap + to create a booking.</p>}
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-2">
          {bookings.map(bk => (
            <button
              key={bk.id}
              type="button"
              onClick={() => navigate(`/money/schemes/land/bookings/${bk.id}`)}
              className="w-full bg-white rounded-2xl p-4 card-shadow border border-navy/5 text-left tactile-press hover:border-stone-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <p className="text-sm font-bold text-navy truncate">{bk.customer_name}</p>
                    <span className="text-[10px] text-navy/40 font-normal">{bk.booking_ref}</span>
                  </div>
                  <p className="text-[11px] text-navy/40 truncate">
                    Plot {bk.site_number} · {bk.site_name}
                    {bk.layout_name ? ` (${bk.layout_name})` : ''}
                  </p>
                  <p className="text-[10px] text-navy/30 mt-0.5">{formatDate(bk.booking_date)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${STATUS_STYLES[bk.status] || 'bg-navy/5 text-navy/40'}`}>
                    {STATUS_LABELS[bk.status] || bk.status}
                  </span>
                  <ChevronRight size={14} className="text-navy/20" aria-hidden="true" />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default LandBookingsPage;
