import type { PlanResponse } from "~/types/routePlanner";

/**
 * Input schema for saving a trip based on route planner output
 */
export interface SaveTripInput {
  constraints: {
    startDate: string; // YYYY-MM-DD format
    endDate: string;
    maxDailyDistanceKm: number;
    maxDailyElevationM: number;
  };
  routes: Array<{
    dayNumber: number;
    distanceKm: number;
    elevationGainM: number;
    geometry: {
      type: "LineString";
      coordinates: [number, number][];
    };
    segmentsVisited: number[];
    durationMinutes: number;
    segments?: Array<{
      id: number;
      name: string;
      stravaUrl?: string;
    }>;
  }>;
  totalDistanceKm: number;
  totalElevationGainM: number;
  totalDurationMinutes: number;
}

/**
 * Converts a successful plan response to the format expected by trip.save API
 * Extracts constraints, routes, and totals from the plan response
 * 
 * @param planResponse The successful plan response from routePlanner.planTrip
 * @param constraints The original constraints used for planning
 * @returns Formatted input for trip.save mutation
 */
export function buildSavePayload(
  planResponse: PlanResponse & { ok: true },
  constraints: {
    startDate: string;
    endDate: string;
    maxDailyDistanceKm: number;
    maxDailyElevationM: number;
  }
): SaveTripInput {
  console.log("[BUILD_SAVE_PAYLOAD]", {
    routeCount: planResponse.routes.length,
    totalDistanceKm: planResponse.totalDistanceKm,
    totalElevationM: planResponse.totalElevationGainM,
    constraints,
    timestamp: new Date().toISOString(),
  });

  return {
    constraints: {
      startDate: constraints.startDate,
      endDate: constraints.endDate,
      maxDailyDistanceKm: constraints.maxDailyDistanceKm,
      maxDailyElevationM: constraints.maxDailyElevationM,
    },
    routes: planResponse.routes.map((route) => ({
      dayNumber: route.dayNumber,
      distanceKm: route.distanceKm,
      elevationGainM: route.elevationGainM,
      geometry: route.geometry,
      segmentsVisited: route.segments?.map((s) => s.id) ?? [],
      durationMinutes: route.durationMinutes,
      segments: route.segments,
    })),
    totalDistanceKm: planResponse.totalDistanceKm,
    totalElevationGainM: planResponse.totalElevationGainM,
    totalDurationMinutes: planResponse.totalDurationMinutes,
  };
} 