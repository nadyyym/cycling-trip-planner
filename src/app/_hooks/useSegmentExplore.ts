import { api } from "~/trpc/react";
import { type MapBounds, roundBounds } from "./useDebouncedBounds";

/**
 * Custom hook for exploring Strava segments within map bounds
 * Handles loading states, errors, and caching
 *
 * @param bounds - Map bounds to search within (null disables the query)
 * @returns Query result with segments data, loading state, and error handling
 */
export function useSegmentExplore(bounds: MapBounds | null) {
  // Round bounds to reduce cache misses for nearly identical requests
  const roundedBounds = bounds ? roundBounds(bounds) : null;

  const query = api.strava.segmentExplore.useQuery(roundedBounds!, {
    // Only run query when bounds are available
    enabled: !!roundedBounds,

    // Cache for 5 minutes to avoid duplicate requests
    staleTime: 5 * 60 * 1000, // 5 minutes

    // Keep data fresh in background
    refetchOnWindowFocus: false,

    // Retry on failure with exponential backoff
    retry: (failureCount, error) => {
      // Don't retry on auth errors
      if (error?.data?.code === "UNAUTHORIZED") {
        return false;
      }

      // Don't retry on rate limit errors
      if (error?.data?.code === "TOO_MANY_REQUESTS") {
        return false;
      }

      // Retry up to 3 times for other errors
      return failureCount < 3;
    },
  });

  // Log results when query succeeds or fails
  if (query.data && roundedBounds) {
    console.log(
      `Segment explore success: ${query.data.length} segments found`,
      {
        bounds: roundedBounds,
        count: query.data.length,
      },
    );
  }

  if (query.error) {
    console.error("Segment explore failed:", query.error);
  }

  return {
    segments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isRefetching: query.isRefetching,
    refetch: query.refetch,
  };
}
