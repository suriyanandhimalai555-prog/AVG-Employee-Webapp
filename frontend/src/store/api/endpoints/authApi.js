// Auth, profile assets and user documents.
//
// Endpoints are injected into the single shared API instance (../baseApi.js), so they
// share one cache, one middleware and one tag namespace with every other domain file.
// Import hooks from '../apiSlice' (the barrel) in components — not from this file.
import { apiSlice } from '../baseApi';

export const authApi = apiSlice.injectEndpoints({
  // In dev, let Vite HMR replace an edited endpoint instead of keeping the stale one.
  overrideExisting: import.meta.env.DEV,
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
  }),
});

export const {
  useLoginMutation,
  useGetMeQuery,
  useLogoutMutation,
  useGetProfileUploadUrlMutation,
  useUpdateProfileAssetsMutation,
  useGetMyDocumentsQuery,
  useAddDocumentMutation,
  useDeleteDocumentMutation,
  useGetUserDocumentsQuery,
  useGetDeactivatedUsersQuery,
  useReactivateUserMutation,
} = authApi;
