import { env } from "~/env";
import { LRUCache } from "~/server/cache/lru";

/**
 * Types for Mapbox API responses
 */
interface MapboxMatrixResponse {
  distances?: number[][];
  durations?: number[][];
  code: string;
  message?: string;
}

interface MapboxDirectionsResponse {
  routes: Array<{
    geometry: string; // encoded polyline
    distance: number; // meters
    duration: number; // seconds
    legs: Array<{
      distance: number;
      duration: number;
    }>;
  }>;
  code: string;
  message?: string;
}

interface MapboxRoute {
  geometry: string; // encoded polyline
  distance: number; // meters
  duration: number; // seconds
}

interface ElevationResponse {
  totalElevationGain: number; // meters
}

/**
 * Error types for external API failures
 */
export class ExternalApiError extends Error {
  constructor(
    public readonly service: string,
    public readonly status: number,
    public readonly message: string,
    public readonly endpoint: string,
  ) {
    super(`${service} API Error (${status}): ${message}`);
    this.name = "ExternalApiError";
  }
}

/**
 * Coordinate pair [longitude, latitude]
 */
export type Coordinate = [number, number];

/**
 * Matrix result containing distance and duration matrices
 */
export interface CostMatrix {
  distances: number[][]; // meters
  durations: number[][]; // seconds
}

/**
 * Dedicated cache instances for different API types
 * Using longer TTL (24h) for stable data like routing matrices
 */
const matrixCache = new LRUCache<CostMatrix>({
  maxSize: 1000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
});

const directionsCache = new LRUCache<MapboxRoute>({
  maxSize: 1000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
});

const elevationCache = new LRUCache<ElevationResponse>({
  maxSize: 1000,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
});

/**
 * Make authenticated request to Mapbox API with error handling
 */
