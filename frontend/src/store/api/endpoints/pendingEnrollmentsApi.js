// Pending enrollments (partial / installment payments).
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const pendingEnrollmentsApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Pending enrollments (partial / installment payments) ───
    // Completion may start a real scheme entity, so invalidate the broad scheme tags too.
    getPendingEnrollments: builder.query({
      query: (params = {}) => ({ url: '/pending-enrollments', params }),
      transformResponse: (response) => ({ data: response.data, total: response.total, summary: response.summary }),
      providesTags: ['PendingEnrollments'],
    }),
    getPendingEnrollment: builder.query({
      query: (id) => `/pending-enrollments/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'PendingEnrollments', id }],
    }),
    createPendingEnrollment: builder.mutation({
      query: (data) => ({ url: '/pending-enrollments', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['PendingEnrollments', 'GoldMembers', 'TradingMembers', 'GoldCoinRooms', 'LssRooms', 'ChitGroups', 'BuildersPlans', 'SchemesOverview'],
    }),
    addPendingEnrollmentPayment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/pending-enrollments/${id}/payments`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'PendingEnrollments', id }, 'PendingEnrollments',
        'GoldMembers', 'TradingMembers', 'GoldCoinRooms', 'LssRooms', 'ChitGroups', 'BuildersPlans', 'SchemesOverview',
      ],
    }),
    cancelPendingEnrollment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/pending-enrollments/${id}/cancel`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [{ type: 'PendingEnrollments', id }, 'PendingEnrollments', 'SchemesOverview'],
    }),
    retryPendingEnrollment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/pending-enrollments/${id}/retry`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'PendingEnrollments', id }, 'PendingEnrollments',
        'GoldMembers', 'TradingMembers', 'GoldCoinRooms', 'LssRooms', 'ChitGroups', 'BuildersPlans', 'SchemesOverview',
      ],
    }),
  }),
});

export const {
  useGetPendingEnrollmentsQuery,
  useGetPendingEnrollmentQuery,
  useCreatePendingEnrollmentMutation,
  useAddPendingEnrollmentPaymentMutation,
  useCancelPendingEnrollmentMutation,
  useRetryPendingEnrollmentMutation,
} = pendingEnrollmentsApi;
