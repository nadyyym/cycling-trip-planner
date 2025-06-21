import { TRPCError } from "@trpc/server";

// Types for Strava API responses
interface StravaSegmentExploreResponse {
  segments: Array<{
    id: number;
    name: string;
    distance: number;
    avg_grade: number;
    start_latlng: [number, number];
    end_latlng: [number, number];
    climb_category: number;
    elev_difference: number;
    kom_time?: number; // in seconds
  }>;
}

interface StravaSegmentDetailResponse {
  id: number;
  name: string;
  distance: number;
  average_grade: number;
  start_latlng: [number, number];
  end_latlng: [number, number];
  climb_category: number;
  elevation_high: number;
  elevation_low: number;
  map: {
    polyline: string;
  };
  kom?: {
    elapsed_time: number; // in seconds
  };
  elev_difference: number;
}

interface StravaTokenRefreshResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

// DTO types for our API
export interface SegmentDTO {
  id: string;
  name: string;
  distance: number; // in meters
  averageGrade: number; // percentage
  latStart: number;
  lonStart: number;
  latEnd: number;
  lonEnd: number;
  polyline?: string; // encoded polyline for full geometry
  komTime?: string; // formatted as "mm:ss"
  climbCategory?: string; // "HC", "1", "2", "3", "4"
  elevationGain: number; // in meters
}

export interface SegmentDetailDTO extends SegmentDTO {
  polyline: string;
  elevHigh: number;
  elevLow: number;
}

export interface BoundsInput {
  sw: [number, number]; // [lat, lng]
  ne: [number, number]; // [lat, lng]
}

/**
 * Simplified segment metadata for route planning
 * Contains only the essential data needed for optimization algorithms
 */
export interface SegmentMeta {
  id: string;
  name: string;
  distance: number; // in meters
  elevationGain: number; // in meters
  startCoord: [number, number]; // [longitude, latitude]
  endCoord: [number, number]; // [longitude, latitude]
}

/**
 * Strava API client with token management
 */
