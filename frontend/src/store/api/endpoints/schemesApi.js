// Cross-scheme dashboard, branch entries, corrections audit.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';
import { pagedListOptions, pagedQuery } from '../pagedList';

// URL for a scheme's per-branch entries list — shared by the plain query and its paged
// variant. Filters (dates, search) and the page window are all applied by the server.
const schemeBranchEntriesUrl = ({ code, branchId, startDate, endDate, search, page, limit }) => {
  const qs = new URLSearchParams();
  if (startDate) qs.set('startDate', startDate);
  if (endDate)   qs.set('endDate',   endDate);
  if (search)    qs.set('search',    search);
  if (page)      qs.set('page',      String(page));
  if (limit)     qs.set('limit',     String(limit));
  const q = qs.toString();
  return `/schemes/${code}/branches/${branchId}/entries${q ? `?${q}` : ''}`;
};

export const schemesApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
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

    // One page of a scheme's entries for a branch (default: first 50, newest first).
    // Lists should use the paged variant below; this stays for one-off lookups.
    getSchemeBranchEntries: builder.query({
      query: schemeBranchEntriesUrl,
      transformResponse: (response) => response.data,
      providesTags: (_r, _e, { code, branchId }) => [
        { type: 'SchemeBranchEntries', id: `${code}:${branchId}` },
      ],
    }),

    // "Load more" variant: one page per request, pages kept together in the cache
    // (see ../pagedList.js). Read it with the usePagedList hook. `search` is applied on
    // the server across the whole branch, so it finds entries on pages not loaded yet.
    // Each page is { data, total } plus schemeCode/branchId so the UI can tell which
    // scheme + branch a cached response belongs to.
    getSchemeBranchEntriesPaged: builder.infiniteQuery({
      infiniteQueryOptions: pagedListOptions,
      query: pagedQuery(schemeBranchEntriesUrl),
      transformResponse: (response) => ({
        data:       response.data.entries,
        total:      response.data.total,
        schemeCode: response.data.schemeCode,
        branchId:   response.data.branchId,
      }),
      providesTags: (_r, _e, { code, branchId }) => [
        { type: 'SchemeBranchEntries', id: `${code}:${branchId}` },
      ],
    }),
  }),
});

export const {
  useGetSchemesOverviewQuery,
  useGetSchemeDailyCollectionQuery,
  useGetSchemeDailyCollectionBySchemeQuery,
  useGetSchemeBranchEntriesQuery,
  useLazyGetSchemeBranchEntriesQuery,
  useGetSchemeBranchEntriesPagedInfiniteQuery,
} = schemesApi;
