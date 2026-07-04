import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, ClipboardList, AlertCircle, ArrowLeft } from 'lucide-react';
import { useSubmitDailyCollectionSummaryMutation } from '../../store/api/apiSlice';
import { SOURCE_META, NAVIGABLE_SCHEMES } from '../../lib/schemeConstants';

const SCHEME_CODES = Object.keys(NAVIGABLE_SCHEMES);

export const DailyCollectionSummaryForm = ({ branchId }) => {
  const navigate = useNavigate();
  const [submitSummary, { isLoading: submitting }] = useSubmitDailyCollectionSummaryMutation();
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(SCHEME_CODES.map(code => [code, '']))
  );
  const [submitError, setSubmitError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');
    try {
      const lines = SCHEME_CODES.map(code => ({
        schemeCode:     code,
        expectedAmount: parseFloat(amounts[code]) || 0,
      }));
      await submitSummary({ branchId, lines }).unwrap();
    } catch (err) {
      setSubmitError(err?.data?.error?.message || 'Failed to submit. Please try again.');
    }
  };

  return (
    <div className="min-h-screen bg-white pb-32 pt-4">
      <div className="px-6 mb-6">
        <div className="flex items-center gap-3 mb-3">
          <button
            type="button"
            onClick={() => navigate('/money')}
            className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press flex-shrink-0"
            aria-label="Back to Money"
          >
            <ArrowLeft size={20} aria-hidden="true" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo/10 flex items-center justify-center flex-shrink-0">
              <ClipboardList size={20} className="text-indigo" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-navy">Daily Collection Summary</h2>
              <p className="text-xs font-medium text-navy/40">Required before adding entries today</p>
            </div>
          </div>
        </div>
        <div className="bg-indigo/5 rounded-2xl p-4 border border-indigo/10">
          <p className="text-xs font-medium text-indigo leading-relaxed">
            Declare your expected collections per scheme. Leave blank or enter 0 for schemes with no expected collection. You can start entering entries once submitted.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="px-6 space-y-3 mb-6">
          {SCHEME_CODES.map(code => {
            const meta = SOURCE_META[code] ?? SOURCE_META.scheme;
            const Icon = meta.Icon;
            return (
              <div key={code} className="bg-white rounded-2xl border border-border card-shadow p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-xl ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon size={16} className={meta.color} aria-hidden="true" />
                  </div>
                  <p className="text-sm font-bold text-navy">{meta.label}</p>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-navy/40 pointer-events-none">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0"
                    value={amounts[code]}
                    onChange={e => setAmounts(prev => ({ ...prev, [code]: e.target.value }))}
                    className="w-full pl-8 pr-4 py-3 bg-navy/[0.03] rounded-xl border border-border text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {submitError && (
          <div className="px-6 mb-4 flex items-center gap-2 text-red-600">
            <AlertCircle size={14} aria-hidden="true" />
            <p className="text-xs font-medium">{submitError}</p>
          </div>
        )}

        <div className="px-6">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-indigo text-white text-sm font-bold tactile-press disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              'Submit & Open Schemes'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default DailyCollectionSummaryForm;
