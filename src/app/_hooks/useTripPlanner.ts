import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { useCallback } from "react";

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
 * Handles the complete trip planning workflow including error management and trip saving
 */
export function useTripPlanner() {
  const { toast } = useToast();
  const saveMutation = api.trip.save.useMutation();
  
  // Plan mutation with onSuccess callback to automatically save
  const planMutation = api.routePlanner.planTrip.useMutation({
    onSuccess: (data) => {
      if (data?.ok) {
        // Automatically save the trip after successful planning
        console.log("[TRIP_PLANNER_AUTO_SAVE]", {
          routeCount: data.routes.length,
          totalDistanceKm: data.totalDistanceKm,
          timestamp: new Date().toISOString(),
        });
        
                 // Trigger save mutation
         const saveData = {
           constraints: {
             startDate: data.constraints?.startDate ?? new Date().toISOString().split('T')[0]!,
             endDate: data.constraints?.endDate ?? new Date().toISOString().split('T')[0]!,
             maxDailyDistanceKm: data.constraints?.maxDailyDistanceKm ?? 100,
             maxDailyElevationM: data.constraints?.maxDailyElevationM ?? 1000,
           },
          routes: data.routes.map((route: {
            dayNumber: number;
            distanceKm: number;
            elevationGainM: number;
            geometry: any;
            segments?: Array<{ id: number; name: string; stravaUrl: string }>;
            durationMinutes: number;
          }) => ({
            dayNumber: route.dayNumber,
            distanceKm: route.distanceKm,
            elevationGainM: route.elevationGainM,
            geometry: route.geometry,
            segmentsVisited: route.segments?.map((s) => s.id) ?? [],
            durationMinutes: route.durationMinutes,
            segments: route.segments,
          })),
          totalDistanceKm: data.totalDistanceKm,
          totalElevationGainM: data.totalElevationGainM,
          totalDurationMinutes: data.totalDurationMinutes,
        };
        
        saveMutation.mutate(saveData, {
          onSuccess: (saveResult) => {
            toast({
              title: "Trip saved successfully!",
              description: `Your ${saveResult.days.length}-day cycling trip has been saved and is ready to share.`,
            });
          },
          onError: (error) => {
            toast({
              title: "Failed to save trip",
              description: error instanceof Error ? error.message : "An unexpected error occurred",
              variant: "destructive",
            });
          },
        });
      }
    },
  });

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
    reset: () => {
      planMutation.reset();
      saveMutation.reset();
    },
  };
} 