import { z } from "zod";

/**
 * Input segment with Strava segment ID and required visit direction
 */
export const SegmentInputSchema = z.object({
  /** Strava segment ID */
  segmentId: z.number().int().positive(),
  /** Whether to ride the segment in forward direction (true) or reverse (false) */
  forwardDirection: z.boolean().default(true),
});

export type SegmentInput = z.infer<typeof SegmentInputSchema>;

/**
 * Request to plan a cycling trip
 */
export const PlanRequestSchema = z.object({
  /** List of segments that must be visited */
  segments: z.array(SegmentInputSchema).min(1).max(10),
  /** Optional trip start coordinates [longitude, latitude] */
  tripStart: z.tuple([z.number(), z.number()]).optional(),
  /** Maximum number of days for the trip (1-4) */
  maxDays: z.number().int().min(1).max(4).default(4),
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/**
 * Segment details for trip planning output
 */
export const SegmentDetailSchema = z.object({
  /** Strava segment ID */
  id: z.number().int().positive(),
  /** Segment name from Strava */
  name: z.string(),
  /** Direct Strava segment URL */
  stravaUrl: z.string().url(),
});

export type SegmentDetail = z.infer<typeof SegmentDetailSchema>;

/**
 * A single day's route with metadata
 */
export const DayRouteSchema = z.object({
  /** Day number (1-based) */
  dayNumber: z.number().int().positive(),
  /** Total distance in kilometers */
  distanceKm: z.number().positive(),
  /** Total elevation gain in meters (legacy field for backward compatibility) */
  elevationGainM: z.number().min(0),
  /** Total ascent in meters */
  ascentM: z.number().min(0),
  /** Total descent in meters */
  descentM: z.number().min(0),
  /** Route geometry as GeoJSON LineString */
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  /** Detailed segment information with names and Strava links */
  segments: z.array(SegmentDetailSchema),
  /** @deprecated Use segments array instead. Segments visited on this day (IDs only) */
  segmentsVisited: z.array(z.number().int().positive()),
  /** Estimated duration in minutes */
  durationMinutes: z.number().positive(),
});

export type DayRoute = z.infer<typeof DayRouteSchema>;

/**
 * Error types for trip planning failures
 */
export const PlannerErrorSchema = z.union([
  z.literal("dailyLimitExceeded"),
  z.literal("needMoreDays"),
  z.literal("segmentTooFar"),
  z.literal("externalApi"),
  z.literal("notImplemented"),
]);

export type PlannerError = z.infer<typeof PlannerErrorSchema>;

/**
 * Response from trip planning request
 */
export const PlanResponseSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    /** Planned routes for each day */
    routes: z.array(DayRouteSchema),
    /** Total trip distance in kilometers */
    totalDistanceKm: z.number().positive(),
    /** Total trip elevation gain in meters (legacy field for backward compatibility) */
    totalElevationGainM: z.number().min(0),
    /** Total trip ascent in meters */
    totalAscentM: z.number().min(0),
    /** Total trip descent in meters */
    totalDescentM: z.number().min(0),
    /** Estimated total duration in minutes */
    totalDurationMinutes: z.number().positive(),
  }),
  z.object({
    ok: z.literal(false),
    /** Error code indicating why planning failed */
    error: PlannerErrorSchema,
    /** Human-readable error details */
    details: z.string(),
  }),
]);

export type PlanResponse = z.infer<typeof PlanResponseSchema>;
