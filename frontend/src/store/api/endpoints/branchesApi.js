// Branches.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const branchesApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
  endpoints: (builder) => ({
    // ─── Branches ───
    getBranches: builder.query({
      query: () => '/branches',
      transformResponse: (response) => response.data,
      providesTags: ['Branches'],
      // Match the 10-min server Redis cache — no re-fetch within 10 min
      keepUnusedDataFor: 600,
    }),

    // MD/Management branch-management pages only: includes inactive (soft-deleted) branches
    // so they are visible and can be reactivated. All other consumers use getBranches.
    getAllBranches: builder.query({
      query: () => '/branches?includeInactive=true',
      transformResponse: (response) => response.data,
      providesTags: ['Branches'],
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

    // ─── Head branch (Management only) ───
    // Moves the global is_head_branch flag to the chosen branch.
    // Invalidates Branches so BranchPicker and HeadBranchSetting refetch.
    setHeadBranch: builder.mutation({
      query: (data) => ({ url: '/branches/head-branch', method: 'PUT', body: data }),
      transformResponse: (response) => response.data,
      invalidatesTags: ['Branches'],
    }),
  }),
});

export const {
  useGetBranchesQuery,
  useGetAllBranchesQuery,
  useCreateBranchMutation,
  useUpdateBranchMutation,
  useDeleteBranchMutation,
  useSetHeadBranchMutation,
  useSetBranchLocationMutation,
} = branchesApi;
