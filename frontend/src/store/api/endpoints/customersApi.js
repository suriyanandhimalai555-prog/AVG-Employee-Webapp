// Customers.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const customersApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
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
  }),
});

export const {
  useSearchCustomersQuery,
  useLazySearchCustomersQuery,
  useCreateCustomerMutation,
  useGetCustomerQuery,
  useUpdateCustomerMutation,
} = customersApi;
