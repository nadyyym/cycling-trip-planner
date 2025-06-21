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
  const features: SegmentGeoJSONFeature[] = segments.map((segment) => {
    let coordinates: [number, number][];

    if (segment.polyline) {
      // Use the full polyline geometry for accurate road following
      try {
        coordinates = decodePolyline(segment.polyline);
      } catch (error) {
        console.warn(
          `Failed to decode polyline for segment ${segment.id}:`,
          error,
        );
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
        komTime: segment.komTime,
        climbCategory: segment.climbCategory,
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    };
  });

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

/**
 * Decode polyline string to coordinates
 * Used when we have the full polyline data from segment detail
 */
export function decodePolyline(encodedPolyline: string): [number, number][] {
  const decoded = polyline.decode(encodedPolyline);
  return decoded.map(([lat, lng]) => [lng, lat] as [number, number]);
}

/**
 * Get bounding box for a segment
 * Used for zoom-to-segment functionality
 * Uses full polyline when available for accurate bounds
 */
export function getSegmentBounds(
  segment: SegmentDTO,
): [[number, number], [number, number]] {
  const padding = 0.001; // Small padding around the segment

  let coordinates: [number, number][];

  if (segment.polyline) {
    try {
      coordinates = decodePolyline(segment.polyline);
    } catch (error) {
      console.warn(`Failed to decode polyline for bounds calculation:`, error);
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

  return [
    [minLng, minLat], // SW
    [maxLng, maxLat], // NE
  ];
}

/**
 * Calculate the center point of a segment
 */
export function getSegmentCenter(segment: SegmentDTO): [number, number] {
  const centerLng = (segment.lonStart + segment.lonEnd) / 2;
  const centerLat = (segment.latStart + segment.latEnd) / 2;
  return [centerLng, centerLat];
}
