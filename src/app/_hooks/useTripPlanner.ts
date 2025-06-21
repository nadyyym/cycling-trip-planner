import { api } from "~/trpc/react";

/**
 * Input for trip planning from UI perspective
 * Simplified interface that gets converted to the full API payload
 */
export interface TripPlanInput {
  /** Array of segment IDs to visit */
  segmentIds: string[];
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
   * Plan a trip with the selected segments
   * Converts segment IDs to the required API payload format
   * 
   * @param input Trip planning input with segment IDs
   */
  const planTrip = (input: TripPlanInput) => {
    console.log("[TRIP_PLANNER_START]", {
      segmentCount: input.segmentIds.length,
      segmentIds: input.segmentIds,
      timestamp: new Date().toISOString(),
    });

    // Convert string IDs to numbers and build API payload
    const segments = input.segmentIds.map((segmentId) => ({
      segmentId: parseInt(segmentId, 10),
      forwardDirection: true, // Always forward for first iteration
    }));

    // Build the full API payload
    const apiPayload = {
      segments,
      // No tripStart for first iteration
      tripStart: undefined,
      // Use default maxDays (4)
      maxDays: 4 as const,
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