async function mapboxRequest<T>(endpoint: string, url: string): Promise<T> {
  const requestStart = Date.now();
  const requestId = Math.random().toString(36).substring(7);

  console.log(`[MAPBOX_API_REQUEST_START]`, {
    requestId,
    endpoint,
    url: url.replace(env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN, "[TOKEN]"),
    timestamp: new Date().toISOString(),
  });

  try {
    const response = await fetch(url);
    const duration = Date.now() - requestStart;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[MAPBOX_API_ERROR]`, {
        requestId,
        endpoint,
        status: response.status,
        statusText: response.statusText,
        error: errorText,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      throw new ExternalApiError(
        "Mapbox",
        response.status,
        errorText || response.statusText,
        endpoint,
      );
    }

    const data = (await response.json()) as Record<string, unknown>;

    // Check if Mapbox returned an error in the response body
    if (data.code && data.code !== "Ok") {
      const code = data.code as string;
      const message = data.message as string | undefined;

      console.error(`[MAPBOX_API_RESPONSE_ERROR]`, {
        requestId,
        endpoint,
        code,
        message,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      throw new ExternalApiError(
        "Mapbox",
        200,
        message ?? `API returned error code: ${code}`,
        endpoint,
      );
    }

    console.log(`[MAPBOX_API_SUCCESS]`, {
      requestId,
      endpoint,
      status: response.status,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });

    return data as T;
  } catch (error) {
    const duration = Date.now() - requestStart;

    if (error instanceof ExternalApiError) {
      throw error;
    }

    console.error(`[MAPBOX_API_REQUEST_ERROR]`, {
      requestId,
      endpoint,
      error: error instanceof Error ? error.message : "Unknown error",
      duration: `${duration}ms`,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });

    throw new ExternalApiError(
      "Mapbox",
      0,
      error instanceof Error ? error.message : "Network error",
      endpoint,
    );
  }
}

/**
 * Get distance and duration matrix between multiple points using Mapbox Matrix API
 * Optimized for cycling profile to match route planning needs
 *
 * @param coordinates Array of [longitude, latitude] pairs (max 25 points)
 * @returns Cost matrix with distances (meters) and durations (seconds)
 */
export async function getMatrix(
  coordinates: Coordinate[],
): Promise<CostMatrix> {
  const cacheKey = coordinates
    .map((coord) => `${coord[0].toFixed(6)},${coord[1].toFixed(6)}`)
    .join("|");

  // Check cache first
  const cached = matrixCache.get(cacheKey);
  if (cached) {
    console.log(`[MAPBOX_MATRIX_CACHE_HIT]`, {
      coordinateCount: coordinates.length,
      cacheKey: cacheKey.substring(0, 50) + "...",
      timestamp: new Date().toISOString(),
    });
    return cached;
  }

  console.log(`[MAPBOX_MATRIX_START]`, {
    coordinateCount: coordinates.length,
    maxCoordinates: 25,
    profile: "cycling",
    annotations: "distance,duration",
    timestamp: new Date().toISOString(),
  });

  // Validate input
  if (coordinates.length === 0) {
    throw new Error("At least one coordinate required");
  }

  if (coordinates.length > 25) {
    throw new Error("Maximum 25 coordinates allowed for Matrix API");
  }

  // Build coordinate string for URL
  const coordStr = coordinates
    .map((coord) => `${coord[0]},${coord[1]}`)
    .join(";");

  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/cycling/${coordStr}?annotations=distance,duration&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;

  const response = await mapboxRequest<MapboxMatrixResponse>("matrix", url);

  if (!response.distances || !response.durations) {
    throw new ExternalApiError(
      "Mapbox",
      200,
      "Matrix response missing distance or duration data",
      "matrix",
    );
  }

  const result: CostMatrix = {
    distances: response.distances,
    durations: response.durations,
  };

  // Cache the result
  matrixCache.set(cacheKey, result);

  console.log(`[MAPBOX_MATRIX_SUCCESS]`, {
    coordinateCount: coordinates.length,
    matrixSize: `${result.distances.length}x${result.distances[0]?.length ?? 0}`,
    maxDistance: Math.max(...result.distances.flat()),
    avgDistance: Math.round(
      result.distances.flat().reduce((sum, d) => sum + d, 0) /
        result.distances.flat().length,
    ),
    cached: true,
    timestamp: new Date().toISOString(),
  });

  return result;
}

/**
 * Get detailed route geometry between two points using Mapbox Directions API
 * Returns encoded polyline string and route metadata
 *
 * @param origin [longitude, latitude] of start point
 * @param destination [longitude, latitude] of end point
 * @returns Route with geometry, distance and duration
 */
export async function getDirections(
  origin: Coordinate,
  destination: Coordinate,
): Promise<MapboxRoute> {
  const cacheKey = `${origin[0].toFixed(6)},${origin[1].toFixed(6)}-${destination[0].toFixed(6)},${destination[1].toFixed(6)}`;

  // Check cache first
  const cached = directionsCache.get(cacheKey);
  if (cached) {
    console.log(`[MAPBOX_DIRECTIONS_CACHE_HIT]`, {
      origin,
      destination,
      cacheKey,
      timestamp: new Date().toISOString(),
    });
    return cached;
  }

  console.log(`[MAPBOX_DIRECTIONS_START]`, {
    origin,
    destination,
    profile: "cycling",
    geometry: "polyline",
    timestamp: new Date().toISOString(),
  });

  const url = `https://api.mapbox.com/directions/v5/mapbox/cycling/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?geometries=polyline&access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}`;

  const response = await mapboxRequest<MapboxDirectionsResponse>(
    "directions",
    url,
  );

  if (!response.routes || response.routes.length === 0) {
    throw new ExternalApiError(
      "Mapbox",
      200,
      "No route found between the given points",
      "directions",
    );
  }

  const route = response.routes[0]!;
  const result: MapboxRoute = {
    geometry: route.geometry,
    distance: route.distance,
    duration: route.duration,
  };

  // Cache the result
  directionsCache.set(cacheKey, result);

  console.log(`[MAPBOX_DIRECTIONS_SUCCESS]`, {
    origin,
    destination,
    distance: result.distance,
    duration: result.duration,
    hasGeometry: !!result.geometry,
    cached: true,
    timestamp: new Date().toISOString(),
  });

  return result;
}

/**
 * Get total elevation gain for a given polyline using elevation service
 * This is a simplified implementation - in production you might want to use
 * a more sophisticated elevation API or Mapbox's Map Matching API
 *
 * @param polyline Encoded polyline string
 * @returns Total elevation gain in meters
 */
export async function getPolylineElevation(polyline: string): Promise<number> {
  const cacheKey = polyline;

  // Check cache first
  const cached = elevationCache.get(cacheKey);
  if (cached) {
    console.log(`[MAPBOX_ELEVATION_CACHE_HIT]`, {
      polylineLength: polyline.length,
      elevationGain: cached.totalElevationGain,
      timestamp: new Date().toISOString(),
    });
    return cached.totalElevationGain;
  }

  console.log(`[MAPBOX_ELEVATION_START]`, {
    polylineLength: polyline.length,
    service: "open-elevation",
    timestamp: new Date().toISOString(),
  });

  // For now, we'll use a simple heuristic based on the polyline
  // In a real implementation, you would:
  // 1. Decode the polyline to get coordinate points
  // 2. Sample points along the route (e.g., every 100m)
  // 3. Call an elevation API (like open-elevation.com) to get elevations
  // 4. Calculate total elevation gain from the elevation profile

  // Simplified heuristic: estimate elevation gain based on polyline complexity
  // This is a placeholder that should be replaced with actual elevation API calls
  const estimatedElevationGain = Math.max(
    0,
    Math.min(1000, polyline.length * 0.1),
  );

  const result: ElevationResponse = {
    totalElevationGain: estimatedElevationGain,
  };

  // Cache the result
  elevationCache.set(cacheKey, result);

  console.log(`[MAPBOX_ELEVATION_SUCCESS]`, {
    polylineLength: polyline.length,
    elevationGain: result.totalElevationGain,
    method: "heuristic",
    cached: true,
    note: "Using simplified heuristic - replace with actual elevation API in production",
    timestamp: new Date().toISOString(),
  });

  return result.totalElevationGain;
}
