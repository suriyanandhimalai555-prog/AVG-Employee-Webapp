import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Save, Loader2, AlertCircle } from 'lucide-react';
import { selectCurrentUser } from '../../store/slices/authSlice';
import { useCreateChitGroupMutation } from '../../store/api/apiSlice';
import { BranchPicker } from '../../components/BranchPicker';
import { SCHEME_INPUT_CLASS, createFormSetter, getTodayISO } from '../../lib/schemeConstants';
import { SchemePageWrapper } from './components/SchemePageWrapper';
import { SchemePageHeader } from './components/SchemePageHeader';
import { FormField } from './components/FormField';
import { FormError } from './components/FormError';

const PACKAGE_OPTIONS = [
  { value: 1, label: 'Package 1 — ₹5,000 / ₹2,500' },
  { value: 2, label: 'Package 2 — ₹10,000 / ₹5,000' },
  { value: 3, label: 'Package 3 — ₹15,000 / ₹7,500' },
  { value: 4, label: 'Package 4 — ₹20,000 / ₹10,000' },
  { value: 5, label: 'Package 5 — ₹25,000 / ₹12,500' },
];

export const ChitAddGroupPage = () => {
  const user     = useSelector(selectCurrentUser);
  const navigate = useNavigate();
  const [createGroup, { isLoading }] = useCreateChitGroupMutation();

  const isManagement = user?.role === 'management';
  const [branchId, setBranchId] = useState('');

  const [form, setForm] = useState({
    groupName:     '',
    packageNumber: 1,
    startDate:     getTodayISO(),
    notes:         '',
  });
  const [error, setError] = useState(null);

  const set = createFormSetter(setForm);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!form.groupName.trim()) { setError('Group name is required.'); return; }
    if (isManagement && !branchId) { setError('Please select a branch.'); return; }
    try {
      const res = await createGroup({
        groupName:     form.groupName.trim(),
        packageNumber: parseInt(form.packageNumber, 10),
        startDate:     form.startDate,
        notes:         form.notes.trim() || undefined,
        branchId:      isManagement ? branchId : undefined,
      }).unwrap();
      navigate(`/money/schemes/agila-chit/${res.id}`);
    } catch (err) {
      setError(err?.data?.error?.message || 'Failed to create group.');
    }
  };

  if (user?.role !== 'branch_admin' && !isManagement) {
    return (
      <div className="flex flex-col items-center justify-center p-12 pt-24">
        <AlertCircle size={32} className="text-red-400 mb-3" aria-hidden="true" />
        <p className="text-sm font-bold text-navy">Access Denied</p>
        <p className="text-xs font-medium text-navy/40 mt-1">Only Branch Admin can create groups.</p>
      </div>
    );
  }

  const selectedPkg = PACKAGE_OPTIONS.find(p => p.value === parseInt(form.packageNumber, 10));

  return (
    <SchemePageWrapper>
      <SchemePageHeader
        backTo="/money/schemes/agila-chit"
        title="Create Chit Group"
        subtitle="New Agila Chit Fund group"
      />

      <form onSubmit={handleSubmit} className="px-4 space-y-5">

        {isManagement && (
          <FormField label="Branch" required>
            <BranchPicker value={branchId} onChange={setBranchId} />
          </FormField>
        )}

        <FormField label="Group Name" required>
          <input
            type="text"
            placeholder="e.g. Group A, VJC-001"
            value={form.groupName}
            onChange={set('groupName')}
            className={SCHEME_INPUT_CLASS}
          />
        </FormField>

        <FormField label="Package" required>
          <div className="relative">
            <select
              value={form.packageNumber}
              onChange={set('packageNumber')}
              className={`${SCHEME_INPUT_CLASS} appearance-none pr-10`}
            >
              {PACKAGE_OPTIONS.map(pkg => (
                <option key={pkg.value} value={pkg.value}>{pkg.label}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] font-medium text-navy/40 mt-1.5">
            Months 1–10 full amount · months 11–20 half amount
          </p>
        </FormField>

        {selectedPkg && (
          <div className="p-4 bg-violet-50 border border-violet-100 rounded-2xl space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-2">Package Summary</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Package</p>
                <p className="text-sm font-bold text-navy mt-0.5">#{form.packageNumber}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Full (M1–10)</p>
                <p className="text-sm font-bold text-violet-700 mt-0.5">
                  {['', '₹5,000', '₹10,000', '₹15,000', '₹20,000', '₹25,000'][parseInt(form.packageNumber, 10)]}
                </p>
              </div>
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest text-navy/30">Half (M11–20)</p>
                <p className="text-sm font-bold text-violet-500 mt-0.5">
                  {['', '₹2,500', '₹5,000', '₹7,500', '₹10,000', '₹12,500'][parseInt(form.packageNumber, 10)]}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-navy/40 pt-1 text-center">
              20 members · 20 months · winner selected on 21st each month
            </p>
          </div>
        )}

        <FormField label="Start Date" required>
          <input
            type="date"
            value={form.startDate}
            onChange={set('startDate')}
            className={SCHEME_INPUT_CLASS}
          />
        </FormField>

        <FormField label="Notes">
          <textarea
            rows={2}
            placeholder="Any notes about this group…"
            value={form.notes}
            onChange={set('notes')}
            className={`${SCHEME_INPUT_CLASS} resize-none`}
          />
        </FormField>

        <FormError error={error} />

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-4 bg-violet-600 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 tactile-press shadow-lg shadow-violet-200"
        >
          {isLoading
            ? <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            : <Save size={18} aria-hidden="true" />}
          Create Group
        </button>
      </form>
    </SchemePageWrapper>
  );
};

export default ChitAddGroupPage;
