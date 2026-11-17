// Daily collection reconciliation.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const reconciliationApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Daily Collection Reconciliation ───
    // GET /reconciliation/summary/today?branchId=
    getTodayCollectionSummary: builder.query({
      query: (branchId) => `/reconciliation/summary/today${branchId ? `?branchId=${branchId}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),

    // POST /reconciliation/summary
    submitDailyCollectionSummary: builder.mutation({
      query: (data) => ({ url: '/reconciliation/summary', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['DailyReconciliation'],
    }),

    // PUT /reconciliation/summary/:id — management edits a locked day
    updateDailyCollectionSummary: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/reconciliation/summary/${id}`, method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['DailyReconciliation'],
    }),

    // GET /reconciliation/branch/:branchId?businessDate=YYYY-MM-DD
    getBranchReconciliation: builder.query({
      query: ({ branchId, businessDate }) =>
        `/reconciliation/branch/${branchId}${businessDate ? `?businessDate=${businessDate}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),

    // GET /reconciliation/overview?businessDate=YYYY-MM-DD
    getReconciliationOverview: builder.query({
      query: (businessDate) =>
        `/reconciliation/overview${businessDate ? `?businessDate=${businessDate}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),
  }),
});

export const {
  useGetTodayCollectionSummaryQuery,
  useSubmitDailyCollectionSummaryMutation,
  useUpdateDailyCollectionSummaryMutation,
  useGetBranchReconciliationQuery,
  useGetReconciliationOverviewQuery,
} = reconciliationApi;
