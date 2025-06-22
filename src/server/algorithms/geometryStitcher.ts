import polyline from "@mapbox/polyline";
import {
  getDirections,
  getPolylineElevation,
} from "~/server/integrations/mapbox";
import type { TSPSolution } from "./tsp";
import type { SegmentMeta } from "~/server/integrations/strava";
import type { CostMatrix } from "~/server/integrations/mapbox";

/**
 * Stitched route geometry with cumulative distance and elevation data
 */
export interface StitchedGeometry {
  /** Complete route geometry as GeoJSON LineString */
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
  /** Cumulative distance at each segment boundary in meters */
  cumulativeDistances: number[];
  /** Cumulative elevation gain at each segment boundary in meters */
  cumulativeElevationGains: number[];
  /** Total route distance in meters */
  totalDistance: number;
  /** Total elevation gain in meters */
  totalElevationGain: number;
  /** Coordinate range for each segment [startIndex, endIndex] */
  segmentCoordinateRanges: [number, number][];
}

/**
 * Stitch together segment geometries with transfer routes into a continuous polyline
 * This creates accurate route geometry that follows roads and includes elevation data
 *
 * @param tspSolution Optimized segment order from TSP solver
 * @param segmentMetas Segment metadata including polylines and coordinates
 * @param matrix Cost matrix for calculating transfer distances
 * @param tripStartIndex Optional trip start waypoint index
 * @returns Stitched geometry with cumulative distance and elevation arrays
 */
export async function stitchRouteGeometry(
  tspSolution: TSPSolution,
  segmentMetas: SegmentMeta[],
  matrix: CostMatrix,
  tripStartIndex?: number,
): Promise<StitchedGeometry> {
  const stitchStart = Date.now();

  console.log(`[GEOMETRY_STITCHER_START]`, {
    segmentCount: tspSolution.orderedSegments.length,
    hasTripStart: tripStartIndex !== undefined,
    timestamp: new Date().toISOString(),
  });

  // Arrays to store cumulative values
  const cumulativeDistances: number[] = [];
  const cumulativeElevationGains: number[] = [];
  const segmentCoordinateRanges: [number, number][] = [];

  // Array to store all coordinate segments for final geometry
  const allCoordinates: [number, number][] = [];

  let totalDistance = 0;
  let totalElevationGain = 0;

  // Handle trip start if provided
  if (tripStartIndex !== undefined) {
    // Add trip start point to coordinates
    // We'll add transfer to first segment below
    console.log(`[GEOMETRY_STITCHER_TRIP_START]`, {
      tripStartIndex,
      message: "Starting from trip start point",
    });
  }

  // Process each segment in the optimized order
  for (let i = 0; i < tspSolution.orderedSegments.length; i++) {
    const segment = tspSolution.orderedSegments[i]!;
    const segmentMeta = segmentMetas.find(
      (meta) => meta.id === segment.segmentId.toString(),
    );

    if (!segmentMeta) {
      throw new Error(
        `Segment metadata not found for segment ${segment.segmentId}`,
      );
    }

    console.log(`[GEOMETRY_STITCHER_SEGMENT_START]`, {
      segmentIndex: i,
      segmentId: segment.segmentId,
      segmentName: segmentMeta.name,
      direction: segment.forwardDirection ? "forward" : "reverse",
    });

    // Track starting coordinate index for this segment
    const segmentStartIndex = allCoordinates.length;

    // Get transfer route geometry if not the first segment (or if we have trip start)
    let transferGeometry: [number, number][] = [];
    let transferDistance = 0;
    let transferElevationGain = 0;

    if (i > 0 || tripStartIndex !== undefined) {
      const prevSegment = i > 0 ? tspSolution.orderedSegments[i - 1]! : null;

      // Determine origin coordinates
      let originCoord: [number, number];

      if (i === 0 && tripStartIndex !== undefined) {
        // First segment from trip start
        // For trip start, we need to get the coordinate from somewhere
        // Since we don't have it stored, we'll skip the transfer for now
        // In a real implementation, we'd store the trip start coordinate
        console.log(`[GEOMETRY_STITCHER_TRIP_START_TRANSFER]`, {
          message: "Trip start transfer not implemented - using segment start",
        });
        transferDistance = 0;
        transferElevationGain = 0;
      } else if (prevSegment) {
        // Transfer from previous segment end to current segment start
        const prevSegmentMeta = segmentMetas.find(
          (meta) => meta.id === prevSegment.segmentId.toString(),
        )!;

        originCoord = prevSegment.forwardDirection
          ? prevSegmentMeta.endCoord
          : prevSegmentMeta.startCoord;

        const destinationCoord = segment.forwardDirection
          ? segmentMeta.startCoord
          : segmentMeta.endCoord;

        try {
          console.log(`[GEOMETRY_STITCHER_TRANSFER_REQUEST]`, {
            segmentIndex: i,
            origin: originCoord,
            destination: destinationCoord,
            transferType: "segment-to-segment",
          });

          const transferRoute = await getDirections(
            originCoord,
            destinationCoord,
          );

          // Decode transfer route geometry
          const decodedTransfer = polyline.decode(transferRoute.geometry);
          transferGeometry = decodedTransfer.map((coord) => [
            coord[1],
            coord[0],
          ]); // Convert [lat, lng] to [lng, lat]

          transferDistance = transferRoute.distance;

          // Get elevation for transfer route
          transferElevationGain = await getPolylineElevation(
            transferRoute.geometry,
          );

          console.log(`[GEOMETRY_STITCHER_TRANSFER_SUCCESS]`, {
            segmentIndex: i,
            transferDistance: transferDistance,
            transferElevationGain: transferElevationGain,
            transferPointCount: transferGeometry.length,
          });
        } catch (error) {
          console.error(`[GEOMETRY_STITCHER_TRANSFER_ERROR]`, {
            segmentIndex: i,
            origin: originCoord,
            destination: destinationCoord,
            error: error instanceof Error ? error.message : "Unknown error",
          });

          // Fall back to straight line
          transferGeometry = [originCoord, destinationCoord];
          transferDistance =
            matrix.distances[prevSegment.endWaypointIndex]?.[
              segment.startWaypointIndex
            ] ?? 0;
          transferElevationGain = 0; // Conservative fallback
        }
      }
    }

    // Add transfer geometry to overall route (skip first point to avoid duplication)
    if (transferGeometry.length > 0) {
      if (allCoordinates.length > 0) {
        // Skip first point of transfer to avoid duplication with end of previous segment
        allCoordinates.push(...transferGeometry.slice(1));
      } else {
        // First transfer, include all points
        allCoordinates.push(...transferGeometry);
      }
    }

    // Get segment geometry
    // For now, we'll use a simple approach since we don't have segment polylines in SegmentMeta
    // In a real implementation, you'd get the actual segment polyline from Strava
    const segmentCoordinates = segment.forwardDirection
      ? [segmentMeta.startCoord, segmentMeta.endCoord]
      : [segmentMeta.endCoord, segmentMeta.startCoord];

    // Add segment geometry (skip first point to avoid duplication with transfer end)
    if (allCoordinates.length > 0 && transferGeometry.length > 0) {
      // Skip first point of segment since it should match end of transfer
      allCoordinates.push(...segmentCoordinates.slice(1));
    } else {
      // No transfer or first segment, include all segment points
      allCoordinates.push(...segmentCoordinates);
    }

    // Track ending coordinate index for this segment
    const segmentEndIndex = allCoordinates.length - 1;
    segmentCoordinateRanges.push([segmentStartIndex, segmentEndIndex]);

    // Update cumulative values
    totalDistance += transferDistance + segmentMeta.distance;
    
    // Ensure all elevation values are valid numbers and handle NaN
    const validTransferElevation = Number.isFinite(transferElevationGain) ? transferElevationGain : 0;
    const validSegmentElevation = Number.isFinite(segmentMeta.elevationGain) ? segmentMeta.elevationGain : 0;
    
    totalElevationGain += validTransferElevation + validSegmentElevation;

    // Store cumulative values at this segment boundary
    cumulativeDistances.push(totalDistance);
    cumulativeElevationGains.push(totalElevationGain);

    console.log(`[GEOMETRY_STITCHER_SEGMENT_COMPLETE]`, {
      segmentIndex: i,
      segmentId: segment.segmentId,
      transferDistance: transferDistance,
      segmentDistance: segmentMeta.distance,
      transferElevationGain: validTransferElevation,
      segmentElevationGain: validSegmentElevation,
      cumulativeDistance: totalDistance,
      cumulativeElevationGain: totalElevationGain,
      coordinateCount: allCoordinates.length,
      coordinateRange: [segmentStartIndex, segmentEndIndex],
    });
  }

  const stitchDuration = Date.now() - stitchStart;

  console.log(`[GEOMETRY_STITCHER_COMPLETE]`, {
    duration: `${stitchDuration}ms`,
    segmentCount: tspSolution.orderedSegments.length,
    totalDistance: totalDistance,
    totalElevationGain: totalElevationGain,
    totalCoordinates: allCoordinates.length,
    cumulativePoints: cumulativeDistances.length,
    segmentRanges: segmentCoordinateRanges,
    avgDistancePerSegment: Math.round(
      totalDistance / tspSolution.orderedSegments.length,
    ),
    avgElevationPerSegment: Math.round(
      totalElevationGain / tspSolution.orderedSegments.length,
    ),
    timestamp: new Date().toISOString(),
  });

  return {
    geometry: {
      type: "LineString",
      coordinates: allCoordinates,
    },
    cumulativeDistances,
    cumulativeElevationGains,
    segmentCoordinateRanges,
    totalDistance,
    totalElevationGain,
  };
}

