import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Banknote, ChevronDown, ChevronLeft, ChevronRight,
  Loader2, CheckCircle2, User, Users, AlertTriangle,
} from 'lucide-react';
import { selectCurrentUser } from '../store/slices/authSlice';
import {
  useGetCurrentSalaryQuery,
  useGetSalaryHistoryQuery,
  useSetSalaryMutation,
  useSetSalaryByRoleMutation,
  useGetUsersQuery,
} from '../store/api/apiSlice';
import { getCurrentPeriod, getPrevPeriod, getNextPeriod } from '../lib/schemePeriod';
import { ROLES, ROLE_LABELS } from '../lib/constants';

// Only management can set or update salaries
const WRITER_ROLES = ['management'];

const fmt = (n) =>
  `₹${(Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// All roles that can receive a salary — every role except client
const BULK_ELIGIBLE_ROLES = Object.values(ROLES).filter(r => r !== ROLES.CLIENT);

// ─── Period picker ────────────────────────────────────────────────────────────
// Replaces the free date input; effective date always snaps to period's 7th.
const PeriodPicker = ({ period, onChange }) => (
  <div className="flex items-center gap-2 w-full px-4 py-3 rounded-2xl border border-navy/10 bg-white">
    <button
      type="button"
      onClick={() => onChange(getPrevPeriod(period.periodMonth, period.periodYear))}
      className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press flex-shrink-0"
      aria-label="Previous period"
    >
      <ChevronLeft size={14} aria-hidden="true" />
    </button>
    <span className="flex-1 text-center text-sm font-semibold text-navy">{period.label}</span>
    <button
      type="button"
      onClick={() => onChange(getNextPeriod(period.periodMonth, period.periodYear))}
      className="w-7 h-7 rounded-lg bg-navy/5 flex items-center justify-center text-navy/40 tactile-press flex-shrink-0"
      aria-label="Next period"
    >
      <ChevronRight size={14} aria-hidden="true" />
    </button>
  </div>
);

// ─── Own salary view (non-writers) ────────────────────────────────────────────
const OwnSalaryView = () => {
  const { data: salary, isLoading } = useGetCurrentSalaryQuery(undefined);

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-indigo" size={28} />
      </div>
    );
  }

  if (!salary) {
    return (
      <div className="bg-white p-8 rounded-2xl card-shadow border border-navy/5 text-center">
        <Banknote size={32} className="text-navy/20 mx-auto mb-2" />
        <p className="text-sm font-medium text-navy/40">No salary assigned yet</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-indigo to-indigo/80 p-6 rounded-[32px] card-shadow relative overflow-hidden">
      <div className="absolute -right-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
      <div className="relative z-10">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-widest mb-1">Your Salary</p>
        <p className="text-4xl font-bold text-white mb-4">
          {fmt(salary.base_salary)}<span className="text-lg font-medium text-white/60">/mo</span>
        </p>
        <div className="flex gap-4 text-xs text-white/70">
          <span>From {fmtDate(salary.effective_from)}</span>
          {salary.set_by_name && <span>Set by {salary.set_by_name}</span>}
        </div>
      </div>
    </div>
  );
};

// ─── Salary history table ─────────────────────────────────────────────────────
const SalaryHistory = ({ userId }) => {
  const { data, isLoading } = useGetSalaryHistoryQuery({ userId, limit: 20 }, { skip: !userId });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="animate-spin text-indigo" size={22} />
      </div>
    );
  }

  const rows = data?.data ?? [];
  if (rows.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-semibold text-navy/40 uppercase tracking-widest mb-3">Salary History</p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="bg-white p-4 rounded-2xl border border-navy/5 card-shadow flex justify-between items-center">
            <div>
              <p className="text-sm font-bold text-navy">
                {fmt(row.base_salary)}<span className="text-xs font-normal text-navy/40">/mo</span>
              </p>
              <p className="text-xs text-navy/40">
                {fmtDate(row.effective_from)} → {row.effective_to ? fmtDate(row.effective_to) : 'Current'}
              </p>
            </div>
            <p className="text-xs text-navy/30">{row.set_by_name}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Individual set-salary form ───────────────────────────────────────────────
const SetSalaryForm = ({ selectedUser, onSuccess }) => {
  const [salary, setSalary] = useState('');
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [notes, setNotes]   = useState('');
  const [done, setDone]     = useState(false);
  const [setSalaryMutation, { isLoading, error }] = useSetSalaryMutation();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser || !salary) return;
    try {
      await setSalaryMutation({
        userId:        selectedUser.id,
        baseSalary:    parseFloat(salary),
        effectiveFrom: period.startDate, // snapped to 7th of chosen period
        notes:         notes || undefined,
      }).unwrap();
      setDone(true);
      setSalary('');
      setNotes('');
      onSuccess?.();
      setTimeout(() => setDone(false), 3000);
    } catch (_) {}
  };

  if (!selectedUser) {
    return (
      <div className="bg-white p-6 rounded-2xl border border-navy/5 card-shadow text-center text-sm text-navy/40">
        Select an employee above to set their salary
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-navy/5 card-shadow space-y-4">
      <p className="text-sm font-semibold text-navy">
        Set salary for <span className="text-indigo">{selectedUser.name}</span>
      </p>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Monthly Base Salary (₹)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          placeholder="e.g. 25000"
          className="w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Effective From (Period)</label>
        <PeriodPicker period={period} onChange={setPeriod} />
        <p className="text-[10px] text-navy/30 mt-1 pl-1">Salary starts on {period.startDate}</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Reason for change..."
          className="w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo resize-none"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500">{error?.data?.error?.message || 'Failed to save salary'}</p>
      )}

      <button
        type="submit"
        disabled={isLoading || done}
        className={`w-full py-3 rounded-2xl text-sm font-bold tactile-press transition-colors ${
          done ? 'bg-emerald-500 text-white' : 'bg-indigo text-white disabled:opacity-50'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} />Saving…</span>
        ) : done ? (
          <span className="flex items-center justify-center gap-2"><CheckCircle2 size={16} />Saved</span>
        ) : (
          'Save Salary'
        )}
      </button>
    </form>
  );
};

