// Branch-admin attendance operations.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const adminApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Admin ───
    getEmployees: builder.query({
      // viewerId is not sent — it scopes the RTK cache key so two logged-in users don't share data
      query: ({ viewerId: _viewerId, page = 1, limit = 50, search, branchId, role } = {}) => {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        if (search) qs.set('search', search);
        if (branchId) qs.set('branchId', branchId);
        if (role) qs.set('role', role);
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
      // Returns 202 (queued) — cache invalidation happens via useAttendanceSocket
      // on attendance:confirmed. Invalidating immediately causes stale-cache flicker
      // because the worker hasn't written to DB yet.
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
      // Socket pushes the canonical update, but invalidate as a safety net so the
      // history view refreshes even when the socket connection is degraded.
      invalidatesTags: ['Attendance', 'Summary'],
    }),

    // Admin sign-off on behalf of a no-smartphone employee
    adminSignOff: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-sign-off',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary'],
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
  }),
});

export const {
  useSelfAbsentMutation,
  useGetEmployeesQuery,
  useGetAttendanceListQuery,
  useAdminMarkMutation,
  useAdminCorrectMutation,
  useSubmitSignOffMutation,
  useAdminSignOffMutation,
} = adminApi;
