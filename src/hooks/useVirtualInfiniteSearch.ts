import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { CoreAPI } from '@/lib/coreApi';
import { SearchResultGame, SearchParams } from '@/lib/models';

interface UseVirtualInfiniteSearchOptions {
  query: string;
  systems: string[];
  tags?: string[];
  maxResults?: number;
  enabled?: boolean;
}

export function useVirtualInfiniteSearch({
  query,
  systems,
  tags = [],
  maxResults = 100,
  enabled = true
}: UseVirtualInfiniteSearchOptions) {
  const searchQuery = useInfiniteQuery({
    queryKey: ['infiniteMediaSearch', query, systems, tags, maxResults],
    queryFn: async ({ pageParam }) => {
      const searchParams: SearchParams = {
        query,
        systems,
        tags,
        maxResults,
        cursor: pageParam as string | undefined
      };

      return CoreAPI.mediaSearch(searchParams);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => {
      // If pagination exists, use it. Otherwise fall back to legacy behavior (no pagination)
      if (lastPage?.pagination) {
        return lastPage.pagination.hasNextPage ? lastPage.pagination.nextCursor : undefined;
      }
      // Legacy fallback: no more pages if pagination field doesn't exist
      return undefined;
    },
    enabled: enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000)
  });

  // Flatten all pages into a single array for virtual scrolling
  // eslint-disable-next-line react-hooks/preserve-manual-memoization -- Intentional: optional chain for safety, actual dep is pages array
  const allItems = useMemo(() => {
    if (!searchQuery.data?.pages) return [];

    const items: SearchResultGame[] = [];
    searchQuery.data.pages.forEach(page => {
      items.push(...page.results);
    });

    return items;
  }, [searchQuery.data?.pages]);

  // Calculate total count from all pages
  const totalCount = useMemo(() => {
    if (!searchQuery.data?.pages) return 0;
    return allItems.length;
  }, [allItems.length, searchQuery.data?.pages]);

  // Get loading states
  const isLoading = searchQuery.isLoading;
  const isFetchingNextPage = searchQuery.isFetchingNextPage;
  const hasNextPage = searchQuery.hasNextPage;
  const isError = searchQuery.isError;
  const error = searchQuery.error;

  return {
    // Data
    allItems,
    totalCount,

    // Loading states
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    error,

    // Actions
    fetchNextPage: searchQuery.fetchNextPage,
    refetch: searchQuery.refetch,

    // Raw query for debugging
    query: searchQuery
  };
}