// Transactions and the Money module.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const moneyApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Transactions (Expenses, Reimbursements, etc.) ───
    getTransactions: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/transactions${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Transactions'],
    }),

    createTransaction: builder.mutation({
      query: (data) => ({
        url: '/transactions',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Transactions'],
    }),

    updateTransactionStatus: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/transactions/${id}/status`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Transactions'],
    }),

    // ─── Money Module ───
    createMoneyProject: builder.mutation({
      query: (data) => ({ url: '/money/projects', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyProjects'],
    }),

    getMoneyProjects: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money/projects${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyProjects'],
    }),

    updateMoneyProject: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/money/projects/${id}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyProjects'],
    }),

    submitMoneyCollection: builder.mutation({
      query: (data) => ({ url: '/money', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections'],
    }),

    verifyMoneyCollection: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/money/${id}/verify`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections'],
    }),

    getMoneyCollections: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections'],
    }),

    getMoneyUploadUrl: builder.mutation({
      query: ({ contentType = 'image/jpeg', mode = 'gpay' }) => ({
        url: `/money/upload-url?contentType=${encodeURIComponent(contentType)}&mode=${encodeURIComponent(mode)}`,
        method: 'GET',
      }),
      transformResponse: (response) => response.data,
    }),

    getMoneyPhotoUrl: builder.query({
      query: (key) => `/money/photo-url?key=${encodeURIComponent(key)}`,
      transformResponse: (response) => response.data,
    }),

    getMoneyWallet: builder.query({
      query: () => '/money/wallet',
      transformResponse: (response) => response.data,
      providesTags: ['MoneyWallet'],
    }),

    transferMoney: builder.mutation({
      query: (data) => ({ url: '/money/transfer', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyWallet', 'MoneyCollections'],
    }),

    getMoneySources: builder.query({
      query: (id) => `/money/${id}/sources`,
      transformResponse: (response) => response.data,
    }),

    getMoneyAdminOverview: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/money/admin/overview${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections', 'MoneyWallet'],
    }),

    getMoneyBranchDrilldown: builder.query({
      query: (branchId) => `/money/admin/branch/${branchId}`,
      transformResponse: (response) => response.data,
    }),

    getCashHolderDetail: builder.query({
      query: (holderId) => `/money/admin/holders/${holderId}`,
      transformResponse: (response) => response.data,
    }),

    getBranchRankings: builder.query({
      query: ({ startDate, endDate } = {}) => {
        const qs = new URLSearchParams();
        if (startDate) qs.set('startDate', startDate);
        if (endDate) qs.set('endDate', endDate);
        const q = qs.toString();
        return `/money/admin/rankings${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['MoneyCollections'],
    }),

    mdAddCollectionEntry: builder.mutation({
      query: (data) => ({ url: '/money/admin/entry', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MoneyCollections', 'MoneyWallet'],
    }),
  }),
});

export const {
  useGetTransactionsQuery,
  useCreateTransactionMutation,
  useUpdateTransactionStatusMutation,
  useCreateMoneyProjectMutation,
  useUpdateMoneyProjectMutation,
  useGetMoneyProjectsQuery,
  useSubmitMoneyCollectionMutation,
  useVerifyMoneyCollectionMutation,
  useGetMoneyCollectionsQuery,
  useGetMoneyUploadUrlMutation,
  useGetMoneyPhotoUrlQuery,
  useGetMoneyWalletQuery,
  useTransferMoneyMutation,
  useGetMoneySourcesQuery,
  useGetMoneyAdminOverviewQuery,
  useGetMoneyBranchDrilldownQuery,
  useGetCashHolderDetailQuery,
  useGetBranchRankingsQuery,
  useMdAddCollectionEntryMutation,
} = moneyApi;
