// frontend/src/store/api/baseApi.js
//
// The ONE RTK Query API instance for the app: base query (auth header, 401/429 retry),
// reducer path and the tag registry. It deliberately defines no endpoints — each domain
// adds its own with injectEndpoints in ./endpoints/*.js. Add new tag types here.
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
// authSlice.js already imports apiSlice (circular dep) — dispatch by string
// type instead.
//
// Retry-once strategy for 401: a single 401 on a GET may be a transient blip
// (backend restarting after a deploy).  We wait 500 ms and retry before
// concluding the token is invalid.  Only a *second* consecutive 401 clears
// credentials.  Retry is intentionally skipped for non-GET methods
// (POST/PATCH/DELETE) to prevent non-idempotent mutations from being sent twice.
//
// Retry-once strategy for 429: when the server rate-limits a read-only request,
// wait for the Retry-After window (or 1 s fallback, max 5 s) then retry once.
// If still 429 after the retry, return the error silently — never log the user
// out, never show a crash.  Mutations are not retried to avoid duplicate writes.
const baseQueryWithReauth = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);

  // Determine the HTTP method once so both error-branches can reference it.
  const method = typeof args === 'string' ? 'GET' : (args.method ?? 'GET');
  const isSafeMethod = method === 'GET' || method === 'HEAD';

  // ── 429 Rate-Limited ────────────────────────────────────────────────────────
  if (result.error?.status === 429 && isSafeMethod) {
    // Read the server's Retry-After hint (seconds); default 1 s, cap at 5 s.
    const retryAfterRaw = result.meta?.response?.headers?.get('retry-after');
    const retryAfterMs = Math.min(
      (retryAfterRaw ? parseFloat(retryAfterRaw) : 1) * 1000,
      5000,
    );
    await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
    // Retry once — if the rate-limit window has reset, this succeeds silently.
    result = await rawBaseQuery(args, api, extraOptions);
    // If it is still 429 after the retry, return the error as-is (no logout).
  }

  // ── 401 Unauthorized ────────────────────────────────────────────────────────
  if (result.error?.status === 401) {
    if (isSafeMethod) {
      // Brief pause to ride out a backend restart window before retrying.
      await new Promise((resolve) => setTimeout(resolve, 500));
      result = await rawBaseQuery(args, api, extraOptions);
    }
    if (result.error?.status === 401) {
      // Still 401 — token is genuinely invalid.  Log out.
      api.dispatch({ type: 'auth/clearCredentials' });
    }
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  tagTypes: ['Attendance', 'Summary', 'Employees', 'Branches', 'Transactions', 'Users', 'MoneyProjects', 'MoneyCollections', 'MoneyWallet', 'UserDocuments', 'GoldMembers', 'GoldSummary', 'GoldEmployees', 'GoldPayments', 'Incentives', 'IncentiveWallet', 'CommissionRules', 'Salaries', 'TradingMembers', 'TradingSummary', 'Customers', 'GoldCoinPackages', 'GoldCoinRooms', 'GoldCoinRoom', 'GoldCoinSummary', 'GoldCoinAwaitingCombine', 'LssPlans', 'LssRooms', 'LssRoom', 'LssSummary', 'LssAwaitingCombine', 'SchemesOverview', 'SchemeBranchEntries', 'ChitGroups', 'ChitGroup', 'ChitSummary', 'ChitPayments', 'ChitEligible', 'ChitAwaitingCombine', 'BuildersPlans', 'BuildersPlan', 'BuildersSummary', 'BuildersPackages', 'BuildersPayouts', 'BuildersIncentiveRules', 'ChitPackages', 'LandSites', 'LandSite', 'LandPlots', 'LandCustomers', 'LandBookings', 'LandBooking', 'LandBuyback', 'LandDashboard', 'LandLayouts', 'LandLayout', 'LandCommissionRules', 'LandEmployees', 'LandBookingRefs', 'AppSettings', 'PendingEnrollments', 'DailyReconciliation', 'MobileAppVersion', 'TransferRequests', 'SchemeDailyCollection', 'BranchIncentives', 'UserRenames', 'PeriodOverrides'],
  endpoints: () => ({}),
});
