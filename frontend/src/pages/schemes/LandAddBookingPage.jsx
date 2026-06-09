import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useCreateLandBookingMutation,
  useGetLandEmployeesQuery,
} from '../../store/api/apiSlice';
import { formatCurrency } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, createFormSetter, getTodayISO } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { SuccessConfirmation } from './components/SuccessConfirmation';
import { CustomerPicker } from '../../components/CustomerPicker';
import { PlotSelect } from './components/PlotSelect';
import { BranchPicker } from '../../components/BranchPicker';

const ROLE_LABELS = {
  sales_officer: 'SO', abm: 'ABM', branch_manager: 'BM',
  gm: 'GM', branch_admin: 'Branch Admin', director: 'Director',
};

const INITIAL_FORM = {
  bookingRef: '', plotId: '', paymentMode: 'full_payment',
  bookingDate: getTodayISO(), referrerId: '', notes: '',
};

export const LandAddBookingPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const isManagement = user?.role === 'management';
  const [branchId,     setBranchId]     = useState('');
  const [customer,     setCustomer]     = useState(null);
  const [form,         setForm]         = useState(INITIAL_FORM);
  const [selectedPlot, setSelectedPlot] = useState(null);
  const [error,        setError]        = useState('');
  const [done,         setDone]         = useState(null);
  const set = createFormSetter(setForm);

  // Resolved branch: Management picks via BranchPicker; branch_admin uses their own.
  const effectiveBranchId = isManagement ? branchId : user?.branchId;

  // Employees for the referrer picker — skip until branch is known.
  const { data: employees = [] } = useGetLandEmployeesQuery(
    effectiveBranchId ? effectiveBranchId : null,
    { skip: !effectiveBranchId }
  );

  const [createBooking, { isLoading }] = useCreateLandBookingMutation();

  const handlePlotChange = (plotId, plot) => {
    setForm(f => ({ ...f, plotId }));
    setSelectedPlot(plot);
  };

  if (user?.role !== 'branch_admin' && !isManagement) {
    return (
      <SchemePageWrapper>
        <SchemePageHeader backTo="/money/schemes/land/bookings" title="New Booking" />
        <div className="px-4 pt-8">
          <div className="bg-white rounded-2xl p-8 border border-navy/5 card-shadow text-center">
            <ShieldCheck size={28} className="text-navy/30 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">Branch Admin only</p>
          </div>
        </div>
      </SchemePageWrapper>
    );
  }

  if (done) {
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title="Booking Created"
          subtitle={`${customer?.name} — Plot ${done.booking?.plot?.site_number || ''}`}
          code={done.booking?.booking_ref || ''}
          buttonLabel="View Booking"
          onDone={() => navigate(`/money/schemes/land/bookings/${done.booking?.id}`)}
        >
          <button type="button"
            onClick={() => { setCustomer(null); setForm(INITIAL_FORM); setError(''); setDone(null); }}
            className="w-full mt-3 py-3 rounded-2xl bg-stone-100 text-stone-700 text-sm font-bold border border-stone-200 tactile-press">
            Create Another Booking
          </button>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!customer) { setError('Please select or create a customer.'); return; }
    if (!form.plotId) { setError('Please select a plot.'); return; }
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    try {
      const res = await createBooking({
        bookingRef:  form.bookingRef.trim(),
        customerId:  customer.id,
        plotId:      form.plotId,
        paymentMode: form.paymentMode,
        bookingDate: form.bookingDate,
        referrerId:  form.referrerId || undefined,
        notes:       form.notes.trim() || undefined,
        branchId:    isManagement ? branchId : undefined,
      }).unwrap();
      setDone(res);
    } catch (err) {
      setError(err?.data?.error?.message || err?.data?.message || 'Failed to create booking.');
    }
  };

  return (
    <SchemePageWrapper>
      <SchemePageHeader backTo="/money/schemes/land/bookings" title="New Booking" subtitle="Create a land booking" />

      <form onSubmit={handleSubmit} className="px-4 space-y-5 mt-2">
        {isManagement && (
          <FormField label="Branch" required>
            <BranchPicker value={branchId} onChange={setBranchId} />
          </FormField>
        )}

        <FormField label="Booking ID (Manual)" required>
          <input type="text" value={form.bookingRef} onChange={set('bookingRef')}
            placeholder="Enter booking reference" className={SCHEME_INPUT_CLASS} required />
        </FormField>

        <FormField label="Customer" required>
          <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)}
            branchId={isManagement ? branchId : undefined} />
        </FormField>

        <FormField label="Plot" required>
          <PlotSelect value={form.plotId} onChange={handlePlotChange} />
        </FormField>

        {/* Plot preview */}
        {selectedPlot && (
          <div className="bg-stone-50 border border-stone-100 rounded-2xl p-3 grid grid-cols-2 gap-2">
            {[
              { label: 'Area',       val: `${selectedPlot.area_sqft} sqft` },
              { label: 'Land Cost',  val: formatCurrency(selectedPlot.land_cost) },
              { label: 'Buyback/mo', val: `₹${Number(selectedPlot.buyback_bonus_monthly).toLocaleString('en-IN')}` },
              { label: 'Loan',       val: selectedPlot.loan_enabled ? '✓ Enabled' : '✗ Not available' },
            ].map(({ label, val }) => (
              <div key={label}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500">{label}</p>
                <p className="text-xs font-semibold text-navy">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Referring employee — who sold this plot */}
        <FormField label="Referring Employee (optional)"
          hint="The SO or employee who sold this plot. Commission will be distributed to their chain.">
          <select value={form.referrerId} onChange={set('referrerId')}
            className={`${SCHEME_INPUT_CLASS} appearance-none`}
            disabled={!effectiveBranchId}>
            <option value="">— No referrer —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} · {ROLE_LABELS[emp.role] || emp.role}
              </option>
            ))}
          </select>
          {!effectiveBranchId && (
            <p className="text-[10px] text-navy/40 mt-1">
              {isManagement ? 'Select a branch first to load employees.' : 'No employees found.'}
            </p>
          )}
        </FormField>

        <FormField label="Payment Mode" required>
          <div className="grid grid-cols-2 gap-2">
            {[
              { val: 'full_payment',         label: 'Full Payment'  },
              { val: 'advance_full_payment', label: 'Advance + Full' },
            ].map(({ val, label }) => (
              <button key={val} type="button"
                onClick={() => setForm(f => ({ ...f, paymentMode: val }))}
                className={`py-3 rounded-2xl border-2 text-sm font-bold transition-all ${
                  form.paymentMode === val
                    ? 'border-stone-700 bg-stone-50 text-stone-700'
                    : 'border-navy/10 text-navy/50'
                }`}>
                {label}
              </button>
            ))}
          </div>
        </FormField>

        <FormField label="Booking Date" required>
          <input type="date" value={form.bookingDate} onChange={set('bookingDate')}
            className={SCHEME_INPUT_CLASS} required />
        </FormField>

        <FormField label="Notes (optional)">
          <textarea value={form.notes} onChange={set('notes')} rows={2}
            placeholder="Any notes…" className={`${SCHEME_INPUT_CLASS} resize-none`} />
        </FormField>

        <FormError error={error} />

        <button type="submit" disabled={isLoading}
          className="w-full py-4 rounded-2xl bg-stone-700 text-white text-sm font-bold shadow-md disabled:opacity-50 tactile-press">
          {isLoading ? 'Creating…' : 'Create Booking'}
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default LandAddBookingPage;
