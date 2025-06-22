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
  /** Easier day rule configuration */
  easierDayRule: {
    every: number;
    maxDistanceKm: number;
    maxElevationM: number;
  };
}

/**
 * Custom hook for trip planning that wraps the tRPC mutation
 * Handles conversion from UI segment selection to API payload format
 * 
 * @returns Mutation object with planning state and trigger function
 */
export function useTripPlanner() {
  const planTripMutation = api.routePlanner.planTrip.useMutation();

  /**
   * Plan a trip with the selected segments and custom constraints
   * Converts segment IDs to the required API payload format
   * 
   * @param input Trip planning input with segment IDs and constraints
   */
  const planTrip = (input: TripPlanInput) => {
    console.log("[TRIP_PLANNER_START]", {
      segmentCount: input.segmentIds.length,
      segmentIds: input.segmentIds,
      startDate: input.startDate,
      endDate: input.endDate,
      maxDailyDistanceKm: input.maxDailyDistanceKm,
      maxDailyElevationM: input.maxDailyElevationM,
      easierDayRule: input.easierDayRule,
      timestamp: new Date().toISOString(),
    });

    // Convert string IDs to numbers and build API payload
    const segments = input.segmentIds.map((segmentId) => ({
      segmentId: parseInt(segmentId, 10),
      forwardDirection: true, // Always forward for first iteration
    }));

    // Build the full API payload with custom constraints
    const apiPayload = {
      segments,
      // No tripStart for first iteration
      tripStart: undefined,
      // Custom constraints from user input
      startDate: input.startDate,
      endDate: input.endDate,
      maxDailyDistanceKm: input.maxDailyDistanceKm,
      maxDailyElevationM: input.maxDailyElevationM,
      easierDayRule: input.easierDayRule,
    };

    console.log("[TRIP_PLANNER_API_PAYLOAD]", {
      payload: apiPayload,
      timestamp: new Date().toISOString(),
    });

    // Trigger the mutation
    planTripMutation.mutate(apiPayload);
  };

  return {
    // Mutation state
    isPending: planTripMutation.isPending,
    isError: planTripMutation.isError,
    isSuccess: planTripMutation.isSuccess,
    error: planTripMutation.error,
    data: planTripMutation.data,
    
    // Mutation trigger
    planTrip,
    
    // Reset function
    reset: planTripMutation.reset,
  };
} 