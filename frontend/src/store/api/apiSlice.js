// frontend/src/store/api/apiSlice.js
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

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
  tagTypes: ['Attendance', 'Summary', 'Employees', 'Branches', 'Transactions', 'Users', 'MoneyProjects', 'MoneyCollections', 'MoneyWallet', 'UserDocuments', 'GoldMembers', 'GoldSummary', 'GoldEmployees', 'GoldPayments', 'Incentives', 'IncentiveWallet', 'CommissionRules', 'Salaries', 'TradingMembers', 'TradingSummary', 'Customers', 'GoldCoinPackages', 'GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'GoldCoinAwaitingCombine', 'SchemesOverview', 'SchemeBranchEntries'],
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
        if (params.search)     qs.set('search', params.search);
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
      query: (id) => `/gold/${id}`,
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
      query: () => '/gold/employees',
      transformResponse: (response) => response.data,
      providesTags: ['GoldEmployees'],
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
      query: (memberId) => `/gold/${memberId}/payments`,
      transformResponse: (response) => response.data,
      providesTags: (result, error, memberId) => [{ type: 'GoldPayments', id: memberId }],
    }),

    addGoldPayment: builder.mutation({
      query: ({ memberId, ...data }) => ({ url: `/gold/${memberId}/payments`, method: 'POST', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: (result, error, { memberId }) => [{ type: 'GoldPayments', id: memberId }, 'GoldMembers', 'Incentives', 'IncentiveWallet'],
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
        if (params.search) qs.set('search', params.search);
        if (params.page)   qs.set('page', String(params.page));
        if (params.limit)  qs.set('limit', String(params.limit));
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
  useGetTradingMembersQuery,
  useGetTradingSummaryQuery,
  useGetTradingEmployeesQuery,
  useAddTradingMemberMutation,
  useGetGoldCoinPackagesQuery,
  useGetGoldCoinRoomsQuery,
  useGetGoldCoinRoomQuery,
  useGetGoldCoinSummaryQuery,
  useGetGoldCoinAwaitingCombineQuery,
  useAddGoldCoinSlotMutation,
  useRefundGoldCoinSlotMutation,
  useActivateGoldCoinRoomMutation,
  useRunGoldCoinDrawMutation,
  useCombineGoldCoinRoomsMutation,
  useRefundGoldCoinRoomMutation,
  useSendGoldCoinRoomToHeadBranchMutation,
  useGetSchemesOverviewQuery,
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
  useSearchCustomersQuery,
  useLazySearchCustomersQuery,
  useCreateCustomerMutation,
  useGetCustomerQuery,
} = apiSlice;
