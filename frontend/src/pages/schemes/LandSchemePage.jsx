import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Building2, Landmark, BookOpen,
  AlertTriangle, Clock, TrendingUp, Plus,
} from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetLandDashboardQuery } from '../../store/api/apiSlice';
import { formatCurrency, formatDate } from '../../lib/formatters';
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
  advance_paid: 'Advance Paid',
  full_paid:    'Full Paid',
  completed:    'Completed',
  cancelled:    'Cancelled',
};

export const LandSchemePage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const isMD     = user?.role === 'md';

  const { data: dash, isLoading } = useGetLandDashboardQuery();

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo={isMD ? '/schemes' : '/money/schemes'}
        title="Land Sales"
        subtitle="Sites · Plots · Bookings · Buyback"
        action={isMD ? (
          <button
            type="button"
            onClick={() => navigate('/money/schemes/land/sites')}
            className="w-10 h-10 rounded-2xl bg-stone-700 flex items-center justify-center text-white shadow-md tactile-press"
            aria-label="Manage sites"
          >
            <Landmark size={18} aria-hidden="true" />
          </button>
        ) : null}
      />

      {/* MD — prominent site management section (always visible, no loading dependency) */}
      {isMD && (
        <div className="px-4 mb-5">
          <div className="bg-stone-700 rounded-3xl p-4 card-shadow flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">Sites & Plots</p>
              <p className="text-[11px] text-white/60 mt-0.5">
                Create sites, add plots, set land cost & buyback bonus
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => navigate('/money/schemes/land/sites/new')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white text-stone-700 text-xs font-bold tactile-press"
              >
                <Plus size={13} aria-hidden="true" /> New Site
              </button>
              <button
                type="button"
                onClick={() => navigate('/money/schemes/land/sites')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-white/20 text-white text-xs font-bold tactile-press"
              >
                All Sites
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-stone-400" size={32} aria-hidden="true" />
        </div>
      ) : (
        <>
          {/* Plot stats strip */}
          {dash && (
            <div className="px-4 mb-5">
              <div className="bg-white rounded-3xl p-4 card-shadow border border-border grid grid-cols-4 divide-x divide-border">
                {[
                  { label: 'Available', val: dash.plots?.available ?? 0,  cls: 'text-emerald-600' },
                  { label: 'Booked',    val: dash.plots?.booked    ?? 0,  cls: 'text-amber-600' },
                  { label: 'Collected', val: formatCurrency(dash.bookings?.totalCollected ?? 0), cls: 'text-stone-700' },
                  { label: 'Overdue',   val: dash.overduePayouts   ?? 0,  cls: 'text-red-500' },
                ].map(({ label, val, cls }) => (
                  <div key={label} className="text-center px-2">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-navy/30">{label}</p>
                    <p className={`text-base font-bold mt-0.5 ${cls}`}>{val}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alert banners */}
          {dash && (dash.overduePayouts > 0 || dash.upcomingDeadlines7 > 0) && (
            <div className="px-4 mb-4 space-y-2">
              {dash.overduePayouts > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-red-600 flex-shrink-0" aria-hidden="true" />
                  <p className="text-xs font-semibold text-red-700">
                    {dash.overduePayouts} overdue buyback payout{dash.overduePayouts > 1 ? 's' : ''} — action required
                  </p>
                </div>
              )}
              {dash.upcomingDeadlines7 > 0 && (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 flex items-center gap-2">
                  <Clock size={14} className="text-amber-600 flex-shrink-0" aria-hidden="true" />
                  <p className="text-xs font-semibold text-amber-700">
                    {dash.upcomingDeadlines7} advance deadline{dash.upcomingDeadlines7 > 1 ? 's' : ''} due in the next 7 days
                  </p>
                </div>
              )}
              {dash.payoutsDueThisMonth > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-3 flex items-center gap-2">
                  <TrendingUp size={14} className="text-blue-600 flex-shrink-0" aria-hidden="true" />
                  <p className="text-xs font-semibold text-blue-700">
                    {dash.payoutsDueThisMonth} buyback payout{dash.payoutsDueThisMonth > 1 ? 's' : ''} due this month
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick nav cards */}
          <div className="px-4 mb-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/money/schemes/land/bookings')}
              className="bg-white rounded-2xl p-4 card-shadow border border-border text-left tactile-press hover:border-stone-200 transition-colors"
            >
              <BookOpen size={20} className="text-stone-600 mb-2" aria-hidden="true" />
              <p className="text-sm font-bold text-navy">Bookings</p>
              <p className="text-[11px] text-navy/40 mt-0.5">
                {(dash?.bookings?.fullPaid ?? 0) + (dash?.bookings?.advancePaid ?? 0)} active
              </p>
            </button>
            {!isMD && (
              <button
                type="button"
                onClick={() => navigate('/money/schemes/land/bookings/new')}
                className="bg-stone-700 rounded-2xl p-4 card-shadow text-left tactile-press"
              >
                <Building2 size={20} className="text-white/80 mb-2" aria-hidden="true" />
                <p className="text-sm font-bold text-white">New Booking</p>
                <p className="text-[11px] text-white/60 mt-0.5">Create a booking</p>
              </button>
            )}
          </div>

          {/* Recent bookings */}
          {dash?.recentBookings?.length > 0 && (
            <div className="px-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-navy/30 mb-3">
                Recent Bookings
              </p>
              <div className="bg-white rounded-2xl card-shadow border border-border overflow-hidden divide-y divide-border">
                {dash.recentBookings.map((b) => (
                  <button
                    key={b.booking_ref}
                    type="button"
                    onClick={() => navigate(`/money/schemes/land/bookings`)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left tactile-press"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy truncate">
                        {b.customer_name}
                        <span className="ml-2 text-[10px] text-navy/40 font-normal">{b.booking_ref}</span>
                      </p>
                      <p className="text-[11px] text-navy/40 truncate">
                        {b.site_number} · {b.site_name} · {formatDate(b.booking_date)}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase flex-shrink-0 ${STATUS_STYLES[b.status] || 'bg-navy/5 text-navy/40'}`}>
                      {STATUS_LABELS[b.status] || b.status}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </SchemePageWrapper>
  );
};

export default LandSchemePage;
