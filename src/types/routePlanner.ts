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
 * Request to plan a cycling trip with custom constraints
 */
export const PlanRequestSchema = z.object({
  /** List of segments that must be visited */
  segments: z.array(SegmentInputSchema).min(1).max(10),
  /** Optional trip start coordinates [longitude, latitude] */
  tripStart: z.tuple([z.number(), z.number()]).optional(),
  /** Trip start date (ISO yyyy-mm-dd format) */
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Trip end date (ISO yyyy-mm-dd format) */
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Maximum daily distance in kilometers */
  maxDailyDistanceKm: z.number().min(20).max(300).default(100),
  /** Maximum daily elevation gain in meters */
  maxDailyElevationM: z.number().min(200).max(5000).default(1000),
});

export type PlanRequest = z.infer<typeof PlanRequestSchema>;

/**
 * Detailed segment information in planned routes
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
 * A single day's route in the planned trip
 */
export const DayRouteSchema = z.object({
  /** Day number (1-based) */
  dayNumber: z.number().int().positive(),
  /** Route geometry as GeoJSON LineString */
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])),
  }),
  /** Total distance for this day in kilometers */
  distanceKm: z.number().positive(),
  /** Total elevation gain for this day in meters (legacy field for backward compatibility) */
  elevationGainM: z.number().min(0),
  /** Total ascent for this day in meters */
  ascentM: z.number().min(0),
  /** Total descent for this day in meters */
  descentM: z.number().min(0),
  /** Estimated duration for this day in minutes */
  durationMinutes: z.number().positive(),
  /** Segments visited on this day */
  segments: z.array(SegmentDetailSchema),
});

export type DayRoute = z.infer<typeof DayRouteSchema>;

/**
 * Planner error types
 */
export const PlannerErrorSchema = z.enum([
  "dailyLimitExceeded",
  "customLimitExceeded",
  "needMoreDays",
  "segmentTooFar",
  "externalApi",
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
    /** Applied constraints for this trip */
    constraints: z.object({
      startDate: z.string(),
      endDate: z.string(),
      maxDailyDistanceKm: z.number(),
      maxDailyElevationM: z.number(),
    }),
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
