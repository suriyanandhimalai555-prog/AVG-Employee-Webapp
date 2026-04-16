// frontend/src/store/api/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// Intercept 401 from any endpoint and clear auth state so ProtectedLayout
// redirects to /login. Cannot import clearCredentials directly here because
// authSlice.js already imports apiSlice (circular dep) — dispatch by string type instead.
const baseQueryWithReauth = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch({ type: 'auth/clearCredentials' });
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Attendance', 'Summary', 'Employees', 'Branches', 'Transactions', 'Users', 'MoneyProjects', 'MoneyCollections', 'MoneyWallet', 'UserDocuments'],
  endpoints: (builder) => ({

    // ─── Auth ───
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response) => response.data,
    }),

    getMe: builder.query({
      query: () => '/auth/me',
      transformResponse: (response) => response.data,
    }),

    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),

    getProfileUploadUrl: builder.mutation({
      query: ({ kind, contentType }) => ({
        url: '/users/upload-url',
        params: { kind, contentType }
      }),
      transformResponse: (response) => response.data,
    }),

    getMyDocuments: builder.query({
      query: () => '/users/me/documents',
      providesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    addDocument: builder.mutation({
      query: (body) => ({
        url: '/users/me/documents',
        method: 'POST',
        body
      }),
      invalidatesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    deleteDocument: builder.mutation({
      query: (id) => ({
        url: `/users/me/documents/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    getUserDocuments: builder.query({
      query: (id) => `/users/${id}/documents`,
      providesTags: (result, error, id) => [{ type: 'UserDocuments', id }],
      transformResponse: (response) => response.data,
    }),

    updateProfileAssets: builder.mutation({
      query: (data) => ({
        url: '/auth/profile-assets',
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // ─── Attendance (Employee) ───
    // Mutation (not query) so RTK Query never caches the result.
    // Presigned PUT URLs expire in 300s — a cached URL could be stale and cause silent upload failures.
    getUploadUrl: builder.mutation({
      query: (contentType = 'image/jpeg') => ({
        url: `/attendance/upload-url?contentType=${encodeURIComponent(contentType)}`,
        method: 'GET',
      }),
      transformResponse: (response) => response.data,
    }),
    
    getPhotoUrl: builder.query({
      // Key is passed as query param — the key contains slashes which would
      // break path-segment routing (e.g. attendance/userId/timestamp.jpg)
      query: (key) => `/attendance/photo-url?key=${encodeURIComponent(key)}`,
      transformResponse: (response) => response.data,
    }),
    submitAttendance: builder.mutation({
      query: (data) => ({
        url: '/attendance',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // No invalidatesTags here — the API returns 202 (queued, not yet in DB).
      // Cache invalidation happens via useAttendanceSocket when the worker confirms
      // attendance:confirmed over Socket.io. A 5-second fallback in useCheckIn covers
      // cases where the socket is unavailable.
    }),

    // viewerId is not sent to the server — it scopes the RTK cache per logged-in user (avoids stale data after account switch).
    getSummary: builder.query({
      query: ({ viewerId: _viewerId, date } = {}) => {
        const qs = new URLSearchParams();
        if (date) qs.set('date', date);
        const suffix = qs.toString() ? `?${qs}` : '';
        return `/attendance/summary${suffix}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Summary'],
    }),

    getHistory: builder.query({
      query: ({ userId, month, year }) =>
        `/attendance/${userId}/history?month=${month}&year=${year}`,
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // Aggregated team calendar — returns TeamHistoryDay[] (per-date counts, not single rows)
    // Used by manager/admin roles so the calendar shows team activity, not just their own record
    getTeamHistory: builder.query({
      query: ({ month, year }) =>
        `/attendance/team-history?month=${month}&year=${year}`,
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // ─── Admin ───
    getEmployees: builder.query({
      // viewerId is not sent — it scopes the RTK cache key so two logged-in users don't share data
      query: ({ viewerId: _viewerId, page = 1, limit = 50, search, branchId } = {}) => {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        if (search) qs.set('search', search);
        if (branchId) qs.set('branchId', branchId);
        return `/attendance/employees?${qs}`;
      },
      // Response shape: { data: [], total, page, limit, totalPages }
      transformResponse: (response) => response.data,
      providesTags: ['Employees'],
    }),

    getAttendanceList: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/attendance${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // Employee self-marks absent — synchronous (200, not 202) since absent needs no photo/GPS
    selfAbsent: builder.mutation({
      query: (data = {}) => ({
        url: '/attendance/self-absent',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Summary', 'Attendance', 'Employees'],
    }),

    adminMark: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-mark',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary', 'Employees'],
    }),

    // Employee self sign-off (clock-out) — returns 202 like submitAttendance
    // Cache invalidation happens via useAttendanceSocket on signoff:confirmed
    submitSignOff: builder.mutation({
      query: (data) => ({
        url: '/attendance/sign-off',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
    }),

    // Admin sign-off on behalf of a no-smartphone employee
    adminSignOff: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-sign-off',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
    }),

    adminCorrect: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/attendance/${id}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary', 'Employees'],
    }),

    // ─── Branches ───
    getBranches: builder.query({
      query: () => '/branches',
      transformResponse: (response) => response.data,
      providesTags: ['Branches'],
      // Match the 10-min server Redis cache — no re-fetch within 10 min
      keepUnusedDataFor: 600,
    }),

    createBranch: builder.mutation({
      query: (data) => ({ url: '/branches', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    updateBranch: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/branches/${id}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    deleteBranch: builder.mutation({
      query: (id) => ({ url: `/branches/${id}`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    // ─── Transactions (Expenses, Reimbursements, etc.) ───
    getTransactions: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/transactions${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Transactions'],
    }),

    createTransaction: builder.mutation({
      query: (data) => ({
        url: '/transactions',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Transactions'],
    }),

    updateTransactionStatus: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/transactions/${id}/status`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Transactions'],
    }),

    // ─── Money Module ───
    createMoneyProject: builder.mutation({
      query: (data) => ({ url: '/money/projects', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyProjects'],
    }),

    getMoneyProjects: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money/projects${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyProjects'],
    }),

    updateMoneyProject: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/money/projects/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyProjects'],
    }),

    submitMoneyCollection: builder.mutation({
      query: (data) => ({ url: '/money', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections'],
    }),

    verifyMoneyCollection: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/money/${id}/verify`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections'],
    }),

    getMoneyCollections: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections'],
    }),

    getMoneyUploadUrl: builder.mutation({
      query: ({ contentType = 'image/jpeg', mode = 'gpay' }) => ({
        url: `/money/upload-url?contentType=${encodeURIComponent(contentType)}&mode=${encodeURIComponent(mode)}`,
        method: 'GET',
      }),
      transformResponse: (response) => response.data,
    }),

    getMoneyPhotoUrl: builder.query({
      query: (key) => `/money/photo-url?key=${encodeURIComponent(key)}`,
      transformResponse: (response) => response.data,
    }),

    getMoneyWallet: builder.query({
      query: () => '/money/wallet',
      transformResponse: (response) => response.data,
      providesTags: ['MoneyWallet'],
    }),

    transferMoney: builder.mutation({
      query: (data) => ({ url: '/money/transfer', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyWallet', 'MoneyCollections'],
    }),

    getMoneySources: builder.query({
      query: (id) => `/money/${id}/sources`,
      transformResponse: (response) => response.data,
    }),

    getMoneyAdminOverview: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money/admin/overview${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections', 'MoneyWallet'],
    }),

    getMoneyBranchDrilldown: builder.query({
      query: (branchId) => `/money/admin/branch/${branchId}`,
      transformResponse: (response) => response.data,
    }),

    getBranchRankings: builder.query({
      query: ({ startDate, endDate } = {}) => {
        const qs = new URLSearchParams();
        if (startDate) qs.set('startDate', startDate);
        if (endDate) qs.set('endDate', endDate);
        const q = qs.toString();
        return `/money/admin/rankings${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections'],
    }),

    mdAddCollectionEntry: builder.mutation({
      query: (data) => ({ url: '/money/admin/entry', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections', 'MoneyWallet'],
    }),

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
  }),
});

export const {
  useSelfAbsentMutation,
  useLoginMutation,
  useGetMeQuery,
  useLogoutMutation,
  useGetProfileUploadUrlMutation,
  useUpdateProfileAssetsMutation,
  useSubmitAttendanceMutation,
  useGetSummaryQuery,
  useGetHistoryQuery,
  useGetTeamHistoryQuery,
  useGetEmployeesQuery,
  useGetAttendanceListQuery,
  useAdminMarkMutation,
  useAdminCorrectMutation,
  useSubmitSignOffMutation,
  useAdminSignOffMutation,
  useGetUploadUrlMutation,
  useGetPhotoUrlQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useGetTransactionsQuery,
  useCreateTransactionMutation,
  useUpdateTransactionStatusMutation,
  useCreateMoneyProjectMutation,
  useUpdateMoneyProjectMutation,
  useGetMoneyProjectsQuery,
  useSubmitMoneyCollectionMutation,
  useVerifyMoneyCollectionMutation,
  useGetMoneyCollectionsQuery,
  useGetMoneyUploadUrlMutation,
  useGetMoneyPhotoUrlQuery,
  useGetUserSuperiorsQuery,
  useGetUsersQuery,
  useCreateUserMutation,
  useGetUserOversightBranchesQuery,
  useLazyGetUserOversightBranchesQuery,
  useUpdateUserOversightBranchesMutation,
  useChangePasswordMutation,
  useGetMoneyWalletQuery,
  useTransferMoneyMutation,
  useGetMoneySourcesQuery,
  useGetMoneyAdminOverviewQuery,
  useGetMoneyBranchDrilldownQuery,
  useGetBranchRankingsQuery,
  useMdAddCollectionEntryMutation,
  useGetMyDocumentsQuery,
  useAddDocumentMutation,
  useDeleteDocumentMutation,
  useGetUserDocumentsQuery,
} = apiSlice;
