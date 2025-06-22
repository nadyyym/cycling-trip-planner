import type { TSPSolution } from "./tsp";
import type { SegmentMeta } from "~/server/integrations/strava";
import type { CostMatrix } from "~/server/integrations/mapbox";

/**
 * Custom trip constraints for personalized cycling trip planning
 */
export interface TripConstraints {
  /** Trip start date (ISO yyyy-mm-dd format) */
  startDate: string;
  /** Trip end date (ISO yyyy-mm-dd format) */
  endDate: string;
  /** Maximum distance per day in kilometers */
  maxDailyDistanceKm: number;
  /** Maximum elevation gain per day in meters */
  maxDailyElevationM: number;
}

/**
 * Daily route constraints for cycling trip planning
 * These constraints ensure safe and enjoyable daily rides
 * 
 * @deprecated Use TripConstraints instead for custom trip planning
 */
export const DAILY_CONSTRAINTS = {
  /** Minimum distance per day in kilometers */
  MIN_DISTANCE_KM: 0,
  /** Maximum distance per day in kilometers */
  MAX_DISTANCE_KM: 100,
  /** Maximum elevation gain per day in meters */
  MAX_ELEVATION_M: 1000,
  /** Maximum number of days for the entire trip */
  MAX_DAYS: 4,
} as const;

/**
 * Partition result for a single day
 * Represents one day's cycling route with metadata
 */
export interface DayPartition {
  /** Day number (1-based) */
  dayNumber: number;
  /** Segment indices included in this day (0-based in TSP solution order) */
  segmentIndices: number[];
  /** Total distance in kilometers */
  distanceKm: number;
  /** Total elevation gain in meters */
  elevationGainM: number;
  /** Estimated duration in minutes */
  durationMinutes: number;
}

/**
 * Result of the partitioning algorithm
 */
export interface PartitionResult {
  /** Whether partitioning was successful */
  success: boolean;
  /** Array of daily partitions (if successful) */
  partitions?: DayPartition[];
  /** Error code (if failed) */
  errorCode?: "dailyLimitExceeded" | "customLimitExceeded" | "needMoreDays" | "segmentTooFar";
  /** Human-readable error details */
  errorDetails?: string;
}

/**
 * Calculate the number of days in a trip (inclusive)
 * 
 * @param startDate Start date in ISO format (yyyy-mm-dd)
 * @param endDate End date in ISO format (yyyy-mm-dd)
 * @returns Number of days in the trip
 */
function calculateTripDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 for inclusive
  return diffDays;
}

/**
 * Main partitioning function that splits a route into daily segments with custom constraints
 * Uses a greedy approach to assign segments to days while respecting constraints
 *
 * @param tspSolution The optimized TSP solution with segment order
 * @param segmentMetas Metadata for all segments
 * @param matrix Cost matrix from Mapbox Matrix API
 * @param constraints Custom trip constraints
 * @param tripStartIndex Optional starting waypoint index
 * @returns Partition result with daily routes or error information
 */