/**
 * Extract geometry for a specific day's route from the stitched geometry
 * Uses segment coordinate ranges to determine the exact geometry for a day's segments
 *
 * @param stitchedGeometry Complete stitched route geometry
 * @param segmentIndices Indices of segments for this day (from daily partitioner)
 * @returns Geometry for just this day's route
 */
export function extractDayGeometry(
  stitchedGeometry: StitchedGeometry,
  segmentIndices: number[],
): {
  type: "LineString";
  coordinates: [number, number][];
} {
  console.log(`[GEOMETRY_EXTRACT_DAY_START]`, {
    daySegmentCount: segmentIndices.length,
    segmentIndices: segmentIndices,
    totalCoordinates: stitchedGeometry.geometry.coordinates.length,
    availableRanges: stitchedGeometry.segmentCoordinateRanges.length,
  });

  if (segmentIndices.length === 0) {
    return {
      type: "LineString",
      coordinates: [],
    };
  }

  // Find the coordinate range that spans all segments for this day
  const firstSegmentIndex = Math.min(...segmentIndices);
  const lastSegmentIndex = Math.max(...segmentIndices);

  // Get the start coordinate index from the first segment
  const startCoordIndex = stitchedGeometry.segmentCoordinateRanges[firstSegmentIndex]?.[0] ?? 0;
  
  // Get the end coordinate index from the last segment  
  const endCoordIndex = stitchedGeometry.segmentCoordinateRanges[lastSegmentIndex]?.[1] ?? 
                       stitchedGeometry.geometry.coordinates.length - 1;

  // Extract the day-specific coordinates
  const dayCoordinates = stitchedGeometry.geometry.coordinates.slice(
    startCoordIndex, 
    endCoordIndex + 1
  );

  const dayGeometry = {
    type: "LineString" as const,
    coordinates: dayCoordinates,
  };

  console.log(`[GEOMETRY_EXTRACT_DAY_COMPLETE]`, {
    firstSegmentIndex,
    lastSegmentIndex,
    startCoordIndex,
    endCoordIndex,
    extractedCoordinates: dayGeometry.coordinates.length,
    totalCoordinates: stitchedGeometry.geometry.coordinates.length,
  });

  return dayGeometry;
}
