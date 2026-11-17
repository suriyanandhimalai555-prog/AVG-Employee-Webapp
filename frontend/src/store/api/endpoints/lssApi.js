// LSS scheme.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getLssRooms list — shared by the plain query and its paged variant.
const lssRoomsUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status)    qs.set('status', params.status);
  if (params.planId)    qs.set('planId', params.planId);
  if (params.search)    qs.set('search', params.search);
  // Date range from the SchemeCalendar period picker — filters rooms by first_draw_date.
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate)   qs.set('endDate', params.endDate);
  if (params.page)      qs.set('page', String(params.page));
  if (params.limit)     qs.set('limit', String(params.limit));
  const q = qs.toString();
  return `/lss/rooms${q ? `?${q}` : ''}`;
};

export const lssApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── LSS scheme ───────────────────────────────────────────────────────

    getLssPlans: builder.query({
      query: () => '/lss/plans',
      transformResponse: (response) => response.data,
      providesTags: ['LssPlans'],
    }),

    getLssRooms: builder.query({
      query: lssRoomsUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LssRooms'],
    }),

    // "Load more" variant of getLssRooms: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getLssRoomsPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(lssRoomsUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LssRooms'],
    }),

    getLssAwaitingCombine: builder.query({
      query: () => '/lss/rooms/awaiting-combine',
      transformResponse: (response) => response.data,
      providesTags: ['LssAwaitingCombine'],
    }),

    getLssRoom: builder.query({
      query: (id) => `/lss/rooms/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (_r, _e, id) => [{ type: 'LssRoom', id }],
    }),

    getLssSummary: builder.query({
      query: () => '/lss/summary',
      transformResponse: (response) => response.data,
      providesTags: ['LssSummary'],
    }),

    addLssSlot: builder.mutation({
      query: (data) => ({ url: '/lss/slots', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssSummary', 'Incentives', 'IncentiveWallet'],
    }),

    refundLssSlot: builder.mutation({
      query: (id) => ({ url: `/lss/slots/${id}/refund`, method: 'POST' }),
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary'],
    }),

    activateLssRoom: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/lss/rooms/${id}/activate`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary'],
    }),

    runLssDraw: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/lss/rooms/${id}/draws`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary'],
    }),

    undoLssDraw: builder.mutation({
      query: ({ roomId, drawId, ...body }) => ({ url: `/lss/rooms/${roomId}/draws/${drawId}`, method: 'DELETE', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary'],
    }),

    combineLssRooms: builder.mutation({
      query: (data) => ({ url: '/lss/rooms/combine', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssSummary', 'LssAwaitingCombine'],
    }),

    refundLssRoom: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/lss/rooms/${id}/refund`, method: 'POST', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'LssAwaitingCombine'],
    }),

    sendLssRoomToHeadBranch: builder.mutation({
      query: (id) => ({ url: `/lss/rooms/${id}/send-to-head`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, id) => [
        'LssRooms',
        { type: 'LssRoom', id },
        'LssAwaitingCombine',
        'LssSummary',
      ],
    }),

    correctLssSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/slots/${id}/correct`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    voidLssSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/slots/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteLssSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/slots/${id}/delete`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    voidLssRoom: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/rooms/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    deleteLssRoom: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/rooms/${id}`, method: 'DELETE', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'LssAwaitingCombine', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    removeLssSlot: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/slots/${id}/remove`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LssRooms', 'LssRoom', 'LssSummary', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries'],
    }),

    // Update the date of a specific draw (admin correction, no incentive impact)
    updateLssDrawDate: builder.mutation({
      query: ({ roomId, drawId, ...data }) => ({ url: `/lss/rooms/${roomId}/draws/${drawId}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (_r, _e, { roomId }) => ['LssRooms', { type: 'LssRoom', id: roomId }],
    }),

    // Update room-level dates: created_at, fill_deadline, first_draw_date (admin correction)
    updateLssRoomDates: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/lss/rooms/${id}/dates`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (_r, _e, { id }) => ['LssRooms', { type: 'LssRoom', id }],
    }),
  }),
});

export const {
  useGetLssPlansQuery,
  useGetLssRoomsQuery,
  useGetLssRoomQuery,
  useGetLssSummaryQuery,
  useGetLssAwaitingCombineQuery,
  useAddLssSlotMutation,
  useRefundLssSlotMutation,
  useActivateLssRoomMutation,
  useRunLssDrawMutation,
  useUndoLssDrawMutation,
  useCombineLssRoomsMutation,
  useRefundLssRoomMutation,
  useSendLssRoomToHeadBranchMutation,
  useCorrectLssSlotMutation,
  useVoidLssSlotMutation,
  useDeleteLssSlotMutation,
  useVoidLssRoomMutation,
  useDeleteLssRoomMutation,
  useRemoveLssSlotMutation,
  useUpdateLssDrawDateMutation,
  useUpdateLssRoomDatesMutation,
  useGetLssRoomsPagedInfiniteQuery,
} = lssApi;
