// Agila Chit Fund scheme.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getChitGroups list — shared by the plain query and its paged variant.
const chitGroupsUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set('status', params.status);
  if (params.search) qs.set('search', params.search);
  if (params.page)   qs.set('page',   String(params.page));
  if (params.limit)  qs.set('limit',  String(params.limit));
  const q = qs.toString();
  return `/chit/groups${q ? `?${q}` : ''}`;
};

export const chitApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Agila Chit Fund Scheme ───

    getChitSummary: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate',   params.endDate);
        const q = qs.toString();
        return `/chit/summary${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['ChitSummary'],
    }),

    getChitGroups: builder.query({
      query: chitGroupsUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['ChitGroups'],
    }),

    // "Load more" variant of getChitGroups: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getChitGroupsPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(chitGroupsUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['ChitGroups'],
    }),

    createChitGroup: builder.mutation({
      query: (data) => ({ url: '/chit/groups', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['ChitGroups', 'ChitSummary'],
    }),

    getChitGroup: builder.query({
      // Accepts either a plain groupId string (existing pages) or { groupId, branchId }
      // (SchemeCorrectionsPage, where Management passes branchId as a query param).
      query: (arg) => {
        const groupId  = typeof arg === 'string' ? arg : arg.groupId;
        const branchId = arg?.branchId;
        return `/chit/groups/${groupId}${branchId ? `?branchId=${branchId}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: (result, error, arg) => [{ type: 'ChitGroup', id: typeof arg === 'string' ? arg : arg.groupId }],
    }),

    getChitEligibleMembers: builder.query({
      query: (groupId) => `/chit/groups/${groupId}/eligible-members`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, groupId) => [{ type: 'ChitEligible', id: groupId }],
    }),

    addChitMember: builder.mutation({
      query: ({ groupId, ...data }) => ({ url: `/chit/groups/${groupId}/members`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      // Referrer commission is credited on enroll — bust Incentives/IncentiveWallet too
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'ChitSummary',
        'Incentives', 'IncentiveWallet',
      ],
    }),

    recordChitPayment: builder.mutation({
      query: ({ groupId, memberId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/payments`,
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId, memberId }) => [
        { type: 'ChitGroup', id: groupId },
        { type: 'ChitPayments', id: memberId },
        'ChitSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    getChitMemberPayments: builder.query({
      // Accepts { groupId, memberId } or { groupId, memberId, branchId }.
      // branchId is appended as a query param so Management (null branchId on JWT)
      // can fetch payments for any branch's member.
      query: ({ groupId, memberId, branchId }) =>
        `/chit/groups/${groupId}/members/${memberId}/payments${branchId ? `?branchId=${branchId}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, { memberId }) => [{ type: 'ChitPayments', id: memberId }],
    }),

    selectChitWinner: builder.mutation({
      query: ({ groupId, ...data }) => ({ url: `/chit/groups/${groupId}/winners`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId },
        { type: 'ChitEligible', id: groupId },
        'ChitGroups', 'ChitSummary',
      ],
    }),

    cancelChitMember: builder.mutation({
      query: ({ groupId, memberId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/cancel`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId },
        { type: 'ChitEligible', id: groupId },
        'ChitGroups',
      ],
    }),

    reinstateChitMember: builder.mutation({
      query: ({ groupId, memberId }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/reinstate`,
        method: 'PATCH',
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId },
        { type: 'ChitEligible', id: groupId },
        'ChitGroups',
      ],
    }),

    markChitRefund: builder.mutation({
      query: ({ groupId, memberId }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/refund`,
        method: 'PATCH',
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [{ type: 'ChitGroup', id: groupId }],
    }),

    correctChitMember: builder.mutation({
      query: ({ groupId, memberId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    correctChitPayment: builder.mutation({
      query: ({ groupId, memberId, paymentId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/payments/${paymentId}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'ChitPayments', 'SchemeBranchEntries',
      ],
    }),

    unpayChitPayment: builder.mutation({
      query: ({ groupId, memberId, paymentId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/payments/${paymentId}/unpay`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'ChitPayments', 'SchemeBranchEntries',
      ],
    }),

    voidChitMember: builder.mutation({
      query: ({ groupId, memberId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/void`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    deleteChitMember: builder.mutation({
      query: ({ groupId, memberId, ...data }) => ({
        url: `/chit/groups/${groupId}/members/${memberId}/delete`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { groupId }) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'ChitPayments', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    // ─── Head-branch chit operations ───
    getChitAwaitingCombine: builder.query({
      query: () => '/chit/groups/awaiting-combine',
      transformResponse: (response) => response.data,
      providesTags: ['ChitAwaitingCombine'],
    }),

    sendChitGroupToHeadBranch: builder.mutation({
      query: (groupId) => ({ url: `/chit/groups/${groupId}/send-to-head`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, groupId) => [
        { type: 'ChitGroup', id: groupId }, 'ChitGroups', 'ChitAwaitingCombine', 'ChitSummary',
      ],
    }),

    combineChitGroups: builder.mutation({
      query: (data) => ({ url: '/chit/groups/combine', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['ChitGroups', 'ChitAwaitingCombine', 'ChitSummary'],
    }),

    expireChitGroup: builder.mutation({
      query: (groupId) => ({ url: `/chit/groups/${groupId}/expire`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['ChitGroups', 'ChitAwaitingCombine', 'ChitSummary'],
    }),
  }),
});

export const {
  useGetChitSummaryQuery,
  useGetChitGroupsQuery,
  useCreateChitGroupMutation,
  useGetChitGroupQuery,
  useLazyGetChitGroupQuery,
  useGetChitEligibleMembersQuery,
  useAddChitMemberMutation,
  useRecordChitPaymentMutation,
  useGetChitMemberPaymentsQuery,
  useSelectChitWinnerMutation,
  useCancelChitMemberMutation,
  useReinstateChitMemberMutation,
  useMarkChitRefundMutation,
  useGetChitAwaitingCombineQuery,
  useSendChitGroupToHeadBranchMutation,
  useCombineChitGroupsMutation,
  useExpireChitGroupMutation,
  useCorrectChitMemberMutation,
  useCorrectChitPaymentMutation,
  useUnpayChitPaymentMutation,
  useVoidChitMemberMutation,
  useDeleteChitMemberMutation,
  useGetChitGroupsPagedInfiniteQuery,
} = chitApi;