export function partitionRoute(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  constraints: TripConstraints,
  tripStartIndex?: number,
): PartitionResult {
  const partitionStart = Date.now();

  console.log(`[DAILY_PARTITIONER_START]`, {
    segmentCount: tspSolution.orderedSegments.length,
    totalDistance: Math.round(tspSolution.totalDistance / 1000),
    constraints: {
      startDate: constraints.startDate,
      endDate: constraints.endDate,
      maxDailyDistanceKm: constraints.maxDailyDistanceKm,
      maxDailyElevationM: constraints.maxDailyElevationM,
    },
    timestamp: new Date().toISOString(),
  });

  try {
    // Calculate maximum allowed days from date range
    const maxDays = calculateTripDays(constraints.startDate, constraints.endDate);
    
    if (maxDays > 14) {
      return {
        success: false,
        errorCode: "needMoreDays",
        errorDetails: `Trip duration of ${maxDays} days exceeds maximum supported limit of 14 days`,
      };
    }

    // Use the enhanced partitioning with custom constraints
    return partitionRouteWithConstraints(
      tspSolution,
      segmentMetas,
      matrix,
      constraints,
      maxDays,
      tripStartIndex,
    );
  } catch (error) {
    const partitionDuration = Date.now() - partitionStart;

    console.error(`[DAILY_PARTITIONER_ERROR]`, {
      segmentCount: tspSolution.orderedSegments.length,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: `${partitionDuration}ms`,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    return {
      success: false,
      errorCode: "dailyLimitExceeded",
      errorDetails: `Partitioning failed: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

/**
 * Enhanced partitioning implementation with custom constraints
 * This is the main algorithm that assigns segments to days
 */
function partitionRouteWithConstraints(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  constraints: TripConstraints,
  maxDays: number,
  _tripStartIndex?: number, // Unused parameter but kept for interface compatibility
): PartitionResult {
  const partitions: DayPartition[] = [];
  
  let currentDayNumber = 1;
  let currentDaySegments: number[] = [];
  let currentDayDistance = 0; // in meters
  let currentDayElevation = 0; // in meters
  let currentDayDuration = 0; // in seconds

  // Validate input
  if (tspSolution.orderedSegments.length === 0) {
    return {
      success: false,
      errorCode: "dailyLimitExceeded",
      errorDetails: "No segments to partition",
    };
  }

  // Process each segment in the optimized order
  for (let i = 0; i < tspSolution.orderedSegments.length; i++) {
    const segment = tspSolution.orderedSegments[i]!;

    // Find the corresponding segment metadata
    const segmentMeta = segmentMetas.find(
      (meta) => meta.id === segment.segmentId.toString(),
    );

    if (!segmentMeta) {
      throw new Error(
        `Segment metadata not found for segment ${segment.segmentId}`,
      );
    }

    // Add transfer distance from previous segment (if not first)
    let transferDistance = 0;
    let transferDuration = 0;
    if (i > 0) {
      const prevSegment = tspSolution.orderedSegments[i - 1]!;
      transferDistance =
        matrix.distances[prevSegment.endWaypointIndex]?.[
          segment.startWaypointIndex
        ] ?? 0;
      transferDuration =
        matrix.durations[prevSegment.endWaypointIndex]?.[
          segment.startWaypointIndex
        ] ?? 0;
    }

    // Calculate what the new totals would be if we add this segment
    const newDistance =
      currentDayDistance + transferDistance + segmentMeta.distance;
    
    // Ensure elevation gain is a valid number
    const validSegmentElevation = Number.isFinite(segmentMeta.elevationGain) ? segmentMeta.elevationGain : 0;
    const newElevation = currentDayElevation + validSegmentElevation;
    
    const segmentDurationSeconds = (segmentMeta.distance / 1000) * (3600 / 25); // 25 km/h average
    const newDuration =
      currentDayDuration + transferDuration + segmentDurationSeconds;

    // Check if adding this segment would violate constraints
    const newDistanceKm = newDistance / 1000;
    const wouldExceedDistance = newDistanceKm > constraints.maxDailyDistanceKm;
    const wouldExceedElevation = newElevation > constraints.maxDailyElevationM;

    // If adding this segment would violate constraints, finalize current day
    if (
      (wouldExceedDistance || wouldExceedElevation) &&
      currentDaySegments.length > 0
    ) {
      // Finalize current day
      partitions.push({
        dayNumber: currentDayNumber,
        segmentIndices: [...currentDaySegments],
        distanceKm: currentDayDistance / 1000,
        elevationGainM: currentDayElevation,
        durationMinutes: currentDayDuration / 60,
      });

      // Check if we've reached the maximum number of days
      if (partitions.length >= maxDays) {
        return {
          success: false,
          errorCode: "needMoreDays",
          errorDetails: `Cannot fit all ${tspSolution.orderedSegments.length} segments within ${maxDays} days due to distance/elevation constraints`,
        };
      }

      // Start new day with this segment
      currentDayNumber = partitions.length + 1;
      currentDaySegments = [i];
      currentDayDistance = transferDistance + segmentMeta.distance;
      currentDayElevation = validSegmentElevation;
      currentDayDuration = transferDuration + segmentDurationSeconds;
    } else {
      // Add segment to current day
      currentDaySegments.push(i);
      currentDayDistance = newDistance;
      currentDayElevation = newElevation;
      currentDayDuration = newDuration;
    }

    // Check if a single segment exceeds daily limits
    const segmentDistanceKm = (transferDistance + segmentMeta.distance) / 1000;
    if (segmentDistanceKm > constraints.maxDailyDistanceKm) {
      return {
        success: false,
        errorCode: "customLimitExceeded",
        errorDetails: `Segment ${i + 1} (ID: ${segment.segmentId}) is ${Math.round(segmentDistanceKm)}km, exceeding your daily limit of ${constraints.maxDailyDistanceKm}km`,
      };
    }

    if (validSegmentElevation > constraints.maxDailyElevationM) {
      return {
        success: false,
        errorCode: "customLimitExceeded",
        errorDetails: `Segment ${i + 1} (ID: ${segment.segmentId}) has ${Math.round(validSegmentElevation)}m elevation gain, exceeding your daily limit of ${constraints.maxDailyElevationM}m`,
      };
    }
  }

  // Finalize the last day if it has segments
  if (currentDaySegments.length > 0) {
    partitions.push({
      dayNumber: currentDayNumber,
      segmentIndices: [...currentDaySegments],
      distanceKm: currentDayDistance / 1000,
      elevationGainM: currentDayElevation,
      durationMinutes: currentDayDuration / 60,
    });
  }

  const partitionDuration = Date.now() - Date.now();
  const totalDistanceKm = partitions.reduce((sum, p) => sum + p.distanceKm, 0);
  const totalElevationM = partitions.reduce(
    (sum, p) => sum + p.elevationGainM,
    0,
  );

  console.log(`[DAILY_PARTITIONER_SUCCESS]`, {
    segmentCount: tspSolution.orderedSegments.length,
    partitionCount: partitions.length,
    totalDistanceKm: Math.round(totalDistanceKm),
    totalElevationM: Math.round(totalElevationM),
    duration: `${partitionDuration}ms`,
    partitionSummary: partitions.map((p) => ({
      day: p.dayNumber,
      segments: p.segmentIndices.length,
      distanceKm: Math.round(p.distanceKm),
      elevationM: Math.round(p.elevationGainM),
      durationHours: Math.round((p.durationMinutes / 60) * 10) / 10,
    })),
    timestamp: new Date().toISOString(),
  });

  return {
    success: true,
    partitions,
  };
}

/**
 * Legacy partitioning function for backward compatibility
 * 
 * @deprecated Use partitionRoute with TripConstraints instead
 */
export function partitionRouteLegacy(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  tripStartIndex?: number,
): PartitionResult {
  // Convert legacy constraints to new format
  const legacyConstraints: TripConstraints = {
    startDate: new Date().toISOString().split('T')[0]!,
    endDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!, // 4 days from now
    maxDailyDistanceKm: DAILY_CONSTRAINTS.MAX_DISTANCE_KM,
    maxDailyElevationM: DAILY_CONSTRAINTS.MAX_ELEVATION_M,
  };

  return partitionRoute(tspSolution, segmentMetas, matrix, legacyConstraints, tripStartIndex);
}
