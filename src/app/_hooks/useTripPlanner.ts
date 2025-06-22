import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { useCallback } from "react";
import { type SaveTripInput } from "~/lib/tripUtils";

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
 * Custom hook for trip planning with explicit save functionality
 * Handles the complete trip planning workflow including error management and manual trip saving
 */
export function useTripPlanner() {
  const { toast } = useToast();
  const saveMutation = api.trip.save.useMutation();
  
  // Plan mutation without auto-saving
  const planMutation = api.routePlanner.planTrip.useMutation();

  const planTrip = useCallback((input: TripPlanInput) => {
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

    return planMutation.mutate({
      segments,
      startDate: input.startDate,
      endDate: input.endDate,
      maxDailyDistanceKm: input.maxDailyDistanceKm,
      maxDailyElevationM: input.maxDailyElevationM,
    });
  }, [planMutation]);

  const saveTrip = useCallback((saveInput: SaveTripInput) => {
    console.log("[TRIP_PLANNER_SAVE_START]", {
      routeCount: saveInput.routes.length,
      totalDistanceKm: saveInput.totalDistanceKm,
      constraints: saveInput.constraints,
      timestamp: new Date().toISOString(),
    });

    return saveMutation.mutate(saveInput, {
      onSuccess: (saveResult) => {
        console.log("[TRIP_PLANNER_SAVE_SUCCESS]", {
          slug: saveResult.slug,
          shareUrl: saveResult.shareUrl,
          dayCount: saveResult.days.length,
          timestamp: new Date().toISOString(),
        });

        toast({
          title: "🚴 Trip saved successfully!",
          description: `Your ${saveResult.days.length}-day cycling trip is now public and ready to share.`,
          variant: "default",
        });
      },
      onError: (error) => {
        console.error("[TRIP_PLANNER_SAVE_ERROR]", {
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
        });

        toast({
          title: "❌ Failed to save trip",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive",
        });
      },
    });
  }, [saveMutation, toast]);

  return {
    // Planning state
    isPending: planMutation.isPending,
    isError: planMutation.isError,
    isSuccess: planMutation.isSuccess,
    error: planMutation.error,
    data: planMutation.data,
    
    // Saving state
    isSaving: saveMutation.isPending,
    isSaved: saveMutation.isSuccess,
    saveError: saveMutation.error,
    savedTrip: saveMutation.data,
    
    // Actions
    planTrip,
    saveTrip,
    reset: () => {
      planMutation.reset();
      saveMutation.reset();
    },
  };
} 