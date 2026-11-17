// Trading Academy scheme.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getTradingMembers list — shared by the plain query and its paged variant.
const tradingMembersUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.search)    qs.set('search', params.search);
  if (params.page)      qs.set('page', String(params.page));
  if (params.limit)     qs.set('limit', String(params.limit));
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate)   qs.set('endDate', params.endDate);
  const q = qs.toString();
  return `/trading-academy${q ? `?${q}` : ''}`;
};

export const tradingAcademyApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Trading Academy Scheme ───

    getTradingMembers: builder.query({
      query: tradingMembersUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['TradingMembers'],
    }),

    // "Load more" variant of getTradingMembers: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getTradingMembersPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(tradingMembersUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['TradingMembers'],
    }),

    getTradingSummary: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/trading-academy/summary${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['TradingSummary'],
    }),

    getTradingEmployees: builder.query({
      query: () => '/trading-academy/employees',
      transformResponse: (response) => response.data,
      providesTags: ['Employees'],
    }),

    addTradingMember: builder.mutation({
      query: (data) => ({ url: '/trading-academy', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TradingMembers', 'TradingSummary', 'Incentives', 'IncentiveWallet'],
    }),

    correctTradingMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/trading-academy/${id}/correct`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TradingMembers', 'TradingSummary', 'Incentives', 'IncentiveWallet'],
    }),

    voidGoldMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldMembers', 'GoldSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteGoldMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold/${id}/delete`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'GoldPayments', id }, 'GoldMembers', 'GoldSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    voidTradingMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/trading-academy/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TradingMembers', 'TradingSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteTradingMember: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/trading-academy/${id}/delete`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TradingMembers', 'TradingSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),
  }),
});

export const {
  useVoidGoldMemberMutation,
  useDeleteGoldMemberMutation,
  useGetTradingMembersQuery,
  useGetTradingSummaryQuery,
  useGetTradingEmployeesQuery,
  useAddTradingMemberMutation,
  useCorrectTradingMemberMutation,
  useVoidTradingMemberMutation,
  useDeleteTradingMemberMutation,
  useGetTradingMembersPagedInfiniteQuery,
} = tradingAcademyApi;
