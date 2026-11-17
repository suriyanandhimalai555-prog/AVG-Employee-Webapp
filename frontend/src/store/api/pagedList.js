// Shared building blocks for "Load more" lists (RTK Query infinite queries).
//
// Every paged list endpoint on the API takes ?page=&limit= and answers
//   { data: [...rows], total: <matches across all pages> }
// An infinite-query endpoint fetches one such page per request and keeps the loaded
// pages together in the cache, so a tag invalidation refetches all of them and the list
// never shows a half-stale mix. Read the pages with the usePagedList hook.

// Rows per request when the caller does not ask for a specific page size.
export const PAGE_SIZE = 50;

// infiniteQueryOptions for a { data, total } page: keep going until every match is loaded.
export const pagedListOptions = {
  initialPageParam: 1,
  getNextPageParam: (lastPage, allPages, lastPageParam) => {
    // An empty page means we ran off the end (rows were deleted while paging).
    if (!lastPage?.data?.length) return undefined;
    const loaded = allPages.reduce((n, page) => n + (page?.data?.length ?? 0), 0);
    return loaded < (lastPage.total ?? 0) ? lastPageParam + 1 : undefined;
  },
};

// Adapts a plain URL builder `(params) => url` to the infinite-query signature, adding
// the page number and page size. Callers may pass `limit` in their args to override it.
export const pagedQuery = (buildUrl, pageSize = PAGE_SIZE) =>
  ({ queryArg, pageParam }) =>
    buildUrl({ ...(queryArg ?? {}), page: pageParam, limit: queryArg?.limit ?? pageSize });
