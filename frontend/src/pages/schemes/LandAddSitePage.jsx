import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useCreateLandSiteMutation } from '../../store/api/apiSlice';
import { isSchemeAdmin } from '../../lib/schemeAuth';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { SuccessConfirmation } from './components/SuccessConfirmation';

const INITIAL_FORM = {
  name: '', location: '', address: '', state: '', loanEnabled: false,
};

export const LandAddSitePage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [form,   setForm]   = useState(INITIAL_FORM);
  const [error,  setError]  = useState('');
  const [done,   setDone]   = useState(null);

  const set = createFormSetter(setForm);
  const [createSite, { isLoading }] = useCreateLandSiteMutation();

  if (!isSchemeAdmin(user?.role)) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/land/sites" title="New Site" />
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">Admin only</p>
            <p className="text-xs text-navy/40 mt-1">Only MD or Management can create sites.</p>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  if (done) {
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title="Site Created"
          subtitle={done.name}
          code=""
          buttonLabel="Add First Layout →"
          onDone={() => navigate(`/money/schemes/land/sites/${done.id}/layouts/new`)}
        >
          <button
            type="button"
            onClick={() => { setForm(INITIAL_FORM); setError(''); setDone(null); }}
            className="w-full mt-3 py-3 rounded-2xl bg-stone-100 text-stone-700 text-sm font-bold border border-stone-200 tactile-press"
          >
            Add Another Site First
          </button>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Site name is required.'); return; }
    try {
      const res = await createSite({
        name:        form.name.trim(),
        location:    form.location.trim()   || undefined,
        address:     form.address.trim()    || undefined,
        state:       form.state.trim()      || undefined,
        loanEnabled: form.loanEnabled,
      }).unwrap();
      setDone(res);
    } catch (err) {
      setError(err?.data?.error?.message || err?.data?.message || 'Failed to create site.');
    }
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader backTo="/money/schemes/land/sites" title="New Site" subtitle="Step 1 — Site name & location" />

      <div className="px-4 mb-4">
        <div className="bg-stone-50 border border-stone-100 rounded-xl px-4 py-3 text-xs text-stone-600">
          A site is a geographic location (e.g. Tirupathi, Nellore). After creating the site you will add layouts — each layout has its own plot pricing, buyback schedule, and commission structure.
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 space-y-5 mt-2">
        <FormField label="Site Name" required>
          <input type="text" value={form.name} onChange={set('name')}
            placeholder="e.g. Tirupathi" className={SCHEME_INPUT_CLASS} required />
        </FormField>

        <FormField label="Location">
          <input type="text" value={form.location} onChange={set('location')}
            placeholder="e.g. Tirupathi, Andhra Pradesh" className={SCHEME_INPUT_CLASS} />
        </FormField>

        <FormField label="Address">
          <textarea value={form.address} onChange={set('address')} rows={2}
            placeholder="Full address…" className={`${SCHEME_INPUT_CLASS} resize-none`} />
        </FormField>

        <FormField label="State">
          <input type="text" value={form.state} onChange={set('state')}
            placeholder="e.g. Andhra Pradesh" className={SCHEME_INPUT_CLASS} />
        </FormField>

        <FormField label="Company Loan Option">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.loanEnabled}
              onChange={e => setForm(f => ({ ...f, loanEnabled: e.target.checked }))}
              className="w-5 h-5 rounded accent-stone-700"
            />
            <span className="text-sm font-medium text-navy">
              Enable company loan for bookings under this site
            </span>
          </label>
        </FormField>

        <FormError error={error} />

        <button type="submit" disabled={isLoading}
          className="w-full py-4 rounded-2xl bg-stone-700 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press">
          {isLoading ? 'Creating…' : 'Create Site → Add Layouts'}
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default LandAddSitePage;
