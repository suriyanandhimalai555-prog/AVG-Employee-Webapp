import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Building2,
  Mail,
  Key,
  Search,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ArrowRight,
  Loader2,
  LogOut,
  FileText,
  ExternalLink
} from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Avatar } from '../components/Avatar';
import { clearCredentials } from '../store/slices/authSlice';
import { apiSlice, useLogoutMutation } from '../store/api/apiSlice';
import {
  useGetUsersQuery,
  useGetManagerOptionsQuery,
  useCreateUserMutation,
  useGetBranchesQuery,
  useLazyGetUserOversightBranchesQuery,
  useUpdateUserOversightBranchesMutation,
  useGetUserDocumentsQuery,
} from '../store/api/apiSlice';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusChip } from '../components/StatusChip';
import { GlassModal } from '../components/GlassModal';
import { selectCurrentUser } from '../store/slices/authSlice';


export const UserManagement = () => {
  const user = useSelector(selectCurrentUser);
  const navigate = useNavigate();
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
  // Form state declared early — hooks below depend on formData.role
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'branch_admin',
    branchId: '',
    managerId: '',
    oversightBranchIds: [],
    oversightGmIds: [],
    hasSmartphone: true,
  });
  const [error, setError] = useState('');

  // Fetch potential managers by the roles that the selected new-user role can report to.
  // Exclude sales_officer from the upfront fetch — only needed for `client` creation and
  // there can be hundreds of them. We handle that lazily via the same endpoint below.
  const MANAGER_ROLES_UPFRONT = ['md', 'director', 'gm', 'branch_manager', 'abm', 'oa', 'branch_admin'];
  const { data: allUsers = [] } = useGetManagerOptionsQuery(MANAGER_ROLES_UPFRONT, { skip: !user?.id });

  // Fetch SOs only when creating a client (lazy — avoids loading hundreds of SOs upfront)
  const { data: salesOfficers = [] } = useGetManagerOptionsQuery(['sales_officer'], {
    skip: !user?.id || formData.role !== 'client',
  });

  const { data: branches = [] } = useGetBranchesQuery();
  const [createUser, { isLoading: isCreating }] = useCreateUserMutation();
  const [fetchOversightBranches] = useLazyGetUserOversightBranchesQuery();
  const [updateOversightBranches, { isLoading: isUpdatingBranches }] = useUpdateUserOversightBranchesMutation();

  // Oversight branch editor state (MD editing Director/GM assignments)
  const [editOversightUser, setEditOversightUser] = useState(null);
  const [editBranchIds, setEditBranchIds] = useState([]);
  const [editGmIds, setEditGmIds] = useState([]);
  const [editBranchError, setEditBranchError] = useState('');

  // Document Viewer state
  const [viewDocsUserId, setViewDocsUserId] = useState(null);
  const [viewDocsUserName, setViewDocsUserName] = useState('');
  const { data: userDocs = [], isLoading: isDocsLoading } = useGetUserDocumentsQuery(viewDocsUserId, {
    skip: !viewDocsUserId,
  });

  const dispatch = useDispatch();
  const [logoutApi] = useLogoutMutation();

  const handleLogout = async () => {
    try { await logoutApi().unwrap(); } catch { /* ignore */ }
    dispatch(apiSlice.util.resetApiState());
    dispatch(clearCredentials());
  };

  const isOversightRole = (role) => role === 'director' || role === 'gm';

  // Defines which roles a given role must report to.
  // Must stay in sync with ALLOWED_MANAGER_ROLES in apps/api/src/shared/hierarchy-policy.ts
  const MANAGER_ROLE_MAP = {
    director:       ['md'],
    gm:             ['director'],
    branch_manager: ['gm'],
    abm:            ['branch_manager'],
    sales_officer:  ['abm', 'oa', 'branch_admin'],
    client:         ['sales_officer', 'abm', 'branch_manager'],
  };

  // Must stay in sync with MANAGER_REQUIRED_ROLES in hierarchy-policy.ts
  const MANAGER_REQUIRED = new Set(['director', 'gm', 'branch_manager', 'abm', 'sales_officer', 'client']);

  const needsManager = (role) => Boolean(MANAGER_ROLE_MAP[role]);

  // Roles whose MANAGERS live in the same branch (i.e. the manager has branch_id set).
  // branch_manager is intentionally excluded: its manager is a GM, and GMs are
  // oversight-based (branch_id = null). The backend validates GM-branch oversight separately.
  const BRANCH_SCOPED_ROLES = new Set(['abm', 'sales_officer', 'client', 'oa']);

  const managerOptions = (() => {
    if (!needsManager(formData.role)) return [];

    const allowedRoles = MANAGER_ROLE_MAP[formData.role];

    // Combine the upfront pool + lazily-fetched SOs (only populated when role = client)
    const pool = formData.role === 'client'
      ? [...allUsers, ...salesOfficers]
      : allUsers;

    let visible = pool.filter((u) => allowedRoles.includes(u.role));

    // For branch-scoped roles, restrict to managers in the same branch once a branch is chosen.
    // This does NOT apply to branch_manager (whose GM manager has no branch_id).
    if (BRANCH_SCOPED_ROLES.has(formData.role) && formData.branchId) {
      visible = visible.filter((u) => u.branchId === formData.branchId);
    }

    // Self-inclusion fallback: if the logged-in user is a valid direct manager for this
    // role but wasn't returned by the server (timing edge case), add them.
    if (
      user?.id &&
      allowedRoles.includes(user.role) &&
      !visible.some((u) => u.id === user.id)
    ) {
      visible = [...visible, { id: user.id, name: user.name, role: user.role, branchId: user.branchId ?? null }];
    }

    return visible;
  })();

  const gmOptions = allUsers.filter((u) => u.role === 'gm');

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

  const toggleOversightGm = (gmId) => {
    setFormData((prev) => {
      const ids = prev.oversightGmIds;
      return {
        ...prev,
        oversightGmIds: ids.includes(gmId)
          ? ids.filter((id) => id !== gmId)
          : [...ids, gmId],
      };
    });
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setError('');

    const submissionData = { ...formData };

    if (isOversightRole(submissionData.role)) {
      // Director/GM have no branch_id — their branch access is through oversight mappings.
      delete submissionData.branchId;
      if (submissionData.role === 'director') {
        delete submissionData.oversightBranchIds;
      } else {
        delete submissionData.oversightGmIds;
      }
    } else {
      delete submissionData.oversightBranchIds;
      delete submissionData.oversightGmIds;
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
        oversightGmIds: [],
        hasSmartphone: true,
      });
    } catch (err) {
      setError(err.data?.error?.message || 'Failed to create user');
    }
  };

  const openOversightEditor = async (targetUser) => {
    setEditBranchError('');
    setEditOversightUser(targetUser);
    try {
      const result = await fetchOversightBranches(targetUser.id).unwrap();
      setEditBranchIds(result.branchIds ?? []);
      setEditGmIds(result.gmIds ?? []);
    } catch {
      setEditBranchIds([]);
      setEditGmIds([]);
    }
  };

  const toggleEditBranch = (branchId) => {
    setEditBranchIds((prev) =>
      prev.includes(branchId) ? prev.filter((id) => id !== branchId) : [...prev, branchId]
    );
  };

  const toggleEditGm = (gmId) => {
    setEditGmIds((prev) =>
      prev.includes(gmId) ? prev.filter((id) => id !== gmId) : [...prev, gmId]
    );
  };

  const handleOversightUpdate = async (e) => {
    e.preventDefault();
    setEditBranchError('');
    try {
      await updateOversightBranches({
        id: editOversightUser.id,
        branchIds: editBranchIds,
        gmIds: editGmIds,
      }).unwrap();
      setEditOversightUser(null);
    } catch (err) {
      setEditBranchError(err.data?.error?.message || 'Failed to update branch assignments');
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
    { value: 'oa', label: 'Operations Assistant' },
    { value: 'sales_officer', label: 'Sales Officer' },
    { value: 'client', label: 'Client' },
  ];

  const creatableRoles = {
    md:           ['director', 'gm', 'branch_manager', 'abm', 'sales_officer', 'branch_admin', 'oa', 'client'],
    gm:           ['branch_manager', 'abm', 'sales_officer', 'branch_admin', 'oa', 'client'],
    branch_admin: ['branch_manager', 'abm', 'sales_officer', 'oa', 'client'],
  };

  const roles = user?.role
    ? allRoles.filter((r) => (creatableRoles[user.role] ?? []).includes(r.value))
    : [];

  // Filter options should follow visible directory data, not create permissions.
  const filterRoles = Array.from(
    new Set((users ?? []).map((u) => u.role).filter(Boolean))
  )
    .filter((role) => role !== 'md')
    .sort()
    .map((role) => ({
      value: role,
      label: role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    }));

  if (isUsersLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin text-indigo" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-6xl mx-auto px-4 py-8">
      {/* Back button — was provided by AttendanceHome overlay wrapper, now inline */}
      <button
        onClick={() => navigate(-1)}
        className="fixed top-4 left-4 z-[200] flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md border border-navy/5 rounded-2xl shadow-xl text-[10px] font-bold text-navy uppercase tracking-widest tactile-press"
      >
        <ArrowRight className="rotate-180" size={14} /> Back
      </button>

      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 pt-12">
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
          {filterRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Users List */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {users.map((u) => (
          <Card
            key={u.id}
            className="group hover-lift border-white/50 bg-white/70 backdrop-blur-sm cursor-default p-0 overflow-hidden"
          >
            <div className="p-5 sm:p-6">
              {/* Top row: avatar + name + role chip */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-indigo/5 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl overflow-hidden shadow-sm">
                      <Avatar url={u?.profilePhotoUrl} name={u.name} size={40} />
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg font-bold text-navy leading-tight truncate group-hover:text-indigo transition-colors">
                      {u.name}
                    </h3>
                    {u.hasSmartphone && (
                      <span className="text-[8px] font-bold text-emerald uppercase tracking-[0.2em] flex items-center gap-1 bg-emerald/5 px-2 py-0.5 rounded-full mt-1 w-fit">
                        Mobile Ready
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1 pt-0.5">
                  <StatusChip status={u.role} label={u.role.replace(/_/g, ' ')} />
                </div>
              </div>

              {/* Meta row: email + branch */}
              <div className="flex flex-col gap-1 mb-4 pl-1">
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-navy/30 uppercase tracking-widest">
                  <Mail size={11} className="text-indigo/40 shrink-0" />
                  <span className="truncate">{u.email}</span>
                </span>
                <span className="flex items-center gap-1.5 text-[10px] font-bold text-navy/30 uppercase tracking-widest">
                  <Building2 size={11} className="text-indigo/40 shrink-0" />
                  {u.branchName || 'Unassigned'}
                </span>
              </div>

              {/* Action buttons (MD only) */}
              {user?.role === 'md' && (
                <div className="flex items-center gap-2 flex-wrap">
                  {(u.role === 'director' || u.role === 'gm') && (
                    <button
                      onClick={() => openOversightEditor(u)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo/5 text-indigo hover:bg-indigo hover:text-white transition-all text-[10px] font-bold tactile-press"
                    >
                      <Building2 size={12} />
                      {u.role === 'director' ? 'GMs' : 'Branches'}
                    </button>
                  )}
                  <button
                    onClick={() => { setViewDocsUserId(u.id); setViewDocsUserName(u.name); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-navy/5 text-navy/40 hover:bg-navy hover:text-white transition-all text-[10px] font-bold tactile-press"
                  >
                    <FileText size={12} />
                    Docs
                  </button>
                </div>
              )}
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

      {/* Oversight Branch Editor Modal (MD only — for Director / GM) */}
      <GlassModal
        isOpen={!!editOversightUser}
        onClose={() => setEditOversightUser(null)}
        title={`Branch Assignments — ${editOversightUser?.name ?? ''}`}
      >
        <form onSubmit={handleOversightUpdate} className="space-y-5 pt-4">
          {editBranchError && (
            <div className="p-4 bg-red-50 text-red-600 rounded-xl text-sm font-bold flex items-center gap-x-2">
              <XCircle size={18} />
              {editBranchError}
            </div>
          )}
          <p className="text-[10px] font-bold text-navy/40 uppercase tracking-widest">
            {editOversightUser?.role === 'director'
              ? 'director · select GMs this director oversees through'
              : `${editOversightUser?.role?.replace(/_/g, ' ')} · select all branches this person oversees`}
          </p>
          {editOversightUser?.role === 'director' ? (
            <div className="max-h-60 overflow-y-auto rounded-xl bg-navy/[0.03] p-3 space-y-2">
              {gmOptions.map((gm) => (
                <label key={gm.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-indigo cursor-pointer"
                    checked={editGmIds.includes(gm.id)}
                    onChange={() => toggleEditGm(gm.id)}
                  />
                  <span className="text-sm font-bold text-navy group-hover:text-indigo transition-colors">
                    {gm.name}
                  </span>
                </label>
              ))}
              {gmOptions.length === 0 && (
                <p className="text-xs text-navy/30 text-center py-2">No GMs available</p>
              )}
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto rounded-xl bg-navy/[0.03] p-3 space-y-2">
              {branches.map((b) => (
                <label key={b.id} className="flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-indigo cursor-pointer"
                    checked={editBranchIds.includes(b.id)}
                    onChange={() => toggleEditBranch(b.id)}
                  />
                  <span className="text-sm font-bold text-navy group-hover:text-indigo transition-colors">{b.name}</span>
                </label>
              ))}
              {branches.length === 0 && (
                <p className="text-xs text-navy/30 text-center py-2">No branches available</p>
              )}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-navy/5 text-navy/40 hover:bg-navy/5"
              onClick={() => setEditOversightUser(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-indigo text-white shadow-lg shadow-indigo/20"
              disabled={isUpdatingBranches}
            >
              {isUpdatingBranches ? (
                <><Loader2 className="animate-spin mr-2" size={18} />Saving...</>
              ) : (
                <><CheckCircle2 className="mr-2" size={18} />Save Assignments</>
              )}
            </Button>
          </div>
        </form>
      </GlassModal>

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
                  onChange={(e) => setFormData({ ...formData, role: e.target.value, branchId: '', managerId: '', oversightBranchIds: [], oversightGmIds: [] })}
                >
                  {roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>

              {/* Roles in reporting chain: pick direct manager */}
              {needsManager(formData.role) && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                    Reports To <span className="text-red-400">*</span>
                  </label>
                  <select
                    required={MANAGER_REQUIRED.has(formData.role)}
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
                      No valid manager found for this role in your visible hierarchy
                    </p>
                  )}
                </div>
              )}

              {/* Director: pick one or more GMs; Director branch visibility is inherited from selected GMs */}
              {formData.role === 'director' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-navy/40 uppercase tracking-widest ml-1">
                    Assigned GMs <span className="text-red-400">*</span>
                  </label>
                  <div className="max-h-40 overflow-y-auto rounded-xl bg-navy/[0.03] p-3 space-y-2">
                    {gmOptions.map((gm) => (
                      <label key={gm.id} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded accent-indigo cursor-pointer"
                          checked={formData.oversightGmIds.includes(gm.id)}
                          onChange={() => toggleOversightGm(gm.id)}
                        />
                        <span className="text-sm font-bold text-navy group-hover:text-indigo transition-colors">
                          {gm.name}
                        </span>
                      </label>
                    ))}
                    {gmOptions.length === 0 && (
                      <p className="text-xs text-navy/30 text-center py-2">No GMs available</p>
                    )}
                  </div>
                  {formData.oversightGmIds.length === 0 && (
                    <p className="text-[10px] text-amber-500 font-bold ml-1">Select at least one GM</p>
                  )}
                </div>
              )}

              {/* GM: pick multiple oversight branches */}
              {formData.role === 'gm' && (
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
                    onChange={(e) => setFormData({ ...formData, branchId: e.target.value, managerId: '' })}
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
              disabled={
                isCreating
                || (formData.role === 'gm' && formData.oversightBranchIds.length === 0)
                || (formData.role === 'director' && formData.oversightGmIds.length === 0)
                || (MANAGER_REQUIRED.has(formData.role) && !formData.managerId)
              }
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

      {/* User Documents Modal */}
      <GlassModal
        isOpen={!!viewDocsUserId}
        onClose={() => setViewDocsUserId(null)}
        title={`Uploaded Proofs — ${viewDocsUserName}`}
      >
        <div className="space-y-4 pt-4">
          {isDocsLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="animate-spin text-indigo/20" size={32} /></div>
          ) : userDocs.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <FileText className="mx-auto text-navy/5" size={48} />
              <p className="text-sm font-bold text-navy/30">No documents found for this user.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
              {userDocs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between p-4 rounded-2xl bg-navy/[0.02] border border-navy/5 group">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="p-2.5 rounded-xl bg-white shadow-sm text-indigo border border-navy/5">
                      <FileText size={18} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-navy truncate">{doc.fileName}</p>
                      <p className="text-[10px] font-bold text-navy/30 uppercase tracking-widest mt-0.5">
                        Uploaded {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <a 
                    href={doc.downloadUrl} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="p-3 rounded-xl bg-white border border-navy/5 text-indigo hover:bg-indigo hover:text-white transition-all tactile-press flex items-center gap-2 text-xs font-bold shadow-sm"
                  >
                    <ExternalLink size={14} />
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
          <Button 
            variant="outline" 
            className="w-full mt-2 border-navy/5 text-navy/40"
            onClick={() => setViewDocsUserId(null)}
          >
            Close
          </Button>
        </div>
      </GlassModal>
    </div>
  );
};
