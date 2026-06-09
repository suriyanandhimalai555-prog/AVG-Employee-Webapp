// Sell one or more LSS slots to a customer.
//
//   FULL  → buy all 20 slots in a fresh room (one owner)
//   SINGLE → buy 1..19 slots in the current filling room
//
// Per-slot price = plan.price. Total = quantity × per-slot.
// Referral commission (20%) is calculated on the total and credited to the
// referrer in one transaction via IncentiveService.distributeIncentives.

import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Save, Loader2, AlertCircle, Layers } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import {
  useGetLssPlansQuery,
  useAddLssSlotMutation,
  useGetGoldEmployeesQuery,
} from '../../store/api/apiSlice';
import { CustomerPicker } from '../../components/CustomerPicker';
import { BranchPicker } from '../../components/BranchPicker';
import { formatCurrency } from '../../lib/formatters';
import { SCHEME_INPUT_CLASS, createFormSetter } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';
import { PaymentModeSelect } from './components/PaymentModeSelect';
import { SuccessConfirmation } from './components/SuccessConfirmation';

const SLOTS_PER_ROOM  = 20;
const WRITER_ROLES    = new Set(['branch_admin', 'management', 'md', 'director']);
const QUANTITY_CHIPS  = [1, 2, 4, 8];

export const LssAddSlotPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const canWrite     = WRITER_ROLES.has(user?.role);
  const isManagement = user?.role === 'management';

  const { data: plans = [], isLoading: plansLoading } = useGetLssPlansQuery();
  const { data: employees = [] }                      = useGetGoldEmployeesQuery();
  const [addSlot, { isLoading }] = useAddLssSlotMutation();

  const [branchId,  setBranchId]  = useState('');
  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    planId:      '',
    quantity:    1,
    isFullRoom:  false,
    paymentMode: 'cash',
    referrerId:  '',
    notes:       '',
  });
  const [error,  setError]  = useState(null);
  const [result, setResult] = useState(null);

  const set = createFormSetter(setForm);

  const selectedPlan = useMemo(
    () => plans.find(p => p.id === form.planId) || null,
    [plans, form.planId]
  );

  const effectiveQuantity = form.isFullRoom ? SLOTS_PER_ROOM : form.quantity;
  const perSlot     = selectedPlan?.price ?? 0;
  const totalAmount = perSlot * effectiveQuantity;
  const commission  = totalAmount * 0.20;

  const handleQuantityChip = (n) => {
    setForm(f => ({ ...f, quantity: n, isFullRoom: false }));
  };
  const handleFullToggle = () => {
    setForm(f => ({ ...f, isFullRoom: !f.isFullRoom, quantity: !f.isFullRoom ? SLOTS_PER_ROOM : 1 }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!customer)       { setError('Please select or create a customer.'); return; }
    if (!form.planId)    { setError('Please pick a plan.'); return; }
    if (effectiveQuantity < 1 || effectiveQuantity > SLOTS_PER_ROOM) {
      setError(`Quantity must be between 1 and ${SLOTS_PER_ROOM}.`); return;
    }
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    try {
      const res = await addSlot({
        planId:      form.planId,
        customerId:  customer.id,
        amountPaid:  perSlot,
        quantity:    effectiveQuantity,
        paymentMode: form.paymentMode,
        referrerId:  form.referrerId || undefined,
        notes:       form.notes.trim() || undefined,
        branchId:    isManagement ? branchId : undefined,
      }).unwrap();
      setResult(res);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to sell slot.');
    }
  };

  if (!canWrite) {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access Denied</p>
        <p className="text-xs font-medium text-navy/40 mt-1">Only Branch Admin / MD / Director can sell slots.</p>
      </div>
    );
  }

  if (result) {
    const slotsCount      = result.slots?.length || 0;
    const isFullRoom      = slotsCount === SLOTS_PER_ROOM;
    const refName         = employees.find(e => e.id === form.referrerId)?.name;
    const slotRangeLabel  = slotsCount === 1
      ? `Slot ${result.slots[0].slot_number}`
      : isFullRoom
        ? `Full room (all ${SLOTS_PER_ROOM} slots)`
        : `Slots ${result.slots[0].slot_number}-${result.slots[slotsCount - 1].slot_number}`;
    return (
      <SchemePageWrapper>
        <SuccessConfirmation
          title={isFullRoom ? 'Full Room Sold' : `${slotsCount} Slot${slotsCount > 1 ? 's' : ''} Sold`}
          subtitle={customer?.name}
          code={slotRangeLabel}
          onDone={() => navigate('/money/schemes/lss')}
        >
          <div className="w-full bg-violet-50 border border-violet-100 rounded-3xl p-4 space-y-2 text-left">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-navy/60">Total paid</span>
              <span className="text-sm font-bold text-violet-700">{formatCurrency(result.totalAmountPaid)}</span>
            </div>
            {result.commissionAmount > 0 && (
              <>
                <div className="flex items-center justify-between border-t border-violet-100 pt-2">
                  <span className="text-sm font-medium text-navy/60">Commission (20%)</span>
                  <span className="text-sm font-bold text-emerald-600">{formatCurrency(result.commissionAmount)}</span>
                </div>
                {refName && (
                  <p className="text-[10px] text-navy/30 pt-0.5">Credited to {refName} ✓</p>
                )}
              </>
            )}
          </div>
        </SuccessConfirmation>
      </SchemePageWrapper>
    );
  }

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/lss"
        title="Sell a slot"
        subtitle="One slot, multiple slots, or a full room"
      />

      <form onSubmit={handleSubmit} className="px-4 space-y-5">

        <FormField label="Customer" required>
          {isManagement && <BranchPicker value={branchId} onChange={setBranchId} />}
          <CustomerPicker value={customer} onChange={setCustomer} onClear={() => setCustomer(null)}
            branchId={isManagement ? branchId : undefined} />
        </FormField>

        <FormField label="Plan" required>
          <select
            value={form.planId}
            onChange={set('planId')}
            disabled={plansLoading}
            className={`${SCHEME_INPUT_CLASS} appearance-none pr-10`}
          >
            <option value="">— Select plan —</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatCurrency(p.price)} / slot
              </option>
            ))}
          </select>
          {selectedPlan && (
            <p className="text-[11px] text-navy/40 mt-1.5">
              Full room: {formatCurrency(selectedPlan.price * SLOTS_PER_ROOM)} · {SLOTS_PER_ROOM} slots
            </p>
          )}
        </FormField>

        <FormField label="Quantity" required>
          <button
            type="button"
            onClick={handleFullToggle}
            className={`w-full mb-2 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 tactile-press ${
              form.isFullRoom
                ? 'bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-md'
                : 'bg-navy/5 text-navy/60 border border-navy/10'
            }`}
          >
            <Layers size={16} aria-hidden="true" />
            {form.isFullRoom ? `FULL ROOM — ${SLOTS_PER_ROOM} slots` : `Buy FULL room (all ${SLOTS_PER_ROOM} slots)`}
          </button>

          {!form.isFullRoom && (
            <>
              <div className="flex gap-2 flex-wrap">
                {QUANTITY_CHIPS.map((n) => (
                  <button
                    type="button"
                    key={n}
                    onClick={() => handleQuantityChip(n)}
                    className={`px-4 py-2 rounded-full text-xs font-semibold tactile-press ${
                      form.quantity === n
                        ? 'bg-navy text-white'
                        : 'bg-white text-navy/60 border border-navy/10'
                    }`}
                  >
                    {n} slot{n > 1 ? 's' : ''}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={19}
                  value={form.quantity}
                  onChange={(e) => setForm(f => ({ ...f, quantity: Math.max(1, Math.min(19, parseInt(e.target.value, 10) || 1)) }))}
                  className="px-3 py-2 w-20 rounded-full bg-white border border-navy/10 text-xs font-semibold text-navy text-center outline-none focus:ring-2 ring-indigo/20"
                  aria-label="Custom quantity"
                />
              </div>
              <p className="text-[11px] text-navy/40 mt-1.5">
                Use 1–19 for SINGLE. Use the FULL toggle above to buy all {SLOTS_PER_ROOM}.
              </p>
            </>
          )}
        </FormField>

        {/* Live total */}
        {selectedPlan && (
          <div className="p-4 bg-violet-50 border border-violet-200 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-violet-700/80">Price per slot</p>
              <p className="text-sm font-bold text-violet-700">{formatCurrency(perSlot)}</p>
            </div>
            <div className="flex items-center justify-between border-t border-violet-200 pt-2">
              <p className="text-xs font-bold text-violet-700">Total ({effectiveQuantity} slot{effectiveQuantity > 1 ? 's' : ''})</p>
              <p className="text-lg font-bold text-fuchsia-800">{formatCurrency(totalAmount)}</p>
            </div>
            {form.referrerId && (
              <div className="flex items-center justify-between border-t border-violet-200 pt-2">
                <p className="text-[11px] text-emerald-700">Referrer commission (20%)</p>
                <p className="text-xs font-bold text-emerald-700">{formatCurrency(commission)}</p>
              </div>
            )}
          </div>
        )}

        <FormField label="Payment mode" required>
          <PaymentModeSelect
            value={form.paymentMode}
            onChange={(val) => setForm(f => ({ ...f, paymentMode: val }))}
            variant="buttons"
          />
        </FormField>

        <FormField label="Referred by (optional)">
          <select
            value={form.referrerId}
            onChange={set('referrerId')}
            className={`${SCHEME_INPUT_CLASS} appearance-none pr-10`}
          >
            <option value="">— No referrer (walk-in) —</option>
            {employees.map(emp => (
              <option key={emp.id} value={emp.id}>
                {emp.name} ({emp.role.replace(/_/g, ' ').toUpperCase()})
              </option>
            ))}
          </select>
        </FormField>

        <FormField label="Notes">
          <textarea
            rows={2}
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={set('notes')}
            className={`${SCHEME_INPUT_CLASS} resize-none`}
          />
        </FormField>

        <FormError error={error} />

        <button
          type="submit"
          disabled={isLoading || !selectedPlan}
          className="w-full py-4 bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-violet-500/30"
        >
          {isLoading
            ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            : <Save size={18} aria-hidden="true" />}
          {form.isFullRoom ? 'Sell FULL room' : `Sell ${effectiveQuantity} slot${effectiveQuantity > 1 ? 's' : ''}`}
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default LssAddSlotPage;
