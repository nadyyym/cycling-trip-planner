import { api } from "~/trpc/react";

/**
 * Input for trip planning from UI perspective
 * Includes custom constraints for personalized trip planning
 */
export interface TripPlanInput {
  /** Array of segment IDs to visit */
  segmentIds: string[];
  /** Trip start date (ISO yyyy-mm-dd format) */
  startDate: string;
  /** Trip end date (ISO yyyy-mm-dd format) */
  endDate: string;
  /** Maximum daily distance in kilometers */
  maxDailyDistanceKm: number;
  /** Maximum daily elevation gain in meters */
  maxDailyElevationM: number;
}

/**
 * Custom hook for trip planning with optimistic mutations
 * Handles the complete trip planning workflow including error management
 */
export function useTripPlanner() {
  const mutation = api.routePlanner.planTrip.useMutation();

  const planTrip = (input: TripPlanInput) => {
    console.log("[TRIP_PLANNER_START]", {
      segmentCount: input.segmentIds.length,
      constraints: {
        startDate: input.startDate,
        endDate: input.endDate,
        maxDailyDistanceKm: input.maxDailyDistanceKm,
        maxDailyElevationM: input.maxDailyElevationM,
      },
      timestamp: new Date().toISOString(),
    });

    // Convert string segment IDs to the format expected by the API
    const segments = input.segmentIds.map((segmentId) => ({
      segmentId: parseInt(segmentId, 10),
      forwardDirection: true, // Always forward for simplicity
    }));

    return mutation.mutate({
      segments,
      startDate: input.startDate,
      endDate: input.endDate,
      maxDailyDistanceKm: input.maxDailyDistanceKm,
      maxDailyElevationM: input.maxDailyElevationM,
    });
  };

  return {
    // Mutation state
    isPending: mutation.isPending,
    isError: mutation.isError,
    isSuccess: mutation.isSuccess,
    error: mutation.error,
    data: mutation.data,
    
    // Actions
    planTrip,
    reset: mutation.reset,
  };
} 