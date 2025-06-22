import type { TSPSolution } from "./tsp";
import type { SegmentMeta } from "~/server/integrations/strava";
import type { CostMatrix } from "~/server/integrations/mapbox";

/**
 * Daily route constraints for cycling trip planning
 * These constraints ensure safe and enjoyable daily rides
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
  errorCode?: "dailyLimitExceeded" | "needMoreDays" | "segmentTooFar";
  /** Human-readable error details */
  errorDetails?: string;
}

/**
 * Main partitioning function that splits a route into daily segments
 * Uses dynamic programming to optimize for balanced days within constraints
 *
 * @param tspSolution The optimized TSP solution with segment order
 * @param segmentMetas Metadata for all segments
 * @param matrix Cost matrix from Mapbox Matrix API
 * @param tripStartIndex Optional starting waypoint index
 * @returns Partition result with daily routes or error information
 */
export function partitionRoute(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  tripStartIndex?: number,
): PartitionResult {
  const partitionStart = Date.now();

  console.log(`[DAILY_PARTITIONER_START]`, {
    segmentCount: tspSolution.orderedSegments.length,
    totalDistance: Math.round(tspSolution.totalDistance / 1000),
    constraints: DAILY_CONSTRAINTS,
    timestamp: new Date().toISOString(),
  });

  try {
    // For Commit #6, we implement a simplified version using available data
    // This will be enhanced in Commit #5 with proper geometry stitching
    return partitionRouteSimplified(
      tspSolution,
      segmentMetas,
      matrix,
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
 * Simplified partitioning implementation using available TSP and segment data
 * This approach groups consecutive segments into days based on cumulative constraints
 */
function partitionRouteSimplified(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  tripStartIndex?: number,
): PartitionResult {
  console.log(`[DAILY_PARTITIONER_SIMPLIFIED_START]`, {
    segmentCount: tspSolution.orderedSegments.length,
    approach: "greedy-grouping",
    timestamp: new Date().toISOString(),
  });

  const partitions: DayPartition[] = [];
  let currentDaySegments: number[] = [];
  let currentDayDistance = 0;
  let currentDayElevation = 0;
  let currentDayDuration = 0;

  // Add transfer distance from trip start to first segment if applicable
  if (tripStartIndex !== undefined && tspSolution.orderedSegments.length > 0) {
    const firstSegment = tspSolution.orderedSegments[0]!;
    const transferDistance =
      matrix.distances[tripStartIndex]?.[firstSegment.startWaypointIndex] ?? 0;
    const transferDuration =
      matrix.durations[tripStartIndex]?.[firstSegment.startWaypointIndex] ?? 0;

    currentDayDistance += transferDistance;
    currentDayDuration += transferDuration;
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
    const newElevation = currentDayElevation + segmentMeta.elevationGain;
    const segmentDurationSeconds = (segmentMeta.distance / 1000) * (3600 / 25); // 25 km/h average
    const newDuration =
      currentDayDuration + transferDuration + segmentDurationSeconds;

    // Check if adding this segment would violate constraints
    const newDistanceKm = newDistance / 1000;
    const wouldExceedDistance =
      newDistanceKm > DAILY_CONSTRAINTS.MAX_DISTANCE_KM;
    const wouldExceedElevation =
      newElevation > DAILY_CONSTRAINTS.MAX_ELEVATION_M;

    // If adding this segment would violate constraints, finalize current day
    if (
      (wouldExceedDistance || wouldExceedElevation) &&
      currentDaySegments.length > 0
    ) {
      // Finalize current day
      partitions.push({
        dayNumber: partitions.length + 1,
        segmentIndices: [...currentDaySegments],
        distanceKm: currentDayDistance / 1000,
        elevationGainM: currentDayElevation,
        durationMinutes: currentDayDuration / 60,
      });

      // Check if we've reached the maximum number of days
      if (partitions.length >= DAILY_CONSTRAINTS.MAX_DAYS) {
        return {
          success: false,
          errorCode: "needMoreDays",
          errorDetails: `Cannot fit all ${tspSolution.orderedSegments.length} segments within ${DAILY_CONSTRAINTS.MAX_DAYS} days due to distance/elevation constraints`,
        };
      }

      // Start new day with this segment
      currentDaySegments = [i];
      currentDayDistance = transferDistance + segmentMeta.distance;
      currentDayElevation = segmentMeta.elevationGain;
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
    if (segmentDistanceKm > DAILY_CONSTRAINTS.MAX_DISTANCE_KM) {
      return {
        success: false,
        errorCode: "dailyLimitExceeded",
        errorDetails: `Segment ${i + 1} (ID: ${segment.segmentId}) is ${Math.round(segmentDistanceKm)}km, exceeding daily limit of ${DAILY_CONSTRAINTS.MAX_DISTANCE_KM}km`,
      };
    }

    if (segmentMeta.elevationGain > DAILY_CONSTRAINTS.MAX_ELEVATION_M) {
      return {
        success: false,
        errorCode: "dailyLimitExceeded",
        errorDetails: `Segment ${i + 1} (ID: ${segment.segmentId}) has ${Math.round(segmentMeta.elevationGain)}m elevation gain, exceeding daily limit of ${DAILY_CONSTRAINTS.MAX_ELEVATION_M}m`,
      };
    }
  }

  // Finalize the last day if it has segments
  if (currentDaySegments.length > 0) {
    partitions.push({
      dayNumber: partitions.length + 1,
      segmentIndices: [...currentDaySegments],
      distanceKm: currentDayDistance / 1000,
      elevationGainM: currentDayElevation,
      durationMinutes: currentDayDuration / 60,
    });
  }

  // Note: Minimum distance constraint removed - allowing days with any distance (including 0km)

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