export class StravaClient {
  private accessToken: string;
  private refreshToken: string;
  private expiresAt: number;
  private onTokenRefresh?: (tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  }) => Promise<void>;

  constructor(
    accessToken: string,
    refreshToken: string,
    expiresAt: number,
    onTokenRefresh?: (tokens: {
      accessToken: string;
      refreshToken: string;
      expiresAt: number;
    }) => Promise<void>,
  ) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.expiresAt = expiresAt;
    this.onTokenRefresh = onTokenRefresh;

    console.log(`[STRAVA_CLIENT_INIT]`, {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt: expiresAt,
      expiresIn: Math.max(0, expiresAt - Math.floor(Date.now() / 1000)),
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Refresh the access token if it's expired or about to expire
   */
  private async ensureValidToken(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 300; // 5 minutes buffer
    const timeUntilExpiry = this.expiresAt - now;

    console.log(`[STRAVA_TOKEN_CHECK]`, {
      expiresAt: this.expiresAt,
      currentTime: now,
      timeUntilExpiry,
      bufferTime,
      needsRefresh: timeUntilExpiry < bufferTime,
      timestamp: new Date().toISOString(),
    });

    if (timeUntilExpiry < bufferTime) {
      const refreshStart = Date.now();
      console.log(`[STRAVA_TOKEN_REFRESH_START]`, {
        reason: timeUntilExpiry <= 0 ? "token_expired" : "token_near_expiry",
        timeUntilExpiry,
        timestamp: new Date().toISOString(),
      });

      try {
        const response = await fetch("https://www.strava.com/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.STRAVA_CLIENT_ID,
            client_secret: process.env.STRAVA_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: this.refreshToken,
          }),
        });

        const refreshDuration = Date.now() - refreshStart;

        if (!response.ok) {
          console.error(`[STRAVA_TOKEN_REFRESH_ERROR]`, {
            status: response.status,
            statusText: response.statusText,
            duration: `${refreshDuration}ms`,
            timestamp: new Date().toISOString(),
          });
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = (await response.json()) as StravaTokenRefreshResponse;

        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.expiresAt = data.expires_at;

        console.log(`[STRAVA_TOKEN_REFRESH_SUCCESS]`, {
          duration: `${refreshDuration}ms`,
          newExpiresAt: data.expires_at,
          newExpiresIn: Math.max(0, data.expires_at - Math.floor(Date.now() / 1000)),
          timestamp: new Date().toISOString(),
        });

        // Notify caller about token refresh so they can update the database
        if (this.onTokenRefresh) {
          const callbackStart = Date.now();
          await this.onTokenRefresh({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: this.expiresAt,
          });
          const callbackDuration = Date.now() - callbackStart;

          console.log(`[STRAVA_TOKEN_CALLBACK_COMPLETE]`, {
            duration: `${callbackDuration}ms`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        const refreshDuration = Date.now() - refreshStart;
        console.error(`[STRAVA_TOKEN_REFRESH_FAILED]`, {
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${refreshDuration}ms`,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });
        
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Failed to refresh Strava token",
        });
      }
    }
  }

  /**
   * Make authenticated request to Strava API
   */
  private async stravaRequest<T>(endpoint: string): Promise<T> {
    const requestStart = Date.now();
    const requestId = Math.random().toString(36).substring(7);

    console.log(`[STRAVA_API_REQUEST_START]`, {
      requestId,
      endpoint,
      timestamp: new Date().toISOString(),
    });

    await this.ensureValidToken();

    try {
      const response = await fetch(`https://www.strava.com/api/v3${endpoint}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
      });

      const duration = Date.now() - requestStart;

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        console.warn(`[STRAVA_API_RATE_LIMITED]`, {
          requestId,
          endpoint,
          retryAfter,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "Strava rate limit exceeded",
          cause: { retryAfter: retryAfter ? parseInt(retryAfter) : 60 },
        });
      }

      if (!response.ok) {
        console.error(`[STRAVA_API_ERROR]`, {
          requestId,
          endpoint,
          status: response.status,
          statusText: response.statusText,
          duration: `${duration}ms`,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Strava API error: ${response.status}`,
        });
      }

      console.log(`[STRAVA_API_SUCCESS]`, {
        requestId,
        endpoint,
        status: response.status,
        duration: `${duration}ms`,
        timestamp: new Date().toISOString(),
      });

      return response.json() as T;
    } catch (error) {
      const duration = Date.now() - requestStart;
      
      // If it's already a TRPCError, just log and re-throw
      if (error instanceof TRPCError) {
        throw error;
      }

      console.error(`[STRAVA_API_REQUEST_ERROR]`, {
        requestId,
        endpoint,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${duration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Strava API request failed: ${endpoint}`,
        cause: error,
      });
    }
  }

  /**
   * Explore segments within given bounds and fetch their detailed polylines
   */
  async exploreSegments(bounds: BoundsInput): Promise<SegmentDTO[]> {
    const { sw, ne } = bounds;
    // Strava expects bounds as: sw_lat,sw_lng,ne_lat,ne_lng
    const boundsStr = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;
    const exploreStart = Date.now();

    console.log(`[STRAVA_EXPLORE_SEGMENTS_START]`, {
      bounds: boundsStr,
      boundsArea: Math.abs((ne[0] - sw[0]) * (ne[1] - sw[1])),
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.stravaRequest<StravaSegmentExploreResponse>(
        `/segments/explore?bounds=${boundsStr}&activity_type=riding`,
      );

      console.log(`[STRAVA_EXPLORE_FOUND_SEGMENTS]`, {
        bounds: boundsStr,
        segmentCount: data.segments.length,
        message: "Fetching detailed polylines for each segment",
        timestamp: new Date().toISOString(),
      });

      // Fetch detailed information for each segment to get polylines
      // We'll do this in batches to avoid hitting rate limits too hard
      const segments: SegmentDTO[] = [];
      let successCount = 0;
      let failureCount = 0;

      for (const segment of data.segments) {
        const segmentDetailStart = Date.now();
        try {
          // Fetch detailed segment info to get the polyline
          const detailData =
            await this.stravaRequest<StravaSegmentDetailResponse>(
              `/segments/${segment.id}`,
            );

          segments.push({
            id: segment.id.toString(),
            name: segment.name,
            distance: segment.distance,
            averageGrade: segment.avg_grade,
            latStart: segment.start_latlng[0],
            lonStart: segment.start_latlng[1],
            latEnd: segment.end_latlng[0],
            lonEnd: segment.end_latlng[1],
            polyline: detailData.map.polyline, // Now we have the full polyline!
            komTime: segment.kom_time
              ? formatTime(segment.kom_time)
              : undefined,
            climbCategory: formatClimbCategory(segment.climb_category),
            elevationGain: segment.elev_difference,
          });

          successCount++;
          const segmentDetailDuration = Date.now() - segmentDetailStart;

          console.log(`[STRAVA_SEGMENT_DETAIL_SUCCESS]`, {
            segmentId: segment.id,
            segmentName: segment.name,
            duration: `${segmentDetailDuration}ms`,
            hasPolyline: !!detailData.map.polyline,
            timestamp: new Date().toISOString(),
          });
        } catch (error) {
          failureCount++;
          const segmentDetailDuration = Date.now() - segmentDetailStart;
          
          console.warn(`[STRAVA_SEGMENT_DETAIL_FALLBACK]`, {
            segmentId: segment.id,
            segmentName: segment.name,
            error: error instanceof Error ? error.message : 'Unknown error',
            duration: `${segmentDetailDuration}ms`,
            message: "Using basic segment data without polyline",
            timestamp: new Date().toISOString(),
          });
          
          // Fall back to basic segment without polyline
          segments.push({
            id: segment.id.toString(),
            name: segment.name,
            distance: segment.distance,
            averageGrade: segment.avg_grade,
            latStart: segment.start_latlng[0],
            lonStart: segment.start_latlng[1],
            latEnd: segment.end_latlng[0],
            lonEnd: segment.end_latlng[1],
            // No polyline - will fall back to straight line
            komTime: segment.kom_time
              ? formatTime(segment.kom_time)
              : undefined,
            climbCategory: formatClimbCategory(segment.climb_category),
            elevationGain: segment.elev_difference,
          });
        }
      }

      const exploreDuration = Date.now() - exploreStart;
      const polylineSuccessRate = data.segments.length > 0 ? (successCount / data.segments.length * 100).toFixed(1) : 0;

      console.log(`[STRAVA_EXPLORE_SEGMENTS_COMPLETE]`, {
        bounds: boundsStr,
        totalSegments: data.segments.length,
        successCount,
        failureCount,
        polylineSuccessRate: `${polylineSuccessRate}%`,
        totalDuration: `${exploreDuration}ms`,
        avgTimePerSegment: `${data.segments.length > 0 ? Math.round(exploreDuration / data.segments.length) : 0}ms`,
        timestamp: new Date().toISOString(),
      });

      return segments;
    } catch (error) {
      const exploreDuration = Date.now() - exploreStart;
      
      console.error(`[STRAVA_EXPLORE_SEGMENTS_ERROR]`, {
        bounds: boundsStr,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${exploreDuration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
  }

  /**
   * Get detailed information about a specific segment
   */
  async getSegmentDetail(segmentId: string): Promise<SegmentDetailDTO> {
    const detailStart = Date.now();
    
    console.log(`[STRAVA_GET_SEGMENT_DETAIL_START]`, {
      segmentId,
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.stravaRequest<StravaSegmentDetailResponse>(
        `/segments/${segmentId}`,
      );

      const detailDuration = Date.now() - detailStart;

      const result = {
        id: data.id.toString(),
        name: data.name,
        distance: data.distance,
        averageGrade: data.average_grade,
        latStart: data.start_latlng[0],
        lonStart: data.start_latlng[1],
        latEnd: data.end_latlng[0],
        lonEnd: data.end_latlng[1],
        polyline: data.map.polyline,
        elevHigh: data.elevation_high,
        elevLow: data.elevation_low,
        komTime: data.kom ? formatTime(data.kom.elapsed_time) : undefined,
        climbCategory: formatClimbCategory(data.climb_category),
        elevationGain: data.elev_difference,
      };

      console.log(`[STRAVA_GET_SEGMENT_DETAIL_SUCCESS]`, {
        segmentId,
        segmentName: result.name,
        distance: result.distance,
        averageGrade: result.averageGrade,
        elevationGain: result.elevationGain,
        hasPolyline: !!result.polyline,
        duration: `${detailDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const detailDuration = Date.now() - detailStart;
      
      console.error(`[STRAVA_GET_SEGMENT_DETAIL_ERROR]`, {
        segmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${detailDuration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
  }

  /**
   * Get simplified segment metadata optimized for route planning
   * Returns only the essential data needed for TSP algorithms and constraint checking
   * 
   * @param segmentId Strava segment ID
   * @returns Essential segment metadata for route planning
   */
  async getSegmentMeta(segmentId: string): Promise<SegmentMeta> {
    const metaStart = Date.now();
    
    console.log(`[STRAVA_GET_SEGMENT_META_START]`, {
      segmentId,
      timestamp: new Date().toISOString(),
    });

    try {
      const data = await this.stravaRequest<StravaSegmentDetailResponse>(
        `/segments/${segmentId}`,
      );

      const metaDuration = Date.now() - metaStart;

      const result: SegmentMeta = {
        id: data.id.toString(),
        name: data.name,
        distance: data.distance,
        elevationGain: data.elev_difference,
        startCoord: [data.start_latlng[1], data.start_latlng[0]], // Convert to [lon, lat]
        endCoord: [data.end_latlng[1], data.end_latlng[0]], // Convert to [lon, lat]
      };

      console.log(`[STRAVA_GET_SEGMENT_META_SUCCESS]`, {
        segmentId,
        segmentName: result.name,
        distance: result.distance,
        elevationGain: result.elevationGain,
        startCoord: result.startCoord,
        endCoord: result.endCoord,
        duration: `${metaDuration}ms`,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const metaDuration = Date.now() - metaStart;
      
      console.error(`[STRAVA_GET_SEGMENT_META_ERROR]`, {
        segmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: `${metaDuration}ms`,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      
      throw error;
    }
  }
}

/**
 * Format time in seconds to mm:ss string
 */
function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/**
 * Format Strava climb category number to string
 */
function formatClimbCategory(category: number): string | undefined {
  switch (category) {
    case 0:
      return undefined; // No category
    case 1:
      return "4";
    case 2:
      return "3";
    case 3:
      return "2";
    case 4:
      return "1";
    case 5:
      return "HC";
    default:
      return undefined;
  }
}
