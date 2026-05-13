import { useState } from 'react';
import { Search, Plus, X, User, CheckCircle2, Loader2 } from 'lucide-react';
import { useLazySearchCustomersQuery, useCreateCustomerMutation } from '../store/api/apiSlice';

const inputClass = "w-full px-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30";

/**
 * CustomerPicker — search for an existing customer or create a new one inline.
 *
 * Props:
 *   value        string | null   — selected customer id
 *   onChange     (customer) => void — called with the full customer object on selection
 *   onClear      () => void
 */
export const CustomerPicker = ({ value, onChange, onClear }) => {
  const [query, setQuery]       = useState('');
  const [showNew, setShowNew]   = useState(false);
  const [newForm, setNewForm]   = useState({ name: '', phone: '', address: '' });
  const [newError, setNewError] = useState(null);

  const [searchCustomers, { data: searchResult, isFetching }] = useLazySearchCustomersQuery();
  const [createCustomer, { isLoading: creating }]             = useCreateCustomerMutation();

  const results  = searchResult?.data ?? [];
  const showList = query.length >= 2 && !value;

  const handleSearch = (e) => {
    const q = e.target.value;
    setQuery(q);
    setShowNew(false);
    if (q.length >= 2) searchCustomers({ search: q, limit: 10 });
  };

  const handleSelect = (customer) => {
    onChange(customer);
    setQuery('');
  };

  const handleCreate = async () => {
    setNewError(null);
    if (!newForm.name.trim()) { setNewError('Name is required'); return; }
    try {
      const customer = await createCustomer({
        name:    newForm.name.trim(),
        phone:   newForm.phone.trim()   || undefined,
        address: newForm.address.trim() || undefined,
      }).unwrap();
      onChange(customer);
      setShowNew(false);
      setQuery('');
      setNewForm({ name: '', phone: '', address: '' });
    } catch (err) {
      setNewError(err?.data?.error?.message || 'Failed to create customer');
    }
  };

  // ── Selected state ──
  if (value) {
    return (
      <div className="flex items-center gap-3 p-3 bg-indigo/5 border border-indigo/20 rounded-2xl">
        <div className="w-9 h-9 rounded-xl bg-indigo/10 flex items-center justify-center shrink-0">
          <User size={16} className="text-indigo" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-navy truncate">{value.name}</p>
          <p className="text-[10px] font-bold text-indigo uppercase tracking-widest">{value.customer_code}</p>
        </div>
        <button type="button" onClick={onClear} className="p-1.5 rounded-xl bg-navy/10 tactile-press">
          <X size={14} className="text-navy/40" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
        <input
          value={query}
          onChange={handleSearch}
          placeholder="Search by name, phone or code…"
          className={`${inputClass} pl-10`}
        />
        {isFetching && (
          <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/30 animate-spin" />
        )}
      </div>

      {/* Results dropdown */}
      {showList && (
        <div className="bg-white border border-navy/10 rounded-2xl shadow-lg overflow-hidden">
          {results.length > 0 ? (
            results.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-indigo/5 transition-colors text-left border-b border-navy/5 last:border-0 tactile-press"
              >
                <div className="w-8 h-8 rounded-xl bg-indigo/10 flex items-center justify-center shrink-0">
                  <User size={14} className="text-indigo" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-navy truncate">{c.name}</p>
                  <p className="text-[10px] text-navy/40 font-medium">{c.customer_code}{c.phone ? ` · ${c.phone}` : ''}</p>
                </div>
                <CheckCircle2 size={14} className="text-indigo/30 shrink-0" />
              </button>
            ))
          ) : (
            <p className="px-4 py-3 text-xs text-navy/40 font-medium">No customers found</p>
          )}

          {/* Create new option */}
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="w-full flex items-center gap-3 px-4 py-3 bg-emerald-50 hover:bg-emerald-100 transition-colors text-left tactile-press border-t border-navy/5"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
              <Plus size={14} className="text-emerald-600" />
            </div>
            <p className="text-sm font-bold text-emerald-700">Create new customer</p>
          </button>
        </div>
      )}

      {/* Create form (shown when "Create new" is tapped) */}
      {showNew && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-widest">New Customer</p>
            <button type="button" onClick={() => setShowNew(false)}>
              <X size={16} className="text-navy/30" />
            </button>
          </div>

          <input
            required
            placeholder="Full name *"
            value={newForm.name}
            onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
            className={inputClass}
          />
          <input
            type="tel"
            placeholder="Phone number"
            value={newForm.phone}
            onChange={e => setNewForm(f => ({ ...f, phone: e.target.value }))}
            className={inputClass}
          />
          <input
            placeholder="Address / Area"
            value={newForm.address}
            onChange={e => setNewForm(f => ({ ...f, address: e.target.value }))}
            className={inputClass}
          />

          {newError && <p className="text-xs text-red-500 font-medium">{newError}</p>}

          <button
            type="button"
            disabled={creating}
            onClick={handleCreate}
            className="w-full py-3 bg-emerald-600 text-white rounded-2xl text-sm font-bold tactile-press disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Create & Select
          </button>
        </div>
      )}
    </div>
  );
};
