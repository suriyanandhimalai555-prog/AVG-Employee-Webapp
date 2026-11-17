// Gold Coin scheme.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getGoldCoinRooms list — shared by the plain query and its paged variant.
const goldCoinRoomsUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status)    qs.set('status', params.status);
  if (params.packageId) qs.set('packageId', params.packageId);
  if (params.search)    qs.set('search', params.search);
  // Date range from the SchemeCalendar period picker — filters rooms by first_draw_date.
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate)   qs.set('endDate', params.endDate);
  // branchId is intentionally omitted — server derives scope from JWT identity
  if (params.page)      qs.set('page', String(params.page));
  if (params.limit)     qs.set('limit', String(params.limit));
  const q = qs.toString();
  return `/gold-coin/rooms${q ? `?${q}` : ''}`;
};

export const goldCoinApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Gold Coin Scheme ───
    getGoldCoinPackages: builder.query({
      query: () => '/gold-coin/packages',
      transformResponse: (response) => response.data,
      providesTags: ['GoldCoinPackages'],
    }),

    getGoldCoinRooms: builder.query({
      query: goldCoinRoomsUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['GoldCoinRooms'],
    }),

    // "Load more" variant of getGoldCoinRooms: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getGoldCoinRoomsPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(goldCoinRoomsUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['GoldCoinRooms'],
    }),

    getGoldCoinAwaitingCombine: builder.query({
      query: () => '/gold-coin/rooms/awaiting-combine',
      transformResponse: (response) => response.data,
      providesTags: ['GoldCoinAwaitingCombine'],
    }),

    getGoldCoinRoom: builder.query({
      query: (id) => `/gold-coin/rooms/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (_r, _e, id) => [{ type: 'GoldCoinRoom', id }],
    }),

    getGoldCoinSummary: builder.query({
      query: () => '/gold-coin/summary',
      transformResponse: (response) => response.data,
      providesTags: ['GoldCoinSummary'],
    }),

    addGoldCoinSlot: builder.mutation({
      query: (data) => ({ url: '/gold-coin/slots', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet'],
    }),

    refundGoldCoinSlot: builder.mutation({
      query: (id) => ({ url: `/gold-coin/slots/${id}/refund`, method: 'POST' }),
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary'],
    }),

    activateGoldCoinRoom: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/gold-coin/rooms/${id}/activate`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary'],
    }),

    runGoldCoinDraw: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/gold-coin/rooms/${id}/draws`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary'],
    }),

    undoGoldCoinDraw: builder.mutation({
      query: ({ roomId, drawId, ...body }) => ({ url: `/gold-coin/rooms/${roomId}/draws/${drawId}`, method: 'DELETE', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary'],
    }),

    combineGoldCoinRooms: builder.mutation({
      query: (data) => ({ url: '/gold-coin/rooms/combine', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinSummary', 'GoldCoinAwaitingCombine'],
    }),

    refundGoldCoinRoom: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/gold-coin/rooms/${id}/refund`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'GoldCoinAwaitingCombine'],
    }),

    sendGoldCoinRoomToHeadBranch: builder.mutation({
      query: (id) => ({ url: `/gold-coin/rooms/${id}/send-to-head`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, id) => [
        'GoldCoinRooms',
        { type: 'GoldCoinRoom', id },
        'GoldCoinAwaitingCombine',
        'GoldCoinSummary',
      ],
    }),

    correctGoldCoinSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/slots/${id}/correct`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    voidGoldCoinSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/slots/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteGoldCoinSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/slots/${id}/delete`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteGoldCoinRoom: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/rooms/${id}`, method: 'DELETE', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    voidGoldCoinRoom: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/rooms/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    removeGoldCoinSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/gold-coin/slots/${id}/remove`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),
  }),
});

export const {
  useGetGoldCoinPackagesQuery,
  useGetGoldCoinRoomsQuery,
  useGetGoldCoinRoomQuery,
  useGetGoldCoinSummaryQuery,
  useGetGoldCoinAwaitingCombineQuery,
  useAddGoldCoinSlotMutation,
  useRefundGoldCoinSlotMutation,
  useActivateGoldCoinRoomMutation,
  useRunGoldCoinDrawMutation,
  useUndoGoldCoinDrawMutation,
  useCombineGoldCoinRoomsMutation,
  useRefundGoldCoinRoomMutation,
  useSendGoldCoinRoomToHeadBranchMutation,
  useCorrectGoldCoinSlotMutation,
  useVoidGoldCoinSlotMutation,
  useDeleteGoldCoinSlotMutation,
  useDeleteGoldCoinRoomMutation,
  useVoidGoldCoinRoomMutation,
  useRemoveGoldCoinSlotMutation,
  useGetGoldCoinRoomsPagedInfiniteQuery,
} = goldCoinApi;
