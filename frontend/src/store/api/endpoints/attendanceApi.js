// Attendance (employee self-service).
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const attendanceApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
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
  }),
});

export const {
  useSubmitAttendanceMutation,
  useGetSummaryQuery,
  useGetHistoryQuery,
  useGetTeamHistoryQuery,
  useGetUploadUrlMutation,
  useGetPhotoUrlQuery,
} = attendanceApi;
