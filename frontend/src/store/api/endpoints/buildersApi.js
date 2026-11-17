// Builders scheme.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getBuildersPlans list — shared by the plain query and its paged variant.
const buildersPlansUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status)     qs.set('status',     params.status);
  if (params.referrerId) qs.set('referrerId', params.referrerId);
  if (params.search)     qs.set('search',     params.search);
  if (params.page)       qs.set('page',       String(params.page));
  if (params.limit)      qs.set('limit',      String(params.limit));
  const q = qs.toString();
  return `/builders/plans${q ? `?${q}` : ''}`;
};

export const buildersApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Builders Scheme ───

    getBuildersPackages: builder.query({
      query: () => '/builders/packages',
      transformResponse: (response) => response.data,
      providesTags: ['BuildersPackages'],
    }),

    updateBuildersPackage: builder.mutation({
      query: ({ packageNumber, ...data }) => ({
        url: `/builders/packages/${packageNumber}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['BuildersPackages'],
    }),

    getChitPackages: builder.query({
      query: () => '/chit/packages',
      transformResponse: (response) => response.data,
      providesTags: ['ChitPackages'],
    }),

    updateChitPackage: builder.mutation({
      query: ({ packageNumber, ...data }) => ({
        url: `/chit/packages/${packageNumber}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['ChitPackages'],
    }),

    getAllGoldCoinPackages: builder.query({
      query: () => '/gold-coin/packages/all',
      transformResponse: (response) => response.data,
      providesTags: ['GoldCoinPackages'],
    }),

    updateGoldCoinPackage: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/gold-coin/packages/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinPackages'],
    }),

    getAllLssPlans: builder.query({
      query: () => '/lss/plans/all',
      transformResponse: (response) => response.data,
      providesTags: ['LssPlans'],
    }),

    updateLssPlan: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/lss/plans/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssPlans'],
    }),

    getBuildersIncentiveRules: builder.query({
      query: () => '/builders/incentive-rules',
      transformResponse: (response) => response.data,
      providesTags: ['BuildersIncentiveRules'],
    }),

    updateBuildersIncentiveRule: builder.mutation({
      query: (data) => ({ url: '/builders/incentive-rules', method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['BuildersIncentiveRules'],
    }),

    getBuildersSummary: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate',   params.endDate);
        const q = qs.toString();
        return `/builders/summary${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['BuildersSummary'],
    }),

    getBuildersPlans: builder.query({
      query: buildersPlansUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['BuildersPlans'],
    }),

    // "Load more" variant of getBuildersPlans: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getBuildersPlansPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(buildersPlansUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['BuildersPlans'],
    }),

    createBuildersPlan: builder.mutation({
      query: (data) => ({ url: '/builders/plans', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      // Bust IncentiveWallet / Incentives so the SO's wallet reflects the one-time credit
      invalidatesTags: ['BuildersPlans', 'BuildersSummary', 'IncentiveWallet', 'Incentives'],
    }),

    getBuildersPlan: builder.query({
      query: (planId) => `/builders/plans/${planId}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, planId) => [{ type: 'BuildersPlan', id: planId }],
    }),

    getBuildersPayouts: builder.query({
      // Accepts either a plain planId string (existing pages) or { planId, branchId }
      // (SchemeCorrectionsPage, where Management passes branchId as a query param).
      query: (arg) => {
        const planId   = typeof arg === 'string' ? arg : arg.planId;
        const branchId = arg?.branchId;
        return `/builders/plans/${planId}/payouts${branchId ? `?branchId=${branchId}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: (result, error, arg) => [{ type: 'BuildersPayouts', id: typeof arg === 'string' ? arg : arg.planId }],
    }),

    recordBuildersPayout: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/payouts`,
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // Bust plan detail + list + summary; also bust Incentives/IncentiveWallet for when
      // commission wiring is added later (harmless now since rate = 0).
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        { type: 'BuildersPayouts', id: planId },
        'BuildersPlans', 'BuildersSummary',
        'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    chooseBuildersReward: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/choice`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary',
      ],
    }),

    completeBuildersPlan: builder.mutation({
      query: (planId) => ({
        url: `/builders/plans/${planId}/complete`,
        method: 'PATCH',
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, planId) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary',
      ],
    }),

    correctBuildersPlan: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary', 'Incentives', 'IncentiveWallet',
      ],
    }),

    correctBuildersPayout: builder.mutation({
      query: ({ planId, payoutId, ...data }) => ({
        url: `/builders/plans/${planId}/payouts/${payoutId}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        { type: 'BuildersPayouts', id: planId },
        'BuildersSummary', 'Incentives', 'IncentiveWallet',
      ],
    }),

    unpayBuildersPayout: builder.mutation({
      query: ({ planId, payoutId, ...data }) => ({
        url: `/builders/plans/${planId}/payouts/${payoutId}/unpay`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        { type: 'BuildersPayouts', id: planId },
        'BuildersSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    voidBuildersPlan: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/void`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    deleteBuildersPlan: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/delete`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary', 'BuildersPayouts', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    changeBuildersReward: builder.mutation({
      query: ({ planId, ...data }) => ({
        url: `/builders/plans/${planId}/change-reward`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { planId }) => [
        { type: 'BuildersPlan', id: planId },
        'BuildersPlans', 'BuildersSummary', 'SchemeBranchEntries',
      ],
    }),
  }),
});

export const {
  useGetBuildersPackagesQuery,
  useUpdateBuildersPackageMutation,
  useGetChitPackagesQuery,
  useUpdateChitPackageMutation,
  useGetAllGoldCoinPackagesQuery,
  useUpdateGoldCoinPackageMutation,
  useGetAllLssPlansQuery,
  useUpdateLssPlanMutation,
  useGetBuildersIncentiveRulesQuery,
  useUpdateBuildersIncentiveRuleMutation,
  useGetBuildersSummaryQuery,
  useGetBuildersPlansQuery,
  useCreateBuildersPlanMutation,
  useGetBuildersPlanQuery,
  useGetBuildersPayoutsQuery,
  useRecordBuildersPayoutMutation,
  useChooseBuildersRewardMutation,
  useCompleteBuildersPlanMutation,
  useCorrectBuildersPlanMutation,
  useCorrectBuildersPayoutMutation,
  useUnpayBuildersPayoutMutation,
  useVoidBuildersPlanMutation,
  useDeleteBuildersPlanMutation,
  useChangeBuildersRewardMutation,
  useGetBuildersPlansPagedInfiniteQuery,
} = buildersApi;
