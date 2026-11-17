// User management and transfers / promotions.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const usersApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── User Management (Staff & Admins) ───
    getUserSuperiors: builder.query({
      query: () => '/users/superiors',
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getUsers: builder.query({
      query: (params = {}) => {
        const { viewerId: _viewerId, role, branchId, search, page = 1, limit = 50 } = params;
        const qs = new URLSearchParams();
        if (role) qs.set('role', role);
        if (branchId) qs.set('branchId', branchId);
        if (search) qs.set('search', search);
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        return `/users?${qs}`;
      },
      // Response shape: { data: [], total, page, limit, totalPages }
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getUserById: builder.query({
      query: (userId) => `/users/${userId}`,
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getManagerOptions: builder.query({
      // Accepts either a plain roles string/array (legacy callers) or { roles, branchId }
      // object. When branchId is supplied the backend filters to branch-valid managers only.
      query: (arg) => {
        const roles = Array.isArray(arg?.roles) ? arg.roles.join(',') : (arg?.roles ?? arg);
        const branchId = arg?.branchId;
        return branchId
          ? `/users/manager-options?roles=${roles}&branchId=${branchId}`
          : `/users/manager-options?roles=${roles}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    createUser: builder.mutation({
      query: (data) => ({
        url: '/users',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // Returns { branchIds: string[] } for a Director or GM. MD only.
    getUserOversightBranches: builder.query({
      query: (userId) => `/users/${userId}/oversight-branches`,
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    // Director → GM → branch tree for the /leadership/directors page.
    // MD/Management see all directors; a Director sees only their own record.
    getDirectorLeadershipTree: builder.query({
      query: () => '/users/leadership/directors',
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    // Replaces oversight assignments for Director/GM. MD only.
    updateUserOversightBranches: builder.mutation({
      query: ({ id, branchIds = [], gmIds = [] }) => ({
        url: `/users/${id}/oversight-branches`,
        method: 'PATCH',
        body: { branchIds, gmIds },
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // Change password — requires current password, available to all authenticated users.
    changePassword: builder.mutation({
      query: (data) => ({
        url: '/auth/change-password',
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
    }),

    // ─── Transfer / Promotion — Management direct execute ──────────────────────
    // Management fills the form and the transfer takes effect immediately.
    executeTransfer: builder.mutation({
      query: (data) => ({ url: '/users/transfers', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TransferRequests', 'Users'],
    }),
    listTransferRequests: builder.query({
      query: ({ status } = {}) => `/users/transfers${status ? `?status=${status}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['TransferRequests'],
    }),

    // ── Employee rename (management-only) ────────────────────────────────────
    // POST /users/rename — changes the display name, writes an audit row, busts caches.
    renameUser: builder.mutation({
      query: (data) => ({ url: '/users/rename', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      // Invalidate Users so employee-search dropdowns reflect the new name immediately.
      invalidatesTags: ['Users', 'UserRenames'],
    }),

    // GET /users/rename-history — full audit log (newest first, max 100 rows).
    getRenameHistory: builder.query({
      query: () => '/users/rename-history',
      transformResponse: (response) => response.data,
      providesTags: ['UserRenames'],
    }),
  }),
});

export const {
  useGetUserSuperiorsQuery,
  useGetUsersQuery,
  useGetUserByIdQuery,
  useGetManagerOptionsQuery,
  useCreateUserMutation,
  useGetUserOversightBranchesQuery,
  useLazyGetUserOversightBranchesQuery,
  useUpdateUserOversightBranchesMutation,
  useGetDirectorLeadershipTreeQuery,
  useChangePasswordMutation,
  useExecuteTransferMutation,
  useListTransferRequestsQuery,
  useRenameUserMutation,
  useGetRenameHistoryQuery,
} = usersApi;
