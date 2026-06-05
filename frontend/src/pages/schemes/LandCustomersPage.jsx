import { useState } from 'react';
import { useSelector } from 'react-redux';
import { Users, Search, Plus, Loader2, ChevronRight } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLandCustomersQuery,
  useCreateLandCustomerMutation,
} from '../../store/api/apiSlice';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';

const INITIAL_FORM = {
  customerRef: '', name: '', phone: '', address: '', idProof: '', email: '',
};

const AddCustomerForm = ({ onSuccess, onCancel }) => {
  const [form,  setForm]  = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const set = createFormSetter(setForm);
  const [createCustomer, { isLoading }] = useCreateLandCustomerMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await createCustomer({
        customerRef: form.customerRef.trim(),
        name:        form.name.trim(),
        phone:       form.phone.trim()   || undefined,
        address:     form.address.trim() || undefined,
        idProof:     form.idProof.trim() || undefined,
        email:       form.email.trim()   || undefined,
      }).unwrap();
      setForm(INITIAL_FORM);
      onSuccess?.();
    } catch (err) {
      setError(err?.data?.error?.message || err?.data?.message || 'Failed to create customer.');
    }
  };

  return (
    <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 space-y-3 mb-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-stone-600">New Customer</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Customer ID *</p>
            <input type="text" value={form.customerRef} onChange={set('customerRef')}
              placeholder="Manual ID" className={SCHEME_INPUT_CLASS} required />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Full Name *</p>
            <input type="text" value={form.name} onChange={set('name')}
              placeholder="Customer name" className={SCHEME_INPUT_CLASS} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Phone</p>
            <input type="text" value={form.phone} onChange={set('phone')}
              placeholder="Mobile number" className={SCHEME_INPUT_CLASS} />
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy/40 mb-1">Email</p>
            <input type="email" value={form.email} onChange={set('email')}
              placeholder="Email (optional)" className={SCHEME_INPUT_CLASS} />
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">ID Proof</p>
          <input type="text" value={form.idProof} onChange={set('idProof')}
            placeholder="Aadhaar / PAN / Passport" className={SCHEME_INPUT_CLASS} />
        </div>
        <div>
          <p className="text-[10px] font-bold text-navy/40 mb-1">Address</p>
          <textarea value={form.address} onChange={set('address')} rows={2}
            placeholder="Full address" className={`${SCHEME_INPUT_CLASS} resize-none`} />
        </div>
        <FormError error={error} />
        <div className="flex gap-2">
          <button type="submit" disabled={isLoading}
            className="flex-1 py-3 rounded-2xl bg-stone-700 text-white text-sm font-bold disabled:opacity-50 tactile-press">
            {isLoading ? 'Saving…' : 'Save Customer'}
          </button>
          <button type="button" onClick={onCancel}
            className="px-5 py-3 rounded-2xl bg-navy/5 text-navy/50 text-sm font-bold tactile-press">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export const LandCustomersPage = () => {
  const user     = useSelector(selectCurrentUser);
  const isBranchAdmin = user?.role === 'branch_admin';

  const [search,     setSearch]     = useState('');
  const [showAdd,    setShowAdd]    = useState(false);

  const { data: result, isLoading } = useGetLandCustomersQuery({ search: search || undefined, limit: 200 });
  const customers = result?.data || [];

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/land"
        title="Customers"
        subtitle="Land sales customers"
        action={isBranchAdmin ? (
          <button type="button" onClick={() => setShowAdd(v => !v)}
            aria-label="New customer"
            className="w-10 h-10 rounded-2xl bg-stone-700 flex items-center justify-center text-white shadow-md tactile-press">
            <Plus size={18} aria-hidden="true" />
          </button>
        ) : null}
      />

      {isBranchAdmin && showAdd && (
        <div className="px-4">
          <AddCustomerForm onSuccess={() => setShowAdd(false)} onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {/* Search */}
      <div className="px-4 mb-4">
        <div className="relative">
          <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30" aria-hidden="true" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone, or ID…"
            className="w-full pl-10 pr-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-stone-200 card-shadow"
          />
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="animate-spin text-stone-400" size={28} aria-hidden="true" />
        </div>
      ) : customers.length === 0 ? (
        <div className="px-4">
          <div className="bg-white rounded-2xl p-10 border border-navy/5 card-shadow text-center">
            <Users size={28} className="text-navy/20 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-navy">No Customers</p>
            {isBranchAdmin && <p className="text-xs text-navy/40 mt-1">Tap + to add a customer.</p>}
          </div>
        </div>
      ) : (
        <div className="px-4">
          <div className="bg-white rounded-2xl card-shadow border border-navy/5 overflow-hidden divide-y divide-navy/5">
            {customers.map(c => (
              <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {c.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy truncate">
                    {c.name}
                    <span className="ml-2 text-[10px] text-navy/40 font-normal">{c.customer_ref}</span>
                  </p>
                  <p className="text-[11px] text-navy/40 truncate">
                    {c.phone || 'No phone'}
                    {c.active_bookings_count > 0 && (
                      <span className="ml-2 text-emerald-600">· {c.active_bookings_count} booking{c.active_bookings_count > 1 ? 's' : ''}</span>
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </SchemePageWrapper>
  );
};

export default LandCustomersPage;
