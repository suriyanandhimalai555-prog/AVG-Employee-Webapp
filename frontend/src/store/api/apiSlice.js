// frontend/src/store/api/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

//const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const API_URL = import.meta.env.DEV? 'http://localhost:3001/api': '/api';
const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: (headers, { getState }) => {
    const token = getState().auth.token;
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  },
});

// Intercept 401 from any endpoint and clear auth state so ProtectedLayout
// redirects to /login. Cannot import clearCredentials directly here because
// authSlice.js already imports apiSlice (circular dep) — dispatch by string type instead.
const baseQueryWithReauth = async (args, api, extraOptions) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    api.dispatch({ type: 'auth/clearCredentials' });
  }
  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Attendance', 'Summary', 'Employees', 'Branches', 'Transactions', 'Users', 'MoneyProjects', 'MoneyCollections', 'MoneyWallet', 'UserDocuments', 'GoldMembers', 'GoldSummary', 'GoldEmployees', 'GoldPayments', 'Incentives', 'IncentiveWallet', 'CommissionRules', 'Salaries', 'TradingMembers', 'TradingSummary', 'Customers', 'GoldCoinPackages', 'GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'GoldCoinAwaitingCombine', 'LssPlans', 'LssRooms', 'LssRoom', 'LssSummary', 'LssAwaitingCombine', 'SchemesOverview', 'SchemeBranchEntries', 'ChitGroups', 'ChitGroup', 'ChitSummary', 'ChitPayments', 'ChitEligible', 'ChitAwaitingCombine', 'BuildersPlans', 'BuildersPlan', 'BuildersSummary', 'BuildersPackages', 'BuildersPayouts', 'BuildersIncentiveRules', 'ChitPackages', 'LandSites', 'LandSite', 'LandPlots', 'LandCustomers', 'LandBookings', 'LandBooking', 'LandBuyback', 'LandDashboard', 'LandLayouts', 'LandLayout', 'LandCommissionRules', 'LandEmployees', 'LandBookingRefs', 'AppSettings', 'PendingEnrollments', 'DailyReconciliation', 'MobileAppVersion', 'TransferRequests'],
  endpoints: (builder) => ({

    // ─── Auth ───
    login: builder.mutation({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      transformResponse: (response) => response.data,
    }),

    getMe: builder.query({
      query: () => '/auth/me',
      transformResponse: (response) => response.data,
    }),

    logout: builder.mutation({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
    }),

    getProfileUploadUrl: builder.mutation({
      query: ({ kind, contentType }) => ({
        url: '/users/upload-url',
        params: { kind, contentType }
      }),
      transformResponse: (response) => response.data,
    }),

    getMyDocuments: builder.query({
      query: () => '/users/me/documents',
      providesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    addDocument: builder.mutation({
      query: (body) => ({
        url: '/users/me/documents',
        method: 'POST',
        body
      }),
      invalidatesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    deleteDocument: builder.mutation({
      query: (id) => ({
        url: `/users/me/documents/${id}`,
        method: 'DELETE'
      }),
      invalidatesTags: ['UserDocuments'],
      transformResponse: (response) => response.data,
    }),

    getUserDocuments: builder.query({
      query: (id) => `/users/${id}/documents`,
      providesTags: (result, error, id) => [{ type: 'UserDocuments', id }],
      transformResponse: (response) => response.data,
    }),

    getDeactivatedUsers: builder.query({
      query: () => '/users/deactivated',
      providesTags: ['DeactivatedUsers'],
      transformResponse: (response) => response.data,
    }),

    reactivateUser: builder.mutation({
      query: (id) => ({ url: `/users/${id}/reactivate`, method: 'POST' }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['DeactivatedUsers', 'Users'],
    }),

    updateProfileAssets: builder.mutation({
      query: (data) => ({
        url: '/auth/profile-assets',
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // ─── Attendance (Employee) ───
    // Mutation (not query) so RTK Query never caches the result.
    // Presigned PUT URLs expire in 300s — a cached URL could be stale and cause silent upload failures.
    getUploadUrl: builder.mutation({
      query: (contentType = 'image/jpeg') => ({
        url: `/attendance/upload-url?contentType=${encodeURIComponent(contentType)}`,
        method: 'GET',
      }),
      transformResponse: (response) => response.data,
    }),
    
    getPhotoUrl: builder.query({
      // Key is passed as query param — the key contains slashes which would
      // break path-segment routing (e.g. attendance/userId/timestamp.jpg)
      query: (key) => `/attendance/photo-url?key=${encodeURIComponent(key)}`,
      transformResponse: (response) => response.data,
    }),
    submitAttendance: builder.mutation({
      query: (data) => ({
        url: '/attendance',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // No invalidatesTags here — the API returns 202 (queued, not yet in DB).
      // Cache invalidation happens via useAttendanceSocket when the worker confirms
      // attendance:confirmed over Socket.io. A 5-second fallback in useCheckIn covers
      // cases where the socket is unavailable.
    }),

    // viewerId is not sent to the server — it scopes the RTK cache per logged-in user (avoids stale data after account switch).
    getSummary: builder.query({
      query: ({ viewerId: _viewerId, date } = {}) => {
        const qs = new URLSearchParams();
        if (date) qs.set('date', date);
        const suffix = qs.toString() ? `?${qs}` : '';
        return `/attendance/summary${suffix}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Summary'],
    }),

    getHistory: builder.query({
      query: ({ userId, month, year }) =>
        `/attendance/${userId}/history?month=${month}&year=${year}`,
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // Aggregated team calendar — returns TeamHistoryDay[] (per-date counts, not single rows)
    // Used by manager/admin roles so the calendar shows team activity, not just their own record
    getTeamHistory: builder.query({
      query: ({ month, year }) =>
        `/attendance/team-history?month=${month}&year=${year}`,
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // ─── Admin ───
    getEmployees: builder.query({
      // viewerId is not sent — it scopes the RTK cache key so two logged-in users don't share data
      query: ({ viewerId: _viewerId, page = 1, limit = 50, search, branchId, role } = {}) => {
        const qs = new URLSearchParams();
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        if (search) qs.set('search', search);
        if (branchId) qs.set('branchId', branchId);
        if (role) qs.set('role', role);
        return `/attendance/employees?${qs}`;
      },
      // Response shape: { data: [], total, page, limit, totalPages }
      transformResponse: (response) => response.data,
      providesTags: ['Employees'],
    }),

    getAttendanceList: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return `/attendance${qs ? `?${qs}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['Attendance'],
    }),

    // Employee self-marks absent — synchronous (200, not 202) since absent needs no photo/GPS
    selfAbsent: builder.mutation({
      query: (data = {}) => ({
        url: '/attendance/self-absent',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Summary', 'Attendance', 'Employees'],
    }),

    adminMark: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-mark',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // Returns 202 (queued) — cache invalidation happens via useAttendanceSocket
      // on attendance:confirmed. Invalidating immediately causes stale-cache flicker
      // because the worker hasn't written to DB yet.
    }),

    // Employee self sign-off (clock-out) — returns 202 like submitAttendance
    // Cache invalidation happens via useAttendanceSocket on signoff:confirmed
    submitSignOff: builder.mutation({
      query: (data) => ({
        url: '/attendance/sign-off',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      // Socket pushes the canonical update, but invalidate as a safety net so the
      // history view refreshes even when the socket connection is degraded.
      invalidatesTags: ['Attendance', 'Summary'],
    }),

    // Admin sign-off on behalf of a no-smartphone employee
    adminSignOff: builder.mutation({
      query: (data) => ({
        url: '/attendance/admin-sign-off',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary'],
    }),

    adminCorrect: builder.mutation({
      query: ({ id, ...data }) => ({
        url: `/attendance/${id}/correct`,
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Attendance', 'Summary', 'Employees'],
    }),

    // ─── Branches ───
    getBranches: builder.query({
      query: () => '/branches',
      transformResponse: (response) => response.data,
      providesTags: ['Branches'],
      // Match the 10-min server Redis cache — no re-fetch within 10 min
      keepUnusedDataFor: 600,
    }),

    createBranch: builder.mutation({
      query: (data) => ({ url: '/branches', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    updateBranch: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/branches/${id}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    deleteBranch: builder.mutation({
      query: (id) => ({ url: `/branches/${id}`, method: 'DELETE' }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

    // Sets (or clears) the geofence coordinates for a branch. Management only.
    // Pass latitude:null / longitude:null to clear the geofence.
    setBranchLocation: builder.mutation({
      query: ({ id, ...body }) => ({ url: `/branches/${id}/location`, method: 'PUT', body }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

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

    // ─── Gold Savings Scheme ───

    getGoldMembers: builder.query({
      query: (params = {}) => {
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
      },
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

    // ─── Trading Academy Scheme ───

    getTradingMembers: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.search)    qs.set('search', params.search);
        if (params.page)      qs.set('page', String(params.page));
        if (params.limit)     qs.set('limit', String(params.limit));
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate', params.endDate);
        const q = qs.toString();
        return `/trading-academy${q ? `?${q}` : ''}`;
      },
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

    // ─── Gold Coin Scheme ───
    getGoldCoinPackages: builder.query({
      query: () => '/gold-coin/packages',
      transformResponse: (response) => response.data,
      providesTags: ['GoldCoinPackages'],
    }),

    getGoldCoinRooms: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status)    qs.set('status', params.status);
        if (params.packageId) qs.set('packageId', params.packageId);
        if (params.search)    qs.set('search', params.search);
        // branchId is intentionally omitted — server derives scope from JWT identity
        if (params.page)      qs.set('page', String(params.page));
        if (params.limit)     qs.set('limit', String(params.limit));
        const q = qs.toString();
        return `/gold-coin/rooms${q ? `?${q}` : ''}`;
      },
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

    // ─── LSS scheme ───────────────────────────────────────────────────────

    getLssPlans: builder.query({
      query: () => '/lss/plans',
      transformResponse: (response) => response.data,
      providesTags: ['LssPlans'],
    }),

    getLssRooms: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status)  qs.set('status', params.status);
        if (params.planId)  qs.set('planId', params.planId);
        if (params.search)  qs.set('search', params.search);
        if (params.page)    qs.set('page', String(params.page));
        if (params.limit)   qs.set('limit', String(params.limit));
        const q = qs.toString();
        return `/lss/rooms${q ? `?${q}` : ''}`;
      },
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

    // ─── Cross-scheme dashboard (MD / Director) ───
    // Backed by /api/schemes/* which walks the SchemeService registry. Every
    // scheme that implements getOverviewByBranch shows up here automatically.

    getSchemesOverview: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate',   params.endDate);
        const q = qs.toString();
        return `/schemes/overview${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['SchemesOverview'],
    }),

    getSchemeDailyCollection: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.date)     qs.set('date',     params.date);
        if (params.branchId) qs.set('branchId', params.branchId);
        const q = qs.toString();
        return `/schemes/daily-collection${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['SchemeDailyCollection'],
    }),

    getSchemeDailyCollectionByScheme: builder.query({
      query: ({ date, branchId }) => {
        const qs = new URLSearchParams({ branchId });
        if (date) qs.set('date', date);
        return `/schemes/daily-collection-by-scheme?${qs.toString()}`;
      },
      transformResponse: (response) => response.data,
      providesTags: ['SchemeDailyCollection'],
    }),

    getSchemeBranchEntries: builder.query({
      query: ({ code, branchId, startDate, endDate }) => {
        const qs = new URLSearchParams();
        if (startDate) qs.set('startDate', startDate);
        if (endDate)   qs.set('endDate',   endDate);
        const q = qs.toString();
        return `/schemes/${code}/branches/${branchId}/entries${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => response.data,
      providesTags: (_r, _e, { code, branchId }) => [
        { type: 'SchemeBranchEntries', id: `${code}:${branchId}` },
      ],
    }),

    // ─── Customers ───

    searchCustomers: builder.query({
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.search)   qs.set('search',   params.search);
        if (params.page)     qs.set('page',     String(params.page));
        if (params.limit)    qs.set('limit',    String(params.limit));
        // management passes branchId explicitly — server uses it for scoping
        if (params.branchId) qs.set('branchId', params.branchId);
        const q = qs.toString();
        return `/customers${q ? `?${q}` : ''}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: ['Customers'],
    }),

    createCustomer: builder.mutation({
      query: (data) => ({ url: '/customers', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Customers'],
    }),

    getCustomer: builder.query({
      query: (id) => `/customers/${id}`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, id) => [{ type: 'Customers', id }],
    }),

    // ─── Salary Management ───

    getCurrentSalary: builder.query({
      query: (userId) => userId ? `/salaries/${userId}` : '/salaries/me',
      transformResponse: (response) => response.data,
      providesTags: (result, error, userId) => [{ type: 'Salaries', id: userId || 'me' }],
    }),

    getSalaryHistory: builder.query({
      query: ({ userId, page = 1, limit = 50 }) => {
        const qs = new URLSearchParams({ page: String(page), limit: String(limit) });
        return `/salaries/${userId}/history?${qs}`;
      },
      transformResponse: (response) => ({ data: response.data, total: response.total }),
      providesTags: (result, error, { userId }) => [{ type: 'Salaries', id: userId }],
    }),

    setSalary: builder.mutation({
      query: (data) => ({ url: '/salaries', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Salaries'],
    }),

    setSalaryByRole: builder.mutation({
      query: (data) => ({ url: '/salaries/by-role', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Salaries'],
    }),

    // ─── User Management (Staff & Admins) ───
    getUserSuperiors: builder.query({
      query: () => '/users/superiors',
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getUsers: builder.query({
      query: (params = {}) => {
        const { viewerId: _viewerId, role, branchId, search, page = 1, limit = 50 } = params;
        const qs = new URLSearchParams();
        if (role) qs.set('role', role);
        if (branchId) qs.set('branchId', branchId);
        if (search) qs.set('search', search);
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        return `/users?${qs}`;
      },
      // Response shape: { data: [], total, page, limit, totalPages }
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getUserById: builder.query({
      query: (userId) => `/users/${userId}`,
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    getManagerOptions: builder.query({
      query: (roles) => `/users/manager-options?roles=${Array.isArray(roles) ? roles.join(',') : roles}`,
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    createUser: builder.mutation({
      query: (data) => ({
        url: '/users',
        method: 'POST',
        body: data,
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // Returns { branchIds: string[] } for a Director or GM. MD only.
    getUserOversightBranches: builder.query({
      query: (userId) => `/users/${userId}/oversight-branches`,
      transformResponse: (response) => response.data,
      providesTags: ['Users'],
    }),

    // Replaces oversight assignments for Director/GM. MD only.
    updateUserOversightBranches: builder.mutation({
      query: ({ id, branchIds = [], gmIds = [] }) => ({
        url: `/users/${id}/oversight-branches`,
        method: 'PATCH',
        body: { branchIds, gmIds },
      }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Users'],
    }),

    // Change password — requires current password, available to all authenticated users.
    changePassword: builder.mutation({
      query: (data) => ({
        url: '/auth/change-password',
        method: 'PATCH',
        body: data,
      }),
      transformResponse: (response) => response.data,
    }),

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
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status) qs.set('status', params.status);
        if (params.search) qs.set('search', params.search);
        if (params.page)   qs.set('page',   String(params.page));
        if (params.limit)  qs.set('limit',  String(params.limit));
        const q = qs.toString();
        return `/chit/groups${q ? `?${q}` : ''}`;
      },
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
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status)     qs.set('status',     params.status);
        if (params.referrerId) qs.set('referrerId', params.referrerId);
        if (params.search)     qs.set('search',     params.search);
        if (params.page)       qs.set('page',       String(params.page));
        if (params.limit)      qs.set('limit',      String(params.limit));
        const q = qs.toString();
        return `/builders/plans${q ? `?${q}` : ''}`;
      },
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
      invalidatesTags: (result, error, { layoutId }) => [
        { type: 'LandLayout', id: layoutId }, 'LandPlots', 'LandDashboard',
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
      query: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.status)    qs.set('status',    params.status);
        if (params.siteId)    qs.set('siteId',    params.siteId);
        if (params.startDate) qs.set('startDate', params.startDate);
        if (params.endDate)   qs.set('endDate',   params.endDate);
        if (params.page)      qs.set('page',      String(params.page));
        if (params.limit)     qs.set('limit',     String(params.limit));
        const q = qs.toString();
        return `/land/bookings${q ? `?${q}` : ''}`;
      },
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
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandPlots', 'LandDashboard',
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
      invalidatesTags: (result, error, { id }) => [
        { type: 'LandBooking', id }, 'LandBookings', 'LandDashboard', 'LandSites', 'SchemeBranchEntries',
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

    // ─── Customer update (PATCH — for toggling has_whatsapp on existing customers) ───
    updateCustomer: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/customers/${id}`, method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      // Patch the updated row into every cached customer list instead of
      // invalidating ['Customers'] — a toggle changes one row, so refetching
      // whole lists per click wastes a request and leaves a stale-read window
      // (a rapid second toggle would resend the old value). Using the server's
      // returned row also picks up its normalisation (trim, '' → null).
      async onQueryStarted({ id }, { dispatch, getState, queryFulfilled }) {
        try {
          const { data: updated } = await queryFulfilled;
          for (const args of apiSlice.util.selectCachedArgsForQuery(getState(), 'searchCustomers')) {
            dispatch(apiSlice.util.updateQueryData('searchCustomers', args, (draft) => {
              const row = (draft.data || []).find((c) => c.id === id);
              if (row) Object.assign(row, updated);
            }));
          }
          // Keep the single-customer cache (detail page) in sync too.
          dispatch(apiSlice.util.updateQueryData('getCustomer', id, (draft) => {
            Object.assign(draft, updated);
          }));
        } catch {
          // Mutation failed — caches were never touched, nothing to roll back.
        }
      },
    }),

    // ─── App Settings (backdated-entry permission) ───
    getBackdatedEntrySetting: builder.query({
      query: () => '/settings/backdated-entry',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateBackdatedEntrySetting: builder.mutation({
      query: (data) => ({ url: '/settings/backdated-entry', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // ─── App Settings (WhatsApp messages — management toggle) ───
    getWhatsappMessagesSetting: builder.query({
      query: () => '/settings/whatsapp-messages',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateWhatsappMessagesSetting: builder.mutation({
      query: (data) => ({ url: '/settings/whatsapp-messages', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // ─── App Settings (LSS eligibility bypass — management toggle) ───
    getLssEligibilityBypassSetting: builder.query({
      query: () => '/settings/lss-eligibility-bypass',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateLssEligibilityBypassSetting: builder.mutation({
      query: (data) => ({ url: '/settings/lss-eligibility-bypass', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // ─── App Settings (Gold-Coin eligibility bypass — management toggle) ───
    getGoldCoinEligibilityBypassSetting: builder.query({
      query: () => '/settings/gold-coin-eligibility-bypass',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateGoldCoinEligibilityBypassSetting: builder.mutation({
      query: (data) => ({ url: '/settings/gold-coin-eligibility-bypass', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // ─── App Settings (Daily collection reconciliation — management toggle) ───
    getDailyCollectionReconciliationSetting: builder.query({
      query: () => '/settings/daily-collection-reconciliation',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateDailyCollectionReconciliationSetting: builder.mutation({
      query: (data) => ({ url: '/settings/daily-collection-reconciliation', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // Auto-deactivation: master switch + absence threshold (days). Management only for PUT.
    // Returns { enabled, thresholdDays }.
    getAutoDeactivationSetting: builder.query({
      query: () => '/settings/auto-deactivation',
      transformResponse: (response) => response.data,
      providesTags: ['AppSettings'],
    }),

    updateAutoDeactivationSetting: builder.mutation({
      query: (data) => ({ url: '/settings/auto-deactivation', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['AppSettings'],
    }),

    // ─── Daily Collection Reconciliation ───
    // GET /reconciliation/summary/today?branchId=
    getTodayCollectionSummary: builder.query({
      query: (branchId) => `/reconciliation/summary/today${branchId ? `?branchId=${branchId}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),

    // POST /reconciliation/summary
    submitDailyCollectionSummary: builder.mutation({
      query: (data) => ({ url: '/reconciliation/summary', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['DailyReconciliation'],
    }),

    // PUT /reconciliation/summary/:id — management edits a locked day
    updateDailyCollectionSummary: builder.mutation({
      query: ({ id, ...data }) => ({ url: `/reconciliation/summary/${id}`, method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['DailyReconciliation'],
    }),

    // GET /reconciliation/branch/:branchId?businessDate=YYYY-MM-DD
    getBranchReconciliation: builder.query({
      query: ({ branchId, businessDate }) =>
        `/reconciliation/branch/${branchId}${businessDate ? `?businessDate=${businessDate}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),

    // GET /reconciliation/overview?businessDate=YYYY-MM-DD
    getReconciliationOverview: builder.query({
      query: (businessDate) =>
        `/reconciliation/overview${businessDate ? `?businessDate=${businessDate}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['DailyReconciliation'],
    }),

    // ─── Head branch (Management only) ───
    // Moves the global is_head_branch flag to the chosen branch.
    // Invalidates Branches so BranchPicker and HeadBranchSetting refetch.
    setHeadBranch: builder.mutation({
      query: (data) => ({ url: '/branches/head-branch', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),

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

    // ─── Mobile app version gate (Management only for writes; GET is public) ───
    // GET /app-version — returns the current/minimal version strings + force_update flag.
    // Called by the admin UI to display current values; the native app calls it directly.
    getMobileAppVersion: builder.query({
      query: () => '/app-version',
      transformResponse: (response) => response.data,
      providesTags: ['MobileAppVersion'],
    }),

    // PATCH /app-version — Management updates version strings and/or the force-update flag.
    // Any omitted field keeps its current DB value (partial-merge on the server).
    updateMobileAppVersion: builder.mutation({
      query: (data) => ({ url: '/app-version', method: 'PATCH', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['MobileAppVersion'],
    }),

    // ─── Transfer / Promotion — Management direct execute ──────────────────────
    // Management fills the form and the transfer takes effect immediately.
    executeTransfer: builder.mutation({
      query: (data) => ({ url: '/users/transfers', method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['TransferRequests', 'Users'],
    }),
    listTransferRequests: builder.query({
      query: ({ status } = {}) => `/users/transfers${status ? `?status=${status}` : ''}`,
      transformResponse: (response) => response.data,
      providesTags: ['TransferRequests'],
    }),
  }),
});

export const {
  useSelfAbsentMutation,
  useLoginMutation,
  useGetMeQuery,
  useLogoutMutation,
  useGetProfileUploadUrlMutation,
  useUpdateProfileAssetsMutation,
  useSubmitAttendanceMutation,
  useGetSummaryQuery,
  useGetHistoryQuery,
  useGetTeamHistoryQuery,
  useGetEmployeesQuery,
  useGetAttendanceListQuery,
  useAdminMarkMutation,
  useAdminCorrectMutation,
  useSubmitSignOffMutation,
  useAdminSignOffMutation,
  useGetUploadUrlMutation,
  useGetPhotoUrlQuery,
  useGetBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
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
  useGetUserSuperiorsQuery,
  useGetUsersQuery,
  useGetUserByIdQuery,
  useGetManagerOptionsQuery,
  useCreateUserMutation,
  useGetUserOversightBranchesQuery,
  useLazyGetUserOversightBranchesQuery,
  useUpdateUserOversightBranchesMutation,
  useChangePasswordMutation,
  useGetMoneyWalletQuery,
  useTransferMoneyMutation,
  useGetMoneySourcesQuery,
  useGetMoneyAdminOverviewQuery,
  useGetMoneyBranchDrilldownQuery,
  useGetCashHolderDetailQuery,
  useGetBranchRankingsQuery,
  useMdAddCollectionEntryMutation,
  useGetMyDocumentsQuery,
  useAddDocumentMutation,
  useDeleteDocumentMutation,
  useGetUserDocumentsQuery,
  useGetDeactivatedUsersQuery,
  useReactivateUserMutation,
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
  useVoidGoldMemberMutation,
  useDeleteGoldMemberMutation,
  useGetTradingMembersQuery,
  useGetTradingSummaryQuery,
  useGetTradingEmployeesQuery,
  useAddTradingMemberMutation,
  useCorrectTradingMemberMutation,
  useVoidTradingMemberMutation,
  useDeleteTradingMemberMutation,
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
  useGetSchemesOverviewQuery,
  useGetSchemeDailyCollectionQuery,
  useGetSchemeDailyCollectionBySchemeQuery,
  useGetSchemeBranchEntriesQuery,
  useLazyGetSchemeBranchEntriesQuery,
  useGetCommissionRulesQuery,
  useSetCommissionRuleMutation,
  useDistributeIncentivesMutation,
  useGetIncentiveWalletQuery,
  useGetIncentivesQuery,
  useAddIncentiveMutation,
  useGetCurrentSalaryQuery,
  useGetSalaryHistoryQuery,
  useSetSalaryMutation,
  useSetSalaryByRoleMutation,
  useSearchCustomersQuery,
  useLazySearchCustomersQuery,
  useCreateCustomerMutation,
  useGetCustomerQuery,
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
  useCorrectChitMemberMutation,
  useCorrectChitPaymentMutation,
  useUnpayChitPaymentMutation,
  useVoidChitMemberMutation,
  useDeleteChitMemberMutation,
  useCorrectGoldCoinSlotMutation,
  useVoidGoldCoinSlotMutation,
  useDeleteGoldCoinSlotMutation,
  useVoidGoldCoinRoomMutation,
  useRemoveGoldCoinSlotMutation,
  useCorrectLssSlotMutation,
  useVoidLssSlotMutation,
  useDeleteLssSlotMutation,
  useVoidLssRoomMutation,
  useDeleteLssRoomMutation,
  useRemoveLssSlotMutation,
  useUpdateLssDrawDateMutation,
  useUpdateLssRoomDatesMutation,
  useUnpayGoldPaymentMutation,
  useCorrectLandBookingMutation,
  useVoidLandBookingMutation,
  useDeleteLandBookingMutation,
  useUnpayLandPayoutMutation,
  useUndoLandFullPaymentMutation,
  useUndoLandAdvanceMutation,
  useGetSchemeAuditLogQuery,
  useUpdateCustomerMutation,
  useGetBackdatedEntrySettingQuery,
  useUpdateBackdatedEntrySettingMutation,
  useGetWhatsappMessagesSettingQuery,
  useUpdateWhatsappMessagesSettingMutation,
  useGetLssEligibilityBypassSettingQuery,
  useUpdateLssEligibilityBypassSettingMutation,
  useGetGoldCoinEligibilityBypassSettingQuery,
  useUpdateGoldCoinEligibilityBypassSettingMutation,
  useGetDailyCollectionReconciliationSettingQuery,
  useUpdateDailyCollectionReconciliationSettingMutation,
  useGetAutoDeactivationSettingQuery,
  useUpdateAutoDeactivationSettingMutation,
  useGetTodayCollectionSummaryQuery,
  useSubmitDailyCollectionSummaryMutation,
  useUpdateDailyCollectionSummaryMutation,
  useGetBranchReconciliationQuery,
  useGetReconciliationOverviewQuery,
  useSetHeadBranchMutation,
  useSetBranchLocationMutation,
  useGetPendingEnrollmentsQuery,
  useGetPendingEnrollmentQuery,
  useCreatePendingEnrollmentMutation,
  useAddPendingEnrollmentPaymentMutation,
  useCancelPendingEnrollmentMutation,
  useRetryPendingEnrollmentMutation,
  useGetMobileAppVersionQuery,
  useUpdateMobileAppVersionMutation,
  useExecuteTransferMutation,
  useListTransferRequestsQuery,
} = apiSlice;
