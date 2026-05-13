import { useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Save, Loader2, AlertCircle, ChevronDown
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useAddGoldMemberMutation,
  useGetGoldEmployeesQuery,
} from '../store/api/apiSlice';
import { CustomerPicker } from '../components/CustomerPicker';
import { PeriodDateInput } from '../components/PeriodDateInput';

const Field = ({ label, required, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold uppercase tracking-widest text-navy/40">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
    {children}
  </div>
);

const inputClass = "w-full px-4 py-3 bg-white rounded-2xl border border-navy/10 text-sm font-medium text-navy outline-none focus:ring-2 ring-indigo/20 placeholder:text-navy/30";

export const GoldSchemeAddPage = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();

  const { data: employees = [] } = useGetGoldEmployeesQuery();
  const [addMember, { isLoading }] = useAddGoldMemberMutation();

  const today = new Date().toISOString().split('T')[0];

  const [customer, setCustomer] = useState(null);
  const [form, setForm] = useState({
    chitNumber:       '',
    referrerId:       '',
    monthlyAmount:    '',
    startDate:        today,
    totalMonths:      12,
    firstPaymentMode: 'cash',
    notes:            '',
  });
  const [error, setError] = useState(null);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!customer) { setError('Please select or create a customer.'); return; }
    if (!form.chitNumber || !form.monthlyAmount || !form.startDate) {
      setError('Chit number, monthly amount, and start date are required.');
      return;
    }

    try {
      await addMember({
        chitNumber:       form.chitNumber.trim(),
        customerId:       customer.id,
        referrerId:       form.referrerId || undefined,
        monthlyAmount:    parseFloat(form.monthlyAmount),
        startDate:        form.startDate,
        totalMonths:      parseInt(form.totalMonths, 10),
        firstPaymentMode: form.firstPaymentMode,
        notes:            form.notes.trim() || undefined,
      }).unwrap();

      navigate('/money/schemes/gold');
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to save member.');
    }
  };

  if (user?.role !== 'branch_admin') {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" />
        <p className="text-sm font-bold text-navy">Access Denied</p>
        <p className="text-xs font-medium text-navy/40 mt-1">Only Branch Admin can add members.</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="pb-32 pt-4"
    >
      {/* Header */}
      <div className="px-4 flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/money/schemes/gold')}
          className="p-3 bg-white rounded-full shadow-md text-navy hover:bg-navy/5 tactile-press"
        >
          <ArrowRight className="rotate-180" size={20} />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-navy tracking-tight">Add Member</h2>
          <p className="text-[11px] font-medium text-navy/40 mt-0.5">New gold scheme enrollment</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 space-y-5">

        {/* Customer picker */}
        <Field label="Customer" required>
          <CustomerPicker
            value={customer}
            onChange={setCustomer}
            onClear={() => setCustomer(null)}
          />
        </Field>

        {/* Chit number + Start date side by side */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Chit / S.No" required>
            <input
              type="text"
              placeholder="e.g. 4025"
              value={form.chitNumber}
              onChange={set('chitNumber')}
              className={inputClass}
            />
          </Field>
          <Field label="Start Date" required>
            <PeriodDateInput
              value={form.startDate}
              onChange={set('startDate')}
              className={inputClass}
              required
            />
          </Field>
        </div>

        {/* Referrer */}
        <Field label="Referred By">
          <div className="relative">
            <select
              value={form.referrerId}
              onChange={set('referrerId')}
              className={`${inputClass} appearance-none pr-10`}
            >
              <option value="">— Select employee —</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} ({emp.role.replace(/_/g, ' ').toUpperCase()})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
          </div>
        </Field>

        {/* Monthly amount + Duration */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monthly Amount (₹)" required>
            <input
              type="number"
              placeholder="1000"
              min="1"
              value={form.monthlyAmount}
              onChange={set('monthlyAmount')}
              className={inputClass}
            />
          </Field>
          <Field label="Duration (months)" required>
            <input
              type="number"
              min="1"
              max="60"
              value={form.totalMonths}
              onChange={set('totalMonths')}
              className={inputClass}
            />
          </Field>
        </div>

        {/* Total value preview */}
        {form.monthlyAmount && form.totalMonths && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between">
            <p className="text-xs font-bold text-amber-700">Total scheme value</p>
            <p className="text-lg font-bold text-amber-700">
              ₹{(parseFloat(form.monthlyAmount || 0) * parseInt(form.totalMonths || 12)).toLocaleString()}
            </p>
          </div>
        )}

        {/* Month 1 payment mode */}
        <Field label="Month 1 Payment Mode" required>
          <div className="grid grid-cols-3 gap-2">
            {[['cash','Cash'],['gpay','GPay'],['bank_receipt','Bank']].map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setForm(f => ({ ...f, firstPaymentMode: val }))}
                className={`py-3 rounded-2xl text-xs font-bold border transition-all ${
                  form.firstPaymentMode === val
                    ? 'bg-indigo text-white border-indigo shadow-md shadow-indigo/20'
                    : 'bg-white text-navy/50 border-navy/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-medium text-navy/30 mt-1.5">Month 1 will be recorded automatically when you save.</p>
        </Field>

        {/* Notes */}
        <Field label="Notes">
          <textarea
            rows={2}
            placeholder="Any additional notes…"
            value={form.notes}
            onChange={set('notes')}
            className={`${inputClass} resize-none`}
          />
        </Field>

        {/* Error */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-indigo text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-indigo/20"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          Save Member
        </button>
      </form>
    </motion.div>
  );
};

export default GoldSchemeAddPage;
