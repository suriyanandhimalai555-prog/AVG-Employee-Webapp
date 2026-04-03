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
  Loader2
} from 'lucide-react';
import { 
  useGetUsersQuery, 
  useCreateUserMutation, 
  useGetBranchesQuery 
} from '../store/api/apiSlice';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
import { useSelector } from 'react-redux';
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
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-4xl font-bold text-navy tracking-tight flex items-center gap-3">
            <Users className="text-indigo" size={36} />
            User Directory
          </h1>
          <p className="text-navy/40 mt-1 font-medium tracking-wide uppercase text-xs">
            Manage organization staff, roles, and branch assignments
          </p>
        </div>

        <Button 
          onClick={() => setIsModalOpen(true)}
          className="bg-indigo text-white shadow-lg shadow-indigo/20 px-6"
        >
          <UserPlus size={18} className="mr-2" />
          Add New User
        </Button>
      </div>

      {/* Filters Bar */}
      <Card className="p-4 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/20" size={18} />
          <input 
            type="text"
            placeholder="Search by name or email..."
            className="w-full pl-12 pr-4 py-3 bg-navy/[0.02] border-none rounded-xl text-navy placeholder:text-navy/20 focus:ring-2 focus:ring-indigo/20 transition-all font-medium"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
          />
        </div>
        
        <select 
          className="px-4 py-3 bg-navy/[0.02] border-none rounded-xl text-navy font-bold text-sm focus:ring-2 focus:ring-indigo/20 transition-all cursor-pointer min-w-[160px]"
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setCurrentPage(1); }}
        >
          <option value="">All Roles</option>
          {roles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </Card>

      {/* Users List */}
      <div className="grid gap-4">
        {users.map((user) => (
          <Card 
            key={user.id}
            className="group hover:scale-[1.01] transition-all duration-300 border-none shadow-sm hover:shadow-xl hover:shadow-navy/5"
          >
            <div className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <div className="w-12 h-12 rounded-2xl bg-indigo/5 flex items-center justify-center text-indigo group-hover:bg-indigo group-hover:text-white transition-colors duration-300">
                  <Shield size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-navy leading-none">{user.name}</h3>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-navy/40 uppercase tracking-wider">
                      <Mail size={12} />
                      {user.email}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-navy/10" />
                    <span className="flex items-center gap-1 text-[11px] font-bold text-navy/40 uppercase tracking-wider">
                      <Building2 size={12} />
                      {user.branchName || 'Unassigned'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <StatusChip 
                  status={user.role} 
                  label={user.role.replace(/_/g, ' ')}
                  className="bg-navy/[0.02] border-none"
                />
                <ChevronRight size={20} className="text-navy/10 group-hover:text-navy/30 group-hover:translate-x-1 transition-all" />
              </div>
            </div>
          </Card>
        ))}
        
        {users.length === 0 && (
          <div className="py-20 text-center space-y-4">
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
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white card-shadow text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={14} /> Previous
          </button>
          <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest">
            {pagination.page} / {pagination.totalPages} · {pagination.total} total
          </p>
          <button
            disabled={currentPage >= pagination.totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-white card-shadow text-xs font-bold text-navy/40 hover:text-navy disabled:opacity-30 transition-all"
          >
            Next <ArrowRight size={14} />
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
