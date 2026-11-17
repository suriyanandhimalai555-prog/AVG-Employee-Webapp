import { useMemo, useCallback } from 'react';

// Reads a paged ("Load more") list from an RTK Query infinite-query hook.
//
//   const { rows, total, hasMore, loadMore, isLoading, isLoadingMore } =
//     usePagedList(useGetGoldMembersPagedInfiniteQuery, { status, search });
//
// - rows:   every loaded row, in server order, de-duplicated by `id` (a row inserted
//           while paging can otherwise appear on two pages and break React keys).
// - total:  matches across ALL pages, as reported by the server — not rows.length.
// - hasMore / loadMore: drive a <LoadMoreFooter/>.
// Changing `args` (a filter, the search text) starts a fresh list from page 1.
export const usePagedList = (useInfiniteQuery, args, options) => {
  const query = useInfiniteQuery(args, options);
  const { data, hasNextPage, fetchNextPage, isFetching } = query;

  const rows = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const page of data?.pages ?? []) {
      for (const row of page?.data ?? []) {
        if (row?.id != null) {
          if (seen.has(row.id)) continue;
          seen.add(row.id);
        }
        out.push(row);
      }
    }
    return out;
  }, [data]);

  const pages    = data?.pages;
  const lastPage = pages?.[pages.length - 1];
  // Never report fewer than we are showing (rows can be added between page requests).
  const total    = Math.max(lastPage?.total ?? 0, rows.length);

  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetching) fetchNextPage();
  }, [hasNextPage, isFetching, fetchNextPage]);

  return {
    rows,
    total,
    hasMore:       Boolean(hasNextPage),
    loadMore,
    isLoading:     query.isLoading,
    isFetching,
    isLoadingMore: query.isFetchingNextPage,
    error:         query.error,
    refetch:       query.refetch,
    // First loaded page — for endpoints that return extra fields next to data/total.
    firstPage:     pages?.[0],
  };
};

export default usePagedList;
