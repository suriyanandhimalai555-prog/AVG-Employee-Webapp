// Land sales, layouts, bookings.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for the getLandBookings list — shared by the plain query and its paged variant.
const landBookingsUrl = (params = {}) => {
  const qs = new URLSearchParams();
  if (params.status)    qs.set('status',    params.status);
  if (params.siteId)    qs.set('siteId',    params.siteId);
  if (params.startDate) qs.set('startDate', params.startDate);
  if (params.endDate)   qs.set('endDate',   params.endDate);
  if (params.page)      qs.set('page',      String(params.page));
  if (params.limit)     qs.set('limit',     String(params.limit));
  const q = qs.toString();
  return `/land/bookings${q ? `?${q}` : ''}`;
};

export const landApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Land Sales Management ───

    getLandDashboard: builder.query({
      query: () => '/land/dashboard',
      transformResponse: (response) => response.data,
      providesTags: ['LandDashboard'],
    }),

    getLandSites: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status) qs.set('status', params.status);
        if (params.page)   qs.set('page',   String(params.page));
        if (params.limit)  qs.set('limit',  String(params.limit));
        const q = qs.toString();
        return `/land/sites${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LandSites'],
    }),

    createLandSite: builder.mutation({
      query: (data) => ({ url: '/land/sites', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LandSites', 'LandDashboard'],
    }),

    getLandSite: builder.query({
      query: (siteId) => `/land/sites/${siteId}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, siteId) => [{ type: 'LandSite', id: siteId }],
    }),

    updateLandSite: builder.mutation({
      query: ({ siteId, ...data }) => ({ url: `/land/sites/${siteId}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId }) => [
        { type: 'LandSite', id: siteId }, 'LandSites',
      ],
    }),

    // ─── Land Layouts ───
    getLandSiteLayouts: builder.query({
      query: (siteId) => `/land/sites/${siteId}/layouts`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, siteId) => [{ type: 'LandLayouts', id: siteId }],
    }),

    createLandLayout: builder.mutation({
      query: ({ siteId, ...data }) => ({ url: `/land/sites/${siteId}/layouts`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId }) => [
        { type: 'LandLayouts', id: siteId }, { type: 'LandSite', id: siteId },
        'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    getLandLayout: builder.query({
      query: (layoutId) => `/land/layouts/${layoutId}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, layoutId) => [{ type: 'LandLayout', id: layoutId }],
    }),

    updateLandLayout: builder.mutation({
      query: ({ layoutId, siteId, ...data }) => ({ url: `/land/layouts/${layoutId}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { layoutId, siteId }) => [
        { type: 'LandLayout', id: layoutId },
        siteId ? { type: 'LandLayouts', id: siteId } : 'LandSites',
        // Site detail page (getLandSite) embeds layout pricing/buyback — refresh it too
        siteId ? { type: 'LandSite', id: siteId } : 'LandSite',
        'LandSites', 'LandDashboard',
      ],
    }),

    createLandLayoutPlot: builder.mutation({
      query: ({ layoutId, ...data }) => ({ url: `/land/layouts/${layoutId}/plots`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      // siteId is required so we can bust LandSite (detail page) and LandLayouts
      // (MCC LandTab dropdown) — both embed plots via json_agg and were invisible
      // after add until refresh because only LandLayout was invalidated before.
      invalidatesTags: (result, error, { layoutId, siteId }) => [
        { type: 'LandLayout', id: layoutId },
        ...(siteId ? [{ type: 'LandSite', id: siteId }, { type: 'LandLayouts', id: siteId }] : []),
        'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    deleteLandPlot: builder.mutation({
      query: ({ plotId }) => ({ url: `/land/plots/${plotId}`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId, layoutId }) => [
        ...(layoutId ? [{ type: 'LandLayout', id: layoutId }] : []),
        ...(siteId ? [{ type: 'LandSite', id: siteId }, { type: 'LandLayouts', id: siteId }] : []),
        'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    deleteLandLayout: builder.mutation({
      query: ({ layoutId }) => ({ url: `/land/layouts/${layoutId}`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { layoutId, siteId }) => [
        { type: 'LandLayout', id: layoutId },
        ...(siteId ? [{ type: 'LandSite', id: siteId }, { type: 'LandLayouts', id: siteId }] : []),
        'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    deleteLandSite: builder.mutation({
      query: ({ siteId }) => ({ url: `/land/sites/${siteId}`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId }) => [
        { type: 'LandSite', id: siteId }, { type: 'LandLayouts', id: siteId },
        'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    getLandLayoutCommissionRules: builder.query({
      query: (layoutId) => `/land/layouts/${layoutId}/commission-rules`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, layoutId) => [{ type: 'LandCommissionRules', id: layoutId }],
    }),

    updateLandLayoutCommissionRule: builder.mutation({
      query: ({ layoutId, ...data }) => ({
        url: `/land/layouts/${layoutId}/commission-rules`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { layoutId }) => [
        { type: 'LandCommissionRules', id: layoutId },
        { type: 'LandLayout', id: layoutId },
      ],
    }),

    getLandEmployees: builder.query({
      // Accepts either a branchId string (for branch_admin) or { branchId } for Management.
      query: (arg) => {
        const branchId = typeof arg === 'string' ? arg : arg?.branchId;
        return `/land/employees${branchId ? `?branchId=${branchId}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['LandEmployees'],
    }),

    createLandPlot: builder.mutation({
      query: ({ siteId, ...data }) => ({ url: `/land/sites/${siteId}/plots`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId }) => [
        { type: 'LandSite', id: siteId }, 'LandSites', 'LandPlots', 'LandDashboard',
      ],
    }),

    getLandPlots: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status)   qs.set('status',   params.status);
        if (params.layoutId) qs.set('layoutId', params.layoutId);
        if (params.page)     qs.set('page',     String(params.page));
        if (params.limit)    qs.set('limit',    String(params.limit));
        const q = qs.toString();
        return `/land/plots${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LandPlots'],
    }),

    updateLandPlot: builder.mutation({
      query: ({ plotId, siteId, ...data }) => ({ url: `/land/plots/${plotId}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { siteId }) => [
        'LandPlots', 'LandSites', siteId ? { type: 'LandSite', id: siteId } : 'LandSite', 'LandDashboard',
      ],
    }),

    getLandBookings: builder.query({
      query: landBookingsUrl,
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LandBookings'],
    }),

    // "Load more" variant of getLandBookings: one page per request, pages kept together in
    // the cache (see ../pagedList.js). Read it with the usePagedList hook.
    getLandBookingsPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(landBookingsUrl),
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['LandBookings'],
    }),

    getLandBookingRefAvailability: builder.query({
      query: (branchId) => `/land/bookings/ref-availability${branchId ? `?branchId=${branchId}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['LandBookingRefs'],
    }),

    createLandBooking: builder.mutation({
      query: (data) => ({ url: '/land/bookings', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['LandBookings', 'LandPlots', 'LandDashboard', 'LandBookingRefs'],
    }),

    getLandBooking: builder.query({
      query: (id) => `/land/bookings/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'LandBooking', id }],
    }),

    recordLandAdvance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/advance`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard',
      ],
    }),

    recordLandFullPayment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/full-payment`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, { type: 'LandBuyback', id },
        'LandBookings', 'LandDashboard',
      ],
    }),

    extendLandDeadline: builder.mutation({
      query: (id) => ({ url: `/land/bookings/${id}/extend-deadline`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, id) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard',
      ],
    }),

    cancelLandBooking: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/cancel`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      // Incentive tags added: cancel now claws back referrer's spot commission on
      // the backend (mirrors voidBooking/deleteBooking), so wallet views must refresh.
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandPlots', 'LandDashboard',
        'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    getLandBuyback: builder.query({
      query: (id) => `/land/bookings/${id}/buyback`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'LandBuyback', id }],
    }),

    markLandPayoutPaid: builder.mutation({
      query: ({ id, month, ...data }) => ({
        url: `/land/bookings/${id}/buyback/${month}`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBuyback', id }, { type: 'LandBooking', id },
        'LandBookings', 'LandDashboard',
      ],
    }),

    correctLandBooking: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/correct`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      // LandBuyback: a fullPaymentDate correction shifts pending payout due dates;
      // Incentives/IncentiveWallet: a referrer change claws back + re-credits.
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, { type: 'LandBuyback', id },
        'LandBookings', 'LandDashboard', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    unpayLandPayout: builder.mutation({
      query: ({ id, month, ...data }) => ({
        url: `/land/bookings/${id}/buyback/${month}/unpay`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // LandPlots: unpaying the last month of a completed booking flips the plot back to 'booked'
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBuyback', id }, { type: 'LandBooking', id },
        'LandBookings', 'LandPlots', 'LandDashboard', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    undoLandFullPayment: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/undo-full-payment`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBuyback', id }, { type: 'LandBooking', id },
        'LandBookings', 'LandPlots', 'LandDashboard', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    undoLandAdvance: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/undo-advance`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard', 'SchemeBranchEntries',
      ],
    }),

    voidLandBooking: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/void`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      // Incentive tags added: void reverses commissions on the backend but the
      // old tags omitted 'Incentives'/'IncentiveWallet' — wallet views now refresh.
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard', 'LandSites',
        'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    deleteLandBooking: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/land/bookings/${id}/delete`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard', 'LandPlots', 'LandSites', 'Incentives', 'IncentiveWallet', 'SchemeBranchEntries',
      ],
    }),

    getSchemeAuditLog: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        Object.entries(params).forEach(([k, v]) => { if (v) qs.set(k, String(v)); });
        const q = qs.toString();
        return `/schemes/audit${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['SchemeBranchEntries'],
    }),
  }),
});

export const {
  useGetLandDashboardQuery,
  useGetLandSitesQuery,
  useCreateLandSiteMutation,
  useGetLandSiteQuery,
  useUpdateLandSiteMutation,
  useGetLandSiteLayoutsQuery,
  useCreateLandLayoutMutation,
  useGetLandLayoutQuery,
  useUpdateLandLayoutMutation,
  useCreateLandLayoutPlotMutation,
  useGetLandLayoutCommissionRulesQuery,
  useUpdateLandLayoutCommissionRuleMutation,
  useGetLandEmployeesQuery,
  useCreateLandPlotMutation,
  useGetLandPlotsQuery,
  useUpdateLandPlotMutation,
  useGetLandBookingsQuery,
  useGetLandBookingRefAvailabilityQuery,
  useCreateLandBookingMutation,
  useGetLandBookingQuery,
  useRecordLandAdvanceMutation,
  useRecordLandFullPaymentMutation,
  useExtendLandDeadlineMutation,
  useCancelLandBookingMutation,
  useGetLandBuybackQuery,
  useMarkLandPayoutPaidMutation,
  useDeleteLandPlotMutation,
  useDeleteLandLayoutMutation,
  useDeleteLandSiteMutation,
  useCorrectLandBookingMutation,
  useVoidLandBookingMutation,
  useDeleteLandBookingMutation,
  useUnpayLandPayoutMutation,
  useUndoLandFullPaymentMutation,
  useUndoLandAdvanceMutation,
  useGetSchemeAuditLogQuery,
  useGetLandBookingsPagedInfiniteQuery,
} = landApi;
