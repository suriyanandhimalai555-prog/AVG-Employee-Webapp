// Gold Savings Scheme (+ scheme corrections).
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getGoldMembers list — shared by the plain query and its paged variant.
const goldMembersUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status)     qs.set('status', params.status);
  if (params.referrerId) qs.set('referrerId', params.referrerId);
  if (params.branchId)   qs.set('branchId', params.branchId);
  if (params.search)     qs.set('search', params.search);
  if (params.searchReferrers) qs.set('searchReferrers', 'true');
  if (params.page)       qs.set('page', String(params.page));
  if (params.limit)      qs.set('limit', String(params.limit));
  if (params.startDate)  qs.set('startDate', params.startDate);
  if (params.endDate)    qs.set('endDate', params.endDate);
  const q = qs.toString();
  return `/gold${q ? `?${q}` : ''}`;
};

export const goldApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Gold Savings Scheme ───

    getGoldMembers: builder.query({
      query: goldMembersUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['GoldMembers'],
    }),

    // "Load more" variant of getGoldMembers: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getGoldMembersPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(goldMembersUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['GoldMembers'],
    }),

    getGoldMember: builder.query({
      // Accepts either a plain id string (existing pages) or { id, branchId }
      // (MD/Management drill-down, where branchId must go as a query param).
      query: (arg) => {
        const id = typeof arg === 'string' ? arg : arg.id;
        const branchId = arg?.branchId;
        return `/gold/${id}${branchId ? `?branchId=${branchId}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['GoldMembers'],
    }),

    addGoldMember: builder.mutation({
      query: (data) => ({ url: '/gold', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldMembers', 'GoldSummary', 'Incentives', 'IncentiveWallet'],
    }),

    updateGoldMemberStatus: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/status`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldMembers', 'GoldSummary'],
    }),

    getGoldEmployees: builder.query({
      query: (branchId) => `/gold/employees${branchId ? `?branchId=${branchId}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: (_r, _e, branchId) => [{ type: 'GoldEmployees', id: branchId ?? 'own' }],
    }),

    getGoldSummary: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/gold/summary${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['GoldSummary'],
    }),

    getGoldPayments: builder.query({
      // Accepts either a plain memberId string (existing pages) or { memberId, branchId }
      // (SchemeCorrectionsPage, where Management passes branchId as a query param).
      query: (arg) => {
        const memberId = typeof arg === 'string' ? arg : arg.memberId;
        const branchId = arg?.branchId;
        return `/gold/${memberId}/payments${branchId ? `?branchId=${branchId}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: (result, error, arg) => [{ type: 'GoldPayments', id: typeof arg === 'string' ? arg : arg.memberId }],
    }),

    addGoldPayment: builder.mutation({
      query: ({ memberId, ...data }) => ({ url: `/gold/${memberId}/payments`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { memberId }) => [
        { type: 'GoldPayments', id: memberId }, 'GoldMembers', 'Incentives', 'IncentiveWallet',
        'SchemeBranchEntries',
      ],
    }),

    // ─── Correction endpoints (MD / Management) ─────────────────────────────
    correctGoldMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/correct`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'GoldMembers', id }, 'GoldMembers', 'GoldSummary', 'Incentives', 'IncentiveWallet',
      ],
    }),

    correctGoldPayment: builder.mutation({
      query: ({ memberId, paymentId, ...data }) => ({
        url: `/gold/${memberId}/payments/${paymentId}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { memberId }) => [
        { type: 'GoldPayments', id: memberId }, 'GoldMembers', 'Incentives', 'IncentiveWallet',
      ],
    }),

    unpayGoldPayment: builder.mutation({
      query: ({ memberId, paymentId, ...data }) => ({
        url: `/gold/${memberId}/payments/${paymentId}/unpay`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { memberId }) => [
        { type: 'GoldPayments', id: memberId }, 'GoldMembers', 'GoldSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    // Cancel an active gold member: status → 'cancelled', refund_status → 'pending'.
    // Commission is kept; the refund becomes payable after the scheme matures.
    cancelGoldMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/cancel`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldMembers', 'GoldSummary'],
    }),

    // Settle the refund on a cancelled member once the scheme term has ended.
    // The server enforces the maturity gate; the frontend shows the button only
    // when today ≥ maturity (display-only guard — server is authoritative).
    refundGoldMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/refund`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldMembers', 'GoldSummary'],
    }),
  }),
});

export const {
  useGetGoldMembersQuery,
  useGetGoldMemberQuery,
  useAddGoldMemberMutation,
  useUpdateGoldMemberStatusMutation,
  useGetGoldEmployeesQuery,
  useGetGoldSummaryQuery,
  useGetGoldPaymentsQuery,
  useAddGoldPaymentMutation,
  useCorrectGoldMemberMutation,
  useCorrectGoldPaymentMutation,
  useUnpayGoldPaymentMutation,
  useCancelGoldMemberMutation,
  useRefundGoldMemberMutation,
  useGetGoldMembersPagedInfiniteQuery,
} = goldApi;
