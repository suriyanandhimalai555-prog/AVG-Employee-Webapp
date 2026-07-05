import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  Search, MessageCircle, Phone, PhoneOff, ToggleLeft, ToggleRight,
  Loader2, Users, ChevronLeft, ChevronRight, AlertTriangle, Building2,
  Pencil, MapPin,
} from 'lucide-react';
import {
  useSearchCustomersQuery,
  useUpdateCustomerMutation,
  useGetWhatsappMessagesSettingQuery,
  useGetBranchesQuery,
} from '../store/api/apiSlice';
import { selectCurrentUser } from '../store/slices/authSlice';
import { INPUT_BASE } from '../lib/tailwindClasses';
import LoadingSpinner from '../components/LoadingSpinner';
import EmptyState from '../components/EmptyState';
import { GlassModal } from '../components/GlassModal';
import { Button } from '../components/Button';

const PAGE_SIZE = 20;

/**
 * CustomersPage — per-customer WhatsApp notification management.
 *
 * Branch admins search the customers of their own branch and toggle the
 * customer's WhatsApp opt-in (customers.has_whatsapp). The WhatsApp outbox
 * worker re-reads this flag at send time, so the toggle immediately affects
 * every future enrollment/renewal message for that customer.
 *
 * management uses the same screen but must pick a branch first (its account
 * has no branch of its own — the server scopes search/update by the branchId
 * we pass along).
 */
