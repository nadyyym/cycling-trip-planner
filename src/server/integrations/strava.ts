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
  }

  /**
   * Refresh the access token if it's expired or about to expire
   */
  private async ensureValidToken(): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    const bufferTime = 300; // 5 minutes buffer

    if (this.expiresAt - now < bufferTime) {
      console.log("Refreshing Strava token...");

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

        if (!response.ok) {
          throw new Error(`Token refresh failed: ${response.status}`);
        }

        const data = (await response.json()) as StravaTokenRefreshResponse;

        this.accessToken = data.access_token;
        this.refreshToken = data.refresh_token;
        this.expiresAt = data.expires_at;

        // Notify caller about token refresh so they can update the database
        if (this.onTokenRefresh) {
          await this.onTokenRefresh({
            accessToken: this.accessToken,
            refreshToken: this.refreshToken,
            expiresAt: this.expiresAt,
          });
        }

        console.log("Strava token refreshed successfully");
      } catch (error) {
        console.error("Failed to refresh Strava token:", error);
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
    await this.ensureValidToken();

    const response = await fetch(`https://www.strava.com/api/v3${endpoint}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "Strava rate limit exceeded",
        cause: { retryAfter: retryAfter ? parseInt(retryAfter) : 60 },
      });
    }

    if (!response.ok) {
      console.error(`Strava API error: ${response.status}`);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Strava API error: ${response.status}`,
      });
    }

    return response.json() as T;
  }

  /**
   * Explore segments within given bounds
   */
  async exploreSegments(bounds: BoundsInput): Promise<SegmentDTO[]> {
    const { sw, ne } = bounds;

    // Strava expects bounds as: sw_lat,sw_lng,ne_lat,ne_lng
    const boundsStr = `${sw[0]},${sw[1]},${ne[0]},${ne[1]}`;

    console.log(`Exploring Strava segments in bounds: ${boundsStr}`);

    try {
      const data = await this.stravaRequest<StravaSegmentExploreResponse>(
        `/segments/explore?bounds=${boundsStr}&activity_type=riding`,
      );

      const segments = data.segments.map((segment): SegmentDTO => {
        return {
          id: segment.id.toString(),
          name: segment.name,
          distance: segment.distance,
          averageGrade: segment.avg_grade,
          latStart: segment.start_latlng[0],
          lonStart: segment.start_latlng[1],
          latEnd: segment.end_latlng[0],
          lonEnd: segment.end_latlng[1],
          komTime: segment.kom_time ? formatTime(segment.kom_time) : undefined,
          climbCategory: formatClimbCategory(segment.climb_category),
          elevationGain: segment.elev_difference,
        };
      });

      console.log(`Found ${segments.length} segments in bounds`);
      return segments;
    } catch (error) {
      console.error("Error exploring segments:", error);
      throw error;
    }
  }

  /**
   * Get detailed information about a specific segment
   */
  async getSegmentDetail(segmentId: string): Promise<SegmentDetailDTO> {
    console.log(`Fetching detail for segment: ${segmentId}`);

    try {
      const data = await this.stravaRequest<StravaSegmentDetailResponse>(
        `/segments/${segmentId}`,
      );

      return {
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
    } catch (error) {
      console.error(`Error fetching segment detail for ${segmentId}:`, error);
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
