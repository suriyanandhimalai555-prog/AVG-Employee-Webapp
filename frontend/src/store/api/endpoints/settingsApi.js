// App settings, mobile app version gate, period config.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const settingsApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
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

    // ─── Period config (business-month boundary overrides) ───────────────────

    // GET /period-config — all active override rows; any authenticated user.
    // Used at bootstrap to seed the schemePeriod.js override map so all period
    // helpers stay synchronous while reflecting management's custom dates.
    getPeriodOverrides: builder.query({
      query: () => '/period-config',
      transformResponse: (response) => response.data,
      providesTags: ['PeriodOverrides'],
    }),

    // PUT /period-config — management sets a custom start/end for one month.
    // Body: { periodYear, periodMonth (0-indexed), startDate, endDate }
    setPeriodConfig: builder.mutation({
      query: (data) => ({ url: '/period-config', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['PeriodOverrides'],
    }),

    // DELETE /period-config — management resets one month to the default 7-to-6 math.
    // Body: { periodYear, periodMonth (0-indexed) }
    resetPeriodConfig: builder.mutation({
      query: (data) => ({ url: '/period-config', method: 'DELETE', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['PeriodOverrides'],
    }),
  }),
});

export const {
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
  useGetMobileAppVersionQuery,
  useUpdateMobileAppVersionMutation,
  useGetPeriodOverridesQuery,
  useSetPeriodConfigMutation,
  useResetPeriodConfigMutation,
} = settingsApi;