export const CustomersPage = () => {
  const user = useSelector(selectCurrentUser);
  const isManagement = user?.role === 'management';

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [branchId, setBranchId] = useState('');
  const [togglingId, setTogglingId] = useState(null);
  const [toggleError, setToggleError] = useState(null);

  // Contact-edit modal (phone + address) — admins fill in missing details
  // so the customer becomes reachable on WhatsApp.
  const [editCustomer, setEditCustomer] = useState(null);
  const [editForm, setEditForm] = useState({ phone: '', address: '' });
  const [editError, setEditError] = useState(null);
  const [editSaving, setEditSaving] = useState(false);

  // Debounce the search box so we don't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: whatsappSetting } = useGetWhatsappMessagesSettingQuery();
  const messagingEnabled = whatsappSetting?.enabled === true;

  const { data: branches = [] } = useGetBranchesQuery(undefined, { skip: !isManagement });

  const { data: result, isLoading, isFetching } = useSearchCustomersQuery(
    {
      search: search || undefined,
      page,
      limit: PAGE_SIZE,
      branchId: isManagement ? branchId : undefined,
    },
    { skip: isManagement && !branchId }
  );
  const customers = result?.data ?? [];
  const total = result?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [updateCustomer] = useUpdateCustomerMutation();

  const handleToggle = async (customer) => {
    setToggleError(null);
    setTogglingId(customer.id);
    try {
      await updateCustomer({
        id: customer.id,
        has_whatsapp: !customer.has_whatsapp,
        // management must tell the server which branch scope to update in
        ...(isManagement ? { branchId } : {}),
      }).unwrap();
    } catch (err) {
      setToggleError(err?.data?.error?.message || 'Failed to update customer');
    } finally {
      setTogglingId(null);
    }
  };

  const openEdit = (customer) => {
    setEditError(null);
    setEditForm({ phone: customer.phone || '', address: customer.address || '' });
    setEditCustomer(customer);
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    if (!editCustomer) return;
    const phone = editForm.phone.trim();
    const address = editForm.address.trim();
    if (phone && !/^[0-9+\-() ]{6,20}$/.test(phone)) {
      setEditError('Enter a valid phone number (digits, 6–20 characters).');
      return;
    }
    setEditError(null);
    setEditSaving(true);
    try {
      await updateCustomer({
        id: editCustomer.id,
        phone,
        address,
        ...(isManagement ? { branchId } : {}),
      }).unwrap();
      setEditCustomer(null);
    } catch (err) {
      setEditError(err?.data?.error?.message || 'Failed to save contact details');
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="pt-4 pb-32 md:pb-10"
    >
      {/* ── Header ── */}
      <div className="px-6 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald/10 flex items-center justify-center shrink-0">
            <MessageCircle size={20} className="text-emerald" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-navy tracking-tight">Customers</h2>
            <p className="text-xs font-medium text-navy/40 mt-0.5">
              WhatsApp notification opt-in per customer
            </p>
          </div>
        </div>
      </div>

      {/* ── Global messaging OFF banner ── */}
      {!messagingEnabled && (
        <div className="px-6 mb-4">
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">
              <span className="font-bold">WhatsApp messaging is currently switched off company-wide.</span>{' '}
              Opt-ins you set here are saved, but no messages go out until management
              enables messaging in the Control Center.
            </p>
          </div>
        </div>
      )}

      {/* ── Branch picker (management only) ── */}
      {isManagement && (
        <div className="px-6 mb-4">
          <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1 mb-1.5 block">
            Branch
          </label>
          <div className="relative">
            <Building2 size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
            <select
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setPage(1); }}
              className={`${INPUT_BASE} pl-11 appearance-none`}
            >
              <option value="">Select a branch…</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── Search ── */}
      <div className="px-6 mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone or customer code…"
            className={`${INPUT_BASE} pl-11`}
          />
          {isFetching && (
            <Loader2 size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo animate-spin" />
          )}
        </div>
      </div>

      {/* ── Toggle error ── */}
      {toggleError && (
        <div className="px-6 mb-3">
          <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
            {toggleError}
          </p>
        </div>
      )}

      {/* ── List ── */}
      <div className="px-6">
        {isManagement && !branchId ? (
          <EmptyState
            icon={Building2}
            title="Pick a branch"
            message="Select a branch above to manage its customers."
          />
        ) : isLoading ? (
          <LoadingSpinner size="lg" />
        ) : customers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No customers found' : 'No customers yet'}
            message={search
              ? `Nothing matched “${search}”. Try a name, phone number or customer code.`
              : 'Customers appear here once they are enrolled in a scheme.'}
          />
        ) : (
          <div className="space-y-2">
            {customers.map((c) => {
              const hasPhone = Boolean(c.phone);
              const saving = togglingId === c.id;
              return (
                <div
                  key={c.id}
                  className="bg-white rounded-2xl p-4 card-shadow border border-border flex items-center gap-3"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    c.has_whatsapp ? 'bg-emerald/10 text-emerald' : 'bg-navy/5 text-navy/30'
                  }`}>
                    <MessageCircle size={17} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-navy truncate">{c.name}</p>
                      <span className="text-[9px] font-bold text-indigo bg-indigo/8 px-1.5 py-0.5 rounded-md uppercase tracking-wider shrink-0">
                        {c.customer_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {hasPhone ? (
                        <>
                          <Phone size={10} className="text-navy/30 shrink-0" />
                          <p className="text-[11px] font-medium text-navy/45 truncate">{c.phone}</p>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="flex items-center gap-1.5 text-left tactile-press"
                        >
                          <PhoneOff size={10} className="text-amber-500 shrink-0" />
                          <span className="text-[11px] font-semibold text-amber-600 underline decoration-amber-300 underline-offset-2">
                            No phone — add one to enable WhatsApp
                          </span>
                        </button>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEdit(c)}
                    aria-label={`Edit contact details for ${c.name}`}
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-navy/30 hover:text-navy/60 hover:bg-navy/5 transition-all duration-200 tactile-press shrink-0"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggle(c)}
                    disabled={saving || !hasPhone}
                    aria-label={c.has_whatsapp
                      ? `Disable WhatsApp messages for ${c.name}`
                      : `Enable WhatsApp messages for ${c.name}`}
                    className="shrink-0 tactile-press disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {saving
                      ? <Loader2 size={32} className="animate-spin text-navy/30" />
                      : c.has_whatsapp
                        ? <ToggleRight size={32} className="text-emerald" />
                        : <ToggleLeft size={32} className="text-navy/25" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ── */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-5">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isFetching}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white border border-border text-xs font-bold text-navy disabled:opacity-40 tactile-press"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <p className="text-[11px] font-bold text-navy/40">
              Page {page} of {totalPages} · {total} customers
            </p>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || isFetching}
              className="flex items-center gap-1 px-4 py-2 rounded-xl bg-white border border-border text-xs font-bold text-navy disabled:opacity-40 tactile-press"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ── Contact details modal ── */}
      <GlassModal
        isOpen={Boolean(editCustomer)}
        onClose={() => !editSaving && setEditCustomer(null)}
        title={editCustomer ? `Edit ${editCustomer.name}` : ''}
      >
        <form onSubmit={handleEditSave} className="space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="customer-phone" className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1 block">
              Phone Number
            </label>
            <div className="relative">
              <Phone size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 pointer-events-none" />
              <input
                id="customer-phone"
                type="tel"
                inputMode="tel"
                maxLength={20}
                value={editForm.phone}
                onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="e.g. 9876543210"
                className={`${INPUT_BASE} pl-11`}
                autoFocus
              />
            </div>
            <p className="text-[10px] text-navy/35 ml-1">
              Needed for WhatsApp messages — the opt-in toggle unlocks once a phone is saved.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="customer-address" className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1 block">
              Address
            </label>
            <div className="relative">
              <MapPin size={15} className="absolute left-4 top-[18px] text-navy/30 pointer-events-none" />
              <textarea
                id="customer-address"
                rows={2}
                maxLength={500}
                value={editForm.address}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street, area, town…"
                className={`${INPUT_BASE} pl-11 resize-none`}
              />
            </div>
          </div>

          {editError && (
            <p className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {editError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditCustomer(null)}
              disabled={editSaving}
              className="px-5 py-2.5 text-sm"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={editSaving} className="px-5 py-2.5 text-sm">
              {editSaving ? <Loader2 size={15} className="animate-spin" /> : 'Save'}
            </Button>
          </div>
        </form>
      </GlassModal>
    </motion.div>
  );
};
