// Salary management.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const salariesApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Salary Management ───

    getCurrentSalary: builder.query({
      query: (userId) => userId ? `/salaries/${userId}` : '/salaries/me',
      transformResponse: (response) => response.data,
      providesTags: (result, error, userId) => [{ type: 'Salaries', id: userId || 'me' }],
    }),

    getSalaryHistory: builder.query({
      query: ({ userId, page = 1, limit = 50 }) => {
        const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
        return `/salaries/${userId}/history?${qs}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: (result, error, { userId }) => [{ type: 'Salaries', id: userId }],
    }),

    setSalary: builder.mutation({
      query: (data) => ({ url: '/salaries', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Salaries'],
    }),

    setSalaryByRole: builder.mutation({
      query: (data) => ({ url: '/salaries/by-role', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Salaries'],
    }),
  }),
});

export const {
  useGetCurrentSalaryQuery,
  useGetSalaryHistoryQuery,
  useSetSalaryMutation,
  useSetSalaryByRoleMutation,
} = salariesApi;
