// Incentive wallet, commission rules, branch incentive overview.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const incentivesApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Incentive Wallet & Commission Rules ───

    getCommissionRules: builder.query({
      query: (projectId) => projectId ? `/incentives/rules/${projectId}` : '/incentives/rules',
      transformResponse: (response) => response.data,
      providesTags: ['CommissionRules'],
    }),

    setCommissionRule: builder.mutation({
      query: (data) => ({ url: '/incentives/rules', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['CommissionRules'],
    }),

    distributeIncentives: builder.mutation({
      query: (data) => ({ url: '/incentives/distribute', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Incentives', 'IncentiveWallet'],
    }),

    getIncentiveWallet: builder.query({
      query: (params = {}) => {
        const base = params?.userId ? `/incentives/wallet/${params.userId}` : '/incentives/wallet';
        const qs = new URLSearchParams();
        if (params?.startDate) qs.set('startDate', params.startDate);
        if (params?.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `${base}${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['IncentiveWallet'],
    }),

    getIncentives: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.userId)     qs.set('userId', params.userId);
        if (params.sourceType) qs.set('sourceType', params.sourceType);
        if (params.page)       qs.set('page', String(params.page));
        if (params.limit)      qs.set('limit', String(params.limit));
        if (params.startDate)  qs.set('startDate', params.startDate);
        if (params.endDate)    qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/incentives${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['Incentives'],
    }),

    addIncentive: builder.mutation({
      query: (data) => ({ url: '/incentives', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Incentives', 'IncentiveWallet'],
    }),

    // ─── Branch Incentive Overview (MD + Management) ───

    // Level 1: all branches with incentive totals for the period (or all time).
    getBranchIncentiveRollup: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/incentives/branch-rollup${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['BranchIncentives'],
    }),

    // Level 2: employees in a branch with their incentive totals.
    getBranchPeopleIncentives: builder.query({
      query: ({ branchId, ...params }) => {
        const qs = new URLSearchParams();
        if (params.startDate)          qs.set('startDate', params.startDate);
        if (params.endDate)            qs.set('endDate', params.endDate);
        if (params.onlyWithIncentives) qs.set('onlyWithIncentives', 'true');
        const q = qs.toString();
        return `/incentives/branch-rollup/${branchId}/people${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['BranchIncentives'],
    }),

    // Level 3: individual incentive rows for one employee inside a branch.
    getEmployeeIncentiveDetail: builder.query({
      query: ({ branchId, userId, ...params }) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/incentives/branch-rollup/${branchId}/people/${userId}${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['BranchIncentives'],
    }),
  }),
});

export const {
  useGetCommissionRulesQuery,
  useSetCommissionRuleMutation,
  useDistributeIncentivesMutation,
  useGetIncentiveWalletQuery,
  useGetIncentivesQuery,
  useAddIncentiveMutation,
  useGetBranchIncentiveRollupQuery,
  useGetBranchPeopleIncentivesQuery,
  useGetEmployeeIncentiveDetailQuery,
} = incentivesApi;
