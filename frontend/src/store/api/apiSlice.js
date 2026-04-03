// frontend/src/store/api/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: API_URL,
    prepareHeaders: (headers, { getState }) => {
      const token = getState().auth.token;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Attendance', 'Summary', 'Employees', 'Branches', 'Transactions', 'Users'],
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

    // ─── Attendance (Employee) ───
    getUploadUrl: builder.query({
      query: () => '/attendance/upload-url',
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
      // After submitting, refetch summary + employees list
      invalidatesTags: ['Summary', 'Attendance', 'Employees'],
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
    }),

    // ─── Admin ───
    getEmployees: builder.query({
      query: (_viewerId) => '/attendance/employees',
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

    adminMark: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-mark',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary', 'Employees'],
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

    // ─── User Management (Staff & Admins) ───
    getUsers: builder.query({
      query: (params = {}) => {
        const { viewerId: _viewerId, role, branchId } = params;
        const qs = new URLSearchParams();
        if (role) qs.set('role', role);
        if (branchId) qs.set('branchId', branchId);
        const s = qs.toString();
        return `/users${s ? `?${s}` : ''}`;
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
  }),
});

export const {
  useLoginMutation,
  useGetMeQuery,
  useLogoutMutation,
  useSubmitAttendanceMutation,
  useGetSummaryQuery,
  useGetHistoryQuery,
  useGetEmployeesQuery,
  useGetAttendanceListQuery,
  useAdminMarkMutation,
  useAdminCorrectMutation,
  useGetUploadUrlQuery,
  useLazyGetUploadUrlQuery,
  useGetPhotoUrlQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useGetTransactionsQuery,
  useCreateTransactionMutation,
  useUpdateTransactionStatusMutation,
  useGetUsersQuery,
  useCreateUserMutation,
} = apiSlice;
