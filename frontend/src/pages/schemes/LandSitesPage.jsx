import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Plus, Loader2, Landmark, ChevronRight, ToggleLeft, ToggleRight } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useGetLandSitesQuery } from '../../store/api/apiSlice';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';

const STATUS_STYLES = {
  active:   'text-emerald-600 bg-emerald-50',
  inactive: 'text-red-500 bg-red-50',
};

export const LandSitesPage = () => {
  const user          = useSelector(selectCurrentUser);
  const navigate      = useNavigate();
  const isSiteAdmin   = isSchemeAdmin(user?.role);

  const { data: result, isLoading } = useGetLandSitesQuery({ limit: 200 });
  const sites = result?.data || [];

  const rightAction = isSiteAdmin ? (
    <button
      type="button"
      onClick={() => navigate('/money/schemes/land/sites/new')}
      aria-label="New site"
      className="w-10 h-10 rounded-2xl bg-stone-700 flex items-center justify-center text-white shadow-md tactile-press"
    >
      <Plus size={20} aria-hidden="true" />
    </button>
  ) : null;

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/land"
        title="Sites"
        subtitle="Managed by MD & Management"
        action={rightAction}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="animate-spin text-stone-400" size={28} aria-hidden="true" />
        </div>
      ) : sites.length === 0 ? (
        <div className="px-4">
          <div className="bg-white rounded-2xl p-10 border border-navy/5 card-shadow text-center">
            <Landmark size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No Sites Yet</p>
            {isSiteAdmin && (
              <p className="text-xs text-navy/40 mt-1">Tap + to create the first site.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 space-y-3">
          {sites.map(site => (
            <button
              key={site.id}
              type="button"
              onClick={() => navigate(`/money/schemes/land/sites/${site.id}`)}
              className="w-full bg-white rounded-3xl p-4 card-shadow border border-navy/5 text-left tactile-press hover:border-stone-200 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy">{site.name}</p>
                  {site.layout_name && (
                    <p className="text-[11px] text-navy/50 mt-0.5">{site.layout_name}</p>
                  )}
                  <p className="text-[11px] text-navy/40 mt-1 truncate">
                    {[site.location, site.state].filter(Boolean).join(', ')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-medium text-navy/50">
                    <span>{site.total_plots || 0} plots</span>
                    <span>·</span>
                    <span className="text-emerald-600">{site.available_plots || 0} available</span>
                    <span>·</span>
                    <span className="text-amber-600">{site.booked_plots || 0} booked</span>
                    {site.loan_enabled && (
                      <>
                        <span>·</span>
                        <span className="text-blue-600 flex items-center gap-0.5">
                          <ToggleRight size={11} aria-hidden="true" /> Loan
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${STATUS_STYLES[site.status] || 'bg-navy/5 text-navy/40'}`}>
                    {site.status}
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

export default LandSitesPage;
