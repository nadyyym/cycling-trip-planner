import polyline from "@mapbox/polyline";
import { type SegmentDTO } from "~/server/integrations/strava";

/**
 * GeoJSON feature for a segment
 */
export interface SegmentGeoJSONFeature {
  type: "Feature";
  properties: {
    id: string;
    name: string;
    distance: number;
    averageGrade: number;
    elevationGain: number;
    ascentM: number;
    descentM: number;
    komTime?: string;
    climbCategory?: string;
  };
  geometry: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

/**
 * Convert segments to GeoJSON FeatureCollection for Mapbox
 * Uses full polyline geometry when available, falls back to start/end points
 */
export function segmentsToGeoJSON(segments: SegmentDTO[]) {
  const startTime = Date.now();
  let polylineSuccessCount = 0;
  let polylineFailureCount = 0;
  const fallbackSegments: string[] = [];

  console.log(`[MAPBOX_GEOJSON_CONVERSION_START]`, {
    segmentCount: segments.length,
    timestamp: new Date().toISOString(),
  });

  const features: SegmentGeoJSONFeature[] = segments.map((segment) => {
    let coordinates: [number, number][];

    if (segment.polyline) {
      // Use the full polyline geometry for accurate road following
      try {
        const decodeStart = Date.now();
        coordinates = decodePolyline(segment.polyline);
        const decodeDuration = Date.now() - decodeStart;

        polylineSuccessCount++;

        console.log(`[MAPBOX_POLYLINE_DECODE_SUCCESS]`, {
          segmentId: segment.id,
          segmentName: segment.name,
          polylineLength: segment.polyline.length,
          coordinateCount: coordinates.length,
          decodeDuration: `${decodeDuration}ms`,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        polylineFailureCount++;
        fallbackSegments.push(segment.id);

        console.warn(`[MAPBOX_POLYLINE_DECODE_ERROR]`, {
          segmentId: segment.id,
          segmentName: segment.name,
          polylineLength: segment.polyline?.length,
          error: error instanceof Error ? error.message : "Unknown error",
          fallbackUsed: true,
          timestamp: new Date().toISOString(),
        });

        // Fall back to straight line
        coordinates = [
          [segment.lonStart, segment.latStart],
          [segment.lonEnd, segment.latEnd],
        ];
      }
    } else {
      // Fall back to straight line from start to end
      coordinates = [
        [segment.lonStart, segment.latStart],
        [segment.lonEnd, segment.latEnd],
      ];
    }

    return {
      type: "Feature",
      properties: {
        id: segment.id,
        name: segment.name,
        distance: segment.distance,
        averageGrade: segment.averageGrade,
        elevationGain: segment.elevationGain,
        ascentM: segment.ascentM,
        descentM: segment.descentM,
        komTime: segment.komTime,
        climbCategory: segment.climbCategory,
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    };
  });

  const totalDuration = Date.now() - startTime;
  const polylineSuccessRate =
    segments.length > 0
      ? ((polylineSuccessCount / segments.length) * 100).toFixed(1)
      : 0;

  console.log(`[MAPBOX_GEOJSON_CONVERSION_COMPLETE]`, {
    segmentCount: segments.length,
    polylineSuccessCount,
    polylineFailureCount,
    polylineSuccessRate: `${polylineSuccessRate}%`,
    fallbackSegments,
    totalDuration: `${totalDuration}ms`,
    avgProcessingTime:
      segments.length > 0
        ? `${Math.round(totalDuration / segments.length)}ms`
        : "0ms",
    timestamp: new Date().toISOString(),
  });

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

/**
 * Decode Google/Strava polyline to coordinate array
 * @param encoded - Encoded polyline string
 * @returns Array of [longitude, latitude] coordinates
 */
function decodePolyline(encoded: string): [number, number][] {
  const decoded = polyline.decode(encoded);
  // polyline.decode returns [lat, lng] but we need [lng, lat] for GeoJSON
  return decoded.map((coord) => [coord[1], coord[0]]);
}

/**
 * Get bounding box for a segment
 * Used for zoom-to-segment functionality
 * Uses full polyline when available for accurate bounds
 */
export function getSegmentBounds(
  segment: SegmentDTO,
): [[number, number], [number, number]] {
  const startTime = Date.now();
  const padding = 0.001; // Small padding around the segment

  console.log(`[MAPBOX_SEGMENT_BOUNDS_START]`, {
    segmentId: segment.id,
    segmentName: segment.name,
    hasPolyline: !!segment.polyline,
    timestamp: new Date().toISOString(),
  });

  let coordinates: [number, number][];
  let usedPolyline = false;

  if (segment.polyline) {
    try {
      coordinates = decodePolyline(segment.polyline);
      usedPolyline = true;
    } catch (error) {
      console.warn(`[MAPBOX_BOUNDS_POLYLINE_ERROR]`, {
        segmentId: segment.id,
        error: error instanceof Error ? error.message : "Unknown error",
        fallbackUsed: true,
        timestamp: new Date().toISOString(),
      });

      // Fall back to start/end points
      coordinates = [
        [segment.lonStart, segment.latStart],
        [segment.lonEnd, segment.latEnd],
      ];
    }
  } else {
    // Fall back to start/end points
    coordinates = [
      [segment.lonStart, segment.latStart],
      [segment.lonEnd, segment.latEnd],
    ];
  }

  // Calculate bounds from all coordinates
  const lngs = coordinates.map((coord) => coord[0]);
  const lats = coordinates.map((coord) => coord[1]);

  const minLng = Math.min(...lngs) - padding;
  const maxLng = Math.max(...lngs) + padding;
  const minLat = Math.min(...lats) - padding;
  const maxLat = Math.max(...lats) + padding;

  const bounds: [[number, number], [number, number]] = [
    [minLng, minLat], // SW
    [maxLng, maxLat], // NE
  ];

  const duration = Date.now() - startTime;

  console.log(`[MAPBOX_SEGMENT_BOUNDS_COMPLETE]`, {
    segmentId: segment.id,
    segmentName: segment.name,
    usedPolyline,
    coordinateCount: coordinates.length,
    bounds,
    boundsArea: Math.abs((maxLng - minLng) * (maxLat - minLat)),
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  });

  return bounds;
}

/**
 * Calculate the center point of a segment
 */
export function getSegmentCenter(segment: SegmentDTO): [number, number] {
  const centerLng = (segment.lonStart + segment.lonEnd) / 2;
  const centerLat = (segment.latStart + segment.latEnd) / 2;

  console.log(`[MAPBOX_SEGMENT_CENTER]`, {
    segmentId: segment.id,
    segmentName: segment.name,
    center: [centerLng, centerLat],
    timestamp: new Date().toISOString(),
  });

  return [centerLng, centerLat];
}

/**
 * Day colors for multi-day trip visualization
 * Consistent colors used across map routes and UI components
 */
export const DAY_COLORS = {
  1: { hex: "#6366f1", name: "Blue", bgClass: "bg-blue-50", borderClass: "border-blue-200", textClass: "text-blue-600" },
  2: { hex: "#10b981", name: "Green", bgClass: "bg-green-50", borderClass: "border-green-200", textClass: "text-green-600" },
  3: { hex: "#f97316", name: "Orange", bgClass: "bg-orange-50", borderClass: "border-orange-200", textClass: "text-orange-600" },
  4: { hex: "#ec4899", name: "Pink", bgClass: "bg-pink-50", borderClass: "border-pink-200", textClass: "text-pink-600" },
} as const;

/**
 * Get color configuration for a specific day
 * @param dayNumber Day number (1-4)
 * @returns Color configuration object
 */
export function getDayColor(dayNumber: number) {
  return DAY_COLORS[dayNumber as keyof typeof DAY_COLORS] ?? DAY_COLORS[1];
}

/**
 * Get hex color for a specific day
 * @param dayNumber Day number (1-4)  
 * @returns Hex color string
 */
export function getDayColorHex(dayNumber: number): string {
  return getDayColor(dayNumber).hex;
}

/**
 * Get all day colors as an array for compatibility with existing code
 * @returns Array of hex color strings
 */
export function getDayColorsArray(): string[] {
  return [DAY_COLORS[1].hex, DAY_COLORS[2].hex, DAY_COLORS[3].hex, DAY_COLORS[4].hex];
}
