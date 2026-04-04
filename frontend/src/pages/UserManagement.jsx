import React, { useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Building2,
  Mail,
  Key,
  Search,
  CheckCircle2,
  XCircle,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Loader2,
  LogOut
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { clearCredentials } from '../store/slices/authSlice';
import { apiSlice, useLogoutMutation } from '../store/api/apiSlice';
import { 
  useGetUsersQuery, 
  useCreateUserMutation, 
  useGetBranchesQuery 
} from '../store/api/apiSlice';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
import { selectCurrentUser } from '../store/slices/authSlice';

export const UserManagement = () => {
  const user = useSelector(selectCurrentUser);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 50;

  // API Hooks — server-side pagination + search
  const { data: usersResult = {}, isLoading: isUsersLoading } = useGetUsersQuery(
    {
      viewerId: user?.id,
      role: roleFilter || undefined,
      search: searchTerm || undefined,
      page: currentPage,
      limit: PAGE_SIZE,
    },
    { skip: !user?.id }
  );
  const users = usersResult.data ?? [];
  const pagination = {
    page: usersResult.page ?? 1,
    total: usersResult.total ?? 0,
    totalPages: usersResult.totalPages ?? 0,
  };
  // Separate unfiltered query used to populate the "Reports To" manager dropdown
  // Fetch up to 500 so we get all potential managers (MDs and Directors are few)
  const { data: allUsersResult = {} } = useGetUsersQuery(
    { viewerId: user?.id, limit: 500 },
    { skip: !user?.id }
  );
  const allUsers = allUsersResult.data ?? [];
  const { data: branches = [] } = useGetBranchesQuery();
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();

  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try {
      await logoutApi().unwrap();
    } catch { /* ignore */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'branch_admin',
    branchId: '',
    managerId: '',
    oversightBranchIds: [],
    hasSmartphone: true,
  });

  const [error, setError] = useState('');

  const isOversightRole = (role) => role === 'director' || role === 'gm';

  // Directors report to MD; GMs report to a Director
  const managerOptions = formData.role === 'director'
    ? allUsers.filter(u => u.role === 'md')
    : formData.role === 'gm'
      ? allUsers.filter(u => u.role === 'director')
      : [];

  const toggleOversightBranch = (branchId) => {
    setFormData((prev) => {
      const ids = prev.oversightBranchIds;
      return {
        ...prev,
        oversightBranchIds: ids.includes(branchId)
          ? ids.filter((id) => id !== branchId)
          : [...ids, branchId],
      };
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');

    const submissionData = { ...formData };

    if (isOversightRole(submissionData.role)) {
      // Set branchId to the first oversight branch so the user appears in oversight scope JOIN queries.
      // Without a non-null branch_id, the GM/Director is invisible to their own Director/MD.
      submissionData.branchId = submissionData.oversightBranchIds[0] || null;
    } else {
      delete submissionData.oversightBranchIds;
      if (!submissionData.branchId) delete submissionData.branchId;
    }

    if (!submissionData.managerId) delete submissionData.managerId;

    try {
      await createUser(submissionData).unwrap();
      setIsModalOpen(false);
      setFormData({
        name: '',
        email: '',
        password: '',
        role: user?.role === 'branch_admin' ? 'branch_manager' : 'branch_admin',
        branchId: '',
        managerId: '',
        oversightBranchIds: [],
        hasSmartphone: true,
      });
    } catch (err) {
      setError(err.data?.error?.message || 'Failed to create user');
    }
  };

  // Search and role filter are server-side — no client-side filtering needed

  // MD is excluded — only one MD may exist (enforced server-side), created via seed/CLI
  const allRoles = [
    { value: 'director', label: 'Director' },
    { value: 'gm', label: 'General Manager' },
    { value: 'branch_admin', label: 'Branch Admin' },
    { value: 'branch_manager', label: 'Branch Manager' },
    { value: 'abm', label: 'Assistant Branch Manager' },
    { value: 'sales_officer', label: 'Sales Officer' },
    { value: 'client', label: 'Client' },
  ];

  const creatableRoles = {
    md:           ['director', 'gm', 'branch_manager', 'abm', 'sales_officer', 'branch_admin', 'client'],
    gm:           ['branch_manager', 'abm', 'sales_officer', 'branch_admin', 'client'],
    branch_admin: ['branch_manager', 'abm', 'sales_officer', 'client'],
  };

  const roles = user?.role
    ? allRoles.filter((r) => (creatableRoles[user.role] ?? []).includes(r.value))
    : [];

  if (isUsersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto px-4 py-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-[24px] bg-white shadow-premium flex items-center justify-center text-indigo border border-navy/5">
            <Users size={32} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-[10px] font-bold text-navy/20 uppercase tracking-[0.3em] font-mono truncate">
                {user?.branchName || 'ORGANIZATION'}
              </p>
              <span className="text-navy/10 text-[8px]">•</span>
              <p className="text-[9px] font-bold text-indigo uppercase tracking-[0.15em] font-mono truncate">
                {user?.role?.replace(/_/g, ' ')}
              </p>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-navy tracking-tight">
              Personnel Directory
            </h1>
            <p className="text-navy/30 mt-1 font-bold uppercase tracking-widest text-[9px]">
               {user?.name} · Organization hierarchy
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3">
          {user?.role === 'md' && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="gradient-primary text-white shadow-xl shadow-indigo/20 px-8 py-4 rounded-2xl font-bold flex items-center gap-3 tactile-press hover:scale-[1.02] transition-transform"
            >
              <UserPlus size={20} />
              Add New Member
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-4 rounded-2xl bg-white text-navy/20 hover:text-red-500 hover:bg-red-50 transition-all duration-300 card-shadow border border-navy/5 tactile-press group"
            title="Logout Account"
          >
            <LogOut size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 items-center bg-white/50 backdrop-blur-md p-2 rounded-[32px] card-shadow border border-white/50">
        <div className="relative flex-1 w-full group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-navy/20 group-focus-within:text-indigo transition-colors" size={20} />
          <input
            type="text"
            placeholder="Search personnel by name or email…"
            className="w-full pl-16 pr-6 py-4 bg-transparent border-none rounded-2xl text-navy font-bold placeholder:text-navy/20 focus:outline-none focus:ring-0 text-base"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>

        <div className="w-[1px] h-8 bg-navy/5 hidden sm:block" />

        <select
          className="bg-transparent px-6 py-4 text-navy font-bold text-sm cursor-pointer outline-none min-w-[180px] w-full sm:w-auto appearance-none text-center"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">Filter by Role</option>
          {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Users List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {users.map((u) => (
          <Card
            key={u.id}
            className="group hover-lift border-white/50 bg-white/70 backdrop-blur-sm cursor-default p-0 overflow-hidden"
          >
            <div className="p-6 flex items-center justify-between gap-5">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-indigo/5 flex items-center justify-center text-indigo shrink-0 group-hover:scale-110 transition-transform duration-500">
                  <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm">
                    <img src={`https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=0B1C30&color=fff&size=40`} alt="" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-navy leading-none truncate group-hover:text-indigo transition-colors">{u.name}</h3>
                  <div className="flex flex-col gap-1 mt-2">
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-navy/30 uppercase tracking-widest">
                      <Mail size={12} className="text-indigo/40" />
                      <span className="truncate">{u.email}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-bold text-navy/30 uppercase tracking-widest">
                      <Building2 size={12} className="text-indigo/40" />
                      {u.branchName || 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                <div className="text-right flex flex-col items-end gap-2">
                   <StatusChip
                    status={u.role}
                    label={u.role.replace(/_/g, ' ')}
                  />
                  {u.hasSmartphone && (
                    <span className="text-[8px] font-bold text-emerald uppercase tracking-[0.2em] flex items-center gap-1 bg-emerald/5 px-2 py-0.5 rounded-full">
                      Mobile Ready
                    </span>
                  )}
                </div>
                <ChevronRight size={20} className="text-navy/10 group-hover:text-indigo group-hover:translate-x-1 transition-all duration-300" />
              </div>
            </div>
          </Card>
        ))}

        {users.length === 0 && (
          <div className="py-20 text-center space-y-4 col-span-full">
            <div className="w-20 h-20 bg-navy/[0.02] rounded-full flex items-center justify-center mx-auto text-navy/10">
              <Users size={40} />
            </div>
            <p className="text-navy/30 font-bold uppercase tracking-widest text-sm">No users found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <button
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white card-shadow text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono"
          >
            <ChevronLeft size={14} /> PREV
          </button>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest font-mono">
            {pagination.page} / {pagination.totalPages} · {pagination.total} TOTAL
          </p>
          <button
            disabled={currentPage >= pagination.totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white card-shadow text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all font-mono"
          >
            NEXT <ArrowRight size={14} />
          </button>
        </div>
      )}

      {/* Create User Modal */}
      <GlassModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        title="Create New User Account"
      >
        <form onSubmit={handleCreateUser} className="space-y-6 pt-4">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-x-2 animate-in slide-in-from-top-2">
              <XCircle size={18} />
              {error}
            </div>
          )}

          <div className="grid gap-4 select-none">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Full Name</label>
              <div className="relative">
                <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
                <input 
                  required
                  type="text"
                  placeholder="Enter full name..."
                  className="w-full pl-12 pr-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 transition-all font-bold"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
                <input 
                  required
                  type="email"
                  placeholder="name@company.com"
                  className="w-full pl-12 pr-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 transition-all font-bold"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Role</label>
                <select
                  className="w-full px-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 transition-all cursor-pointer"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value, branchId: '', managerId: '', oversightBranchIds: [] })}
                >
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Director / GM: pick their direct manager */}
              {isOversightRole(formData.role) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                    Reports To <span className="text-red-400">*</span>
                  </label>
                  <select
                    required
                    className="w-full px-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 transition-all cursor-pointer"
                    value={formData.managerId}
                    onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  >
                    <option value="">Select Manager...</option>
                    {managerOptions.map((m) => (
                      <option key={m.id} value={m.id}>{m.name} ({m.role})</option>
                    ))}
                  </select>
                  {managerOptions.length === 0 && (
                    <p className="text-[10px] text-amber-500 font-bold ml-1">
                      No {formData.role === 'gm' ? 'directors' : 'MD'} found — create one first
                    </p>
                  )}
                </div>
              )}

              {/* Director / GM: pick multiple oversight branches */}
              {isOversightRole(formData.role) && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                    Oversight Branches <span className="text-red-400">*</span>
                  </label>
                  <div className="max-h-40 overflow-y-auto rounded-xl bg-navy/[0.03] p-3 space-y-2">
                    {branches.map((b) => (
                      <label key={b.id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-indigo cursor-pointer"
                          checked={formData.oversightBranchIds.includes(b.id)}
                          onChange={() => toggleOversightBranch(b.id)}
                        />
                        <span className="text-sm font-bold text-navy group-hover:text-indigo transition-colors">{b.name}</span>
                      </label>
                    ))}
                    {branches.length === 0 && (
                      <p className="text-xs text-navy/30 text-center py-2">No branches available</p>
                    )}
                  </div>
                  {formData.oversightBranchIds.length === 0 && (
                    <p className="text-[10px] text-amber-500 font-bold ml-1">Select at least one branch</p>
                  )}
                </div>
              )}

              {/* All other non-branch_admin roles: single branch dropdown */}
              {!isOversightRole(formData.role) && user?.role !== 'branch_admin' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Branch Assignment</label>
                  <select
                    required
                    className="w-full px-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy font-bold focus:ring-2 focus:ring-indigo/20 transition-all cursor-pointer"
                    value={formData.branchId}
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  >
                    <option value="">Select Branch...</option>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">Access Password</label>
                <div className="relative">
                  <Key className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
                  <input 
                    required
                    type="password"
                    placeholder="Set password..."
                    className="w-full pl-12 pr-4 py-3.5 bg-navy/[0.03] border-none rounded-xl text-navy placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 transition-all font-bold"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                  />
                </div>
              </div>

              <div 
                className="space-y-1.5 flex flex-col justify-center bg-navy/[0.03] rounded-xl px-4 mt-5 cursor-pointer select-none transition-colors hover:bg-navy/[0.05]" 
                onClick={() => setFormData({...formData, hasSmartphone: !formData.hasSmartphone})}
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-navy">Mobile App Access</span>
                    <span className="text-[9px] font-bold text-navy/40 uppercase tracking-widest">Has Smartphone</span>
                  </div>
                  <div className={`w-10 h-6 rounded-full flex items-center px-1 transition-colors ${formData.hasSmartphone ? 'bg-indigo' : 'bg-navy/20'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white transition-transform ${formData.hasSmartphone ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              type="button" 
              variant="outline" 
              className="flex-1 border-navy/5 text-navy/40 hover:bg-navy/5"
              onClick={() => setIsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-indigo text-white shadow-lg shadow-indigo/20"
              disabled={isCreating || (isOversightRole(formData.role) && formData.oversightBranchIds.length === 0)}
            >
              {isCreating ? (
                <>
                  <Loader2 className="animate-spin mr-2" size={18} />
                  Saving...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2" size={18} />
                  Create Account
                </>
              )}
            </Button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
};