// ─── Set salary by role form ──────────────────────────────────────────────────
const SetSalaryByRoleForm = () => {
  const [role, setRole]     = useState('');
  const [salary, setSalary] = useState('');
  const [period, setPeriod] = useState(getCurrentPeriod);
  const [notes, setNotes]   = useState('');
  const [done, setDone]     = useState(false);
  const [result, setResult] = useState(null); // { updatedCount }
  const [setSalaryByRole, { isLoading, error }] = useSetSalaryByRoleMutation();

  const selectedLabel = role ? (ROLE_LABELS[role] ?? role) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!role || !salary) return;
    try {
      const res = await setSalaryByRole({
        role,
        baseSalary:    parseFloat(salary),
        effectiveFrom: period.startDate, // snapped to 7th of chosen period
        notes:         notes || undefined,
      }).unwrap();
      setResult(res);
      setDone(true);
      setSalary('');
      setNotes('');
      setRole('');
      setTimeout(() => { setDone(false); setResult(null); }, 5000);
    } catch (_) {}
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl border border-navy/5 card-shadow space-y-4">
      <p className="text-sm font-semibold text-navy">Set a common salary for all employees of a role</p>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Role</label>
        <div className="relative">
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo bg-white"
            required
          >
            <option value="">— Choose a role —</option>
            {BULK_ELIGIBLE_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
            ))}
          </select>
          <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Monthly Base Salary (₹)</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={salary}
          onChange={(e) => setSalary(e.target.value)}
          placeholder="e.g. 25000"
          className="w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo"
          required
        />
      </div>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Effective From (Period)</label>
        <PeriodPicker period={period} onChange={setPeriod} />
        <p className="text-[10px] text-navy/30 mt-1 pl-1">Salary starts on {period.startDate}</p>
      </div>

      <div>
        <label className="block text-xs font-semibold text-navy/50 mb-1.5">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Reason for change..."
          className="w-full px-4 py-3 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo resize-none"
        />
      </div>

      {/* Warning — only shown once role + amount are both set */}
      {selectedLabel && salary && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertTriangle size={14} className="text-amber-600 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <p className="text-xs font-medium text-amber-700 leading-relaxed">
            This will set <b>{fmt(salary)}/mo</b> for every active <b>{selectedLabel}</b> across all branches starting <b>{period.label}</b>. Their current salary will be closed.
          </p>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500">{error?.data?.error?.message || 'Failed to apply salary'}</p>
      )}

      <button
        type="submit"
        disabled={isLoading || done}
        className={`w-full py-3 rounded-2xl text-sm font-bold tactile-press transition-colors ${
          done ? 'bg-emerald-500 text-white' : 'bg-indigo text-white disabled:opacity-50'
        }`}
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2"><Loader2 className="animate-spin" size={16} />Applying…</span>
        ) : done ? (
          <span className="flex items-center justify-center gap-2">
            <CheckCircle2 size={16} />Updated {result?.updatedCount ?? 0} employee{result?.updatedCount !== 1 ? 's' : ''}
          </span>
        ) : (
          'Apply to All'
        )}
      </button>
    </form>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────
export const SalaryManagementPage = () => {
  const navigate  = useNavigate();
  const user      = useSelector(selectCurrentUser);
  const isWriter  = WRITER_ROLES.includes(user?.role);
  // OA reaches this page from Home (no Money tab), so send them back there.
  const backTo    = user?.role === 'oa' ? '/' : '/money';

  const [mode, setMode]                 = useState('individual'); // 'individual' | 'by_role'
  const [selectedUser, setSelectedUser] = useState(null);
  const [historyKey, setHistoryKey]     = useState(0);

  // Fetch employees list for the individual picker (writers only)
  const { data: usersData } = useGetUsersQuery({ page: 1, limit: 200 }, { skip: !isWriter });
  const employees = usersData?.data ?? [];

  const { data: selectedSalary, isLoading: selLoading } = useGetCurrentSalaryQuery(
    selectedUser?.id,
    { skip: !selectedUser }
  );

  return (
    <div className="relative">
      <motion.div
        key="salary_mgmt"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className="flex-1 pb-10 pt-4"
      >
        {/* Header */}
        <div className="px-6 mb-8 flex items-center gap-3">
          <button
            onClick={() => navigate(backTo)}
            className="w-10 h-10 rounded-2xl bg-navy/5 flex items-center justify-center text-navy tactile-press"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-3xl font-bold text-navy tracking-tight">Salary</h2>
            <p className="text-xs font-medium text-navy/40 mt-0.5">
              {isWriter ? 'Assign & manage employee salaries' : 'Your current salary'}
            </p>
          </div>
        </div>

        <div className="px-6 space-y-5">
          {isWriter ? (
            <>
              {/* Mode switch: Individual vs By Role */}
              <div className="flex gap-1.5 bg-navy/5 p-1.5 rounded-2xl">
                <button
                  type="button"
                  onClick={() => setMode('individual')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold tactile-press transition-all ${
                    mode === 'individual' ? 'bg-white text-navy card-shadow' : 'text-navy/50'
                  }`}
                >
                  <User size={14} aria-hidden="true" />
                  Individual
                </button>
                <button
                  type="button"
                  onClick={() => setMode('by_role')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-bold tactile-press transition-all ${
                    mode === 'by_role' ? 'bg-white text-navy card-shadow' : 'text-navy/50'
                  }`}
                >
                  <Users size={14} aria-hidden="true" />
                  By Role
                </button>
              </div>

              {mode === 'individual' ? (
                <>
                  {/* Employee picker */}
                  <div>
                    <label className="block text-xs font-semibold text-navy/40 uppercase tracking-widest mb-2">
                      Select Employee
                    </label>
                    <div className="relative">
                      <select
                        value={selectedUser?.id || ''}
                        onChange={(e) => {
                          const emp = employees.find(u => u.id === e.target.value) || null;
                          setSelectedUser(emp);
                          setHistoryKey(k => k + 1);
                        }}
                        className="w-full appearance-none px-4 py-3 pr-10 rounded-2xl border border-navy/10 text-navy text-sm font-medium focus:outline-none focus:border-indigo bg-white"
                      >
                        <option value="">— Choose an employee —</option>
                        {employees.map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.role?.replace(/_/g, ' ')})
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-navy/40 pointer-events-none" />
                    </div>
                  </div>

                  {/* Current salary of selected employee */}
                  {selectedUser && (
                    <div>
                      <p className="text-xs font-semibold text-navy/40 uppercase tracking-widest mb-2">
                        Current Salary
                      </p>
                      {selLoading ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="animate-spin text-indigo" size={22} />
                        </div>
                      ) : selectedSalary ? (
                        <div className="bg-indigo/5 p-4 rounded-2xl border border-indigo/10">
                          <p className="text-2xl font-bold text-indigo">
                            {fmt(selectedSalary.base_salary)}
                            <span className="text-sm font-normal text-navy/40">/mo</span>
                          </p>
                          <p className="text-xs text-navy/40 mt-1">
                            Since {fmtDate(selectedSalary.effective_from)}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-white p-4 rounded-2xl border border-navy/5 text-sm text-navy/40 text-center">
                          No salary set yet
                        </div>
                      )}
                    </div>
                  )}

                  <SetSalaryForm
                    selectedUser={selectedUser}
                    onSuccess={() => setHistoryKey(k => k + 1)}
                  />
                  {selectedUser && <SalaryHistory key={historyKey} userId={selectedUser.id} />}
                </>
              ) : (
                <SetSalaryByRoleForm />
              )}
            </>
          ) : (
            <>
              <OwnSalaryView />
              <SalaryHistory userId={user?.id} />
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default SalaryManagementPage;
