import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { PlanRequestSchema, type PlanResponse } from "~/types/routePlanner";
import { StravaClient } from "~/server/integrations/strava";
import {
  getMatrix,
  // calculateElevationFromCoordinates, // Unused for now but kept for future use
  type Coordinate,
  type CostMatrix,
  ExternalApiError,
} from "~/server/integrations/mapbox";
import { calculateBidirectionalElevation } from "~/server/algorithms/elevation";
import { accounts, segments } from "~/server/db/schema";
import { eq, inArray } from "drizzle-orm";
import { solveOrderedSegments, TSPSolverError } from "~/server/algorithms/tsp";
import { partitionRoute } from "~/server/algorithms/dailyPartitioner";
import {
  stitchRouteGeometry,
  extractDayGeometry,
  type StitchedGeometry,
} from "~/server/algorithms/geometryStitcher";

/**
 * Custom error classes for route planning failures
 * These map to the PlannerError union type in the response schema
 */
export class DailyLimitExceededError extends Error {
  public readonly plannerErrorType = "dailyLimitExceeded" as const;

  constructor(details: string) {
    super(`Daily limit exceeded: ${details}`);
    this.name = "DailyLimitExceededError";
  }
}

export class NeedMoreDaysError extends Error {
  public readonly plannerErrorType = "needMoreDays" as const;

  constructor(details: string) {
    super(`Need more days: ${details}`);
    this.name = "NeedMoreDaysError";
  }
}

export class SegmentTooFarError extends Error {
  public readonly plannerErrorType = "segmentTooFar" as const;

  constructor(details: string) {
    super(`Segment too far: ${details}`);
    this.name = "SegmentTooFarError";
  }
}

export class CustomLimitExceededError extends Error {
  public readonly plannerErrorType = "customLimitExceeded" as const;

  constructor(details: string) {
    super(`Custom limit exceeded: ${details}`);
    this.name = "CustomLimitExceededError";
  }
}

export class ExternalApiPlannerError extends Error {
  public readonly plannerErrorType = "externalApi" as const;

  constructor(details: string) {
    super(`External API error: ${details}`);
    this.name = "ExternalApiPlannerError";
  }
}

/**
 * Maps various error types to structured PlanResponse failure format
 * This function centralizes error handling and ensures consistent error responses
 *
 * @param error The error to map
 * @param context Additional context for logging
 * @returns Structured failure response with error type and details
 */
function mapErrorToResponse(error: unknown, context: string): PlanResponse {
  console.error(`[ROUTE_PLANNER_ERROR_MAPPING]`, {
    context,
    errorType: error instanceof Error ? error.constructor.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    timestamp: new Date().toISOString(),
  });

  // Handle custom planner errors
  if (
    error instanceof DailyLimitExceededError ||
    error instanceof CustomLimitExceededError ||
    error instanceof NeedMoreDaysError ||
    error instanceof SegmentTooFarError ||
    error instanceof ExternalApiPlannerError
  ) {
    return {
      ok: false,
      error: error.plannerErrorType,
      details: error.message,
    };
  }

  // Handle TSP solver errors
  if (error instanceof TSPSolverError) {
    return {
      ok: false,
      error: "segmentTooFar",
      details: `Route optimization failed: ${error.message}`,
    };
  }

  // Handle external API errors (Mapbox, Strava, etc.)
  if (error instanceof ExternalApiError) {
    return {
      ok: false,
      error: "externalApi",
      details: `${error.service} API error (${error.status}): ${error.message}`,
    };
  }

  // Handle network/fetch errors that might indicate external API issues
  if (
    error instanceof Error &&
    (error.message.includes("fetch") ||
      error.message.includes("network") ||
      error.message.includes("timeout"))
  ) {
    return {
      ok: false,
      error: "externalApi",
      details: `Network error during external API call: ${error.message}`,
    };
  }

  // Handle authorization/authentication errors - these should still throw
  if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
    throw error;
  }

  // Handle any error that mentions specific constraint violations
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("daily") &&
      (message.includes("limit") || message.includes("exceed"))
    ) {
      return {
        ok: false,
        error: "dailyLimitExceeded",
        details: error.message,
      };
    }

    if (message.includes("need more days") || message.includes("max days")) {
      return {
        ok: false,
        error: "needMoreDays",
        details: error.message,
      };
    }

    if (message.includes("too far") || message.includes("distance")) {
      return {
        ok: false,
        error: "segmentTooFar",
        details: error.message,
      };
    }
  }

  // For any other error, return a generic segmentTooFar error
  // This maintains backwards compatibility while providing error details
  const errorMessage =
    error instanceof Error ? error.message : "Unknown error occurred";
  return {
    ok: false,
    error: "segmentTooFar",
    details: `Route planning failed: ${errorMessage}`,
  };
}

/**
 * Route planner tRPC router
 * Handles trip planning requests to optimize cycling routes across multiple segments
 */
export const routePlannerRouter = createTRPCRouter({
  /**
   * Plan a cycling trip across multiple Strava segments
   * This procedure takes a list of segments and constraints,
   * then returns optimized daily routes or error details
   * Public endpoint that works for anonymous users using cached segment data
   * Falls back to Strava API for authenticated users when segment data missing
   *
   * All errors are mapped to structured responses with HTTP 200 status
   * Only authentication errors result in HTTP error responses
   */
  planTrip: publicProcedure
    .input(PlanRequestSchema)
    .mutation(async ({ ctx, input }): Promise<PlanResponse> => {
      const planStart = Date.now();
      const userId = ctx.session?.user?.id;
      const isAuthenticated = !!userId;

      // Log the planning request for debugging
      console.log(`[ROUTE_PLANNER_START]`, {
        userId: userId ?? "anonymous",
        isAuthenticated,
        segmentCount: input.segments.length,
        startDate: input.startDate,
        endDate: input.endDate,
        maxDailyDistanceKm: input.maxDailyDistanceKm,
        maxDailyElevationM: input.maxDailyElevationM,
        hasTripStart: !!input.tripStart,
        segmentIds: input.segments.map((s) => s.segmentId.toString()),
        timestamp: new Date().toISOString(),
      });

      try {
        // Step 1: Get segment metadata (try database first, fallback to Strava API)
        const step1Start = Date.now();
        console.log(
          `[ROUTE_PLANNER_STEP1_START] Getting segment metadata from database`,
        );

        // First, try to get segments from our database
        const segmentIds = input.segments.map((s) => BigInt(s.segmentId));
        const dbSegments = await ctx.db
          .select()
          .from(segments)
          .where(inArray(segments.id, segmentIds));

        console.log(`[ROUTE_PLANNER_DB_SEGMENTS_QUERY]`, {
          userId: userId ?? "anonymous",
          isAuthenticated,
          requestedSegments: segmentIds.length,
          foundInDb: dbSegments.length,
          missingFromDb: segmentIds.length - dbSegments.length,
          foundIds: dbSegments.map((s) => s.id.toString()),
          timestamp: new Date().toISOString(),
        });

        // Create a map for quick lookup
        const dbSegmentMap = new Map(dbSegments.map((seg) => [seg.id.toString(), seg]));
        
        // Build segment metadata array in correct order, tracking missing segments
        const segmentMetas: Array<{
          id: string;
          name: string;
          distance: number;
          elevationGain: number;
          startCoord: [number, number];
          endCoord: [number, number];
        }> = [];
        
        const missingSegmentIds: string[] = [];

        // Process each input segment in order
        for (const inputSegment of input.segments) {
          const segmentId = inputSegment.segmentId.toString();
          const dbSegment = dbSegmentMap.get(segmentId);
          
          if (dbSegment) {
            // Use database segment data
            segmentMetas.push({
              id: segmentId,
              name: dbSegment.name,
              distance: dbSegment.distance,
              elevationGain: dbSegment.elevationGain ?? 0,
              startCoord: [dbSegment.lonStart, dbSegment.latStart], // Note: [lon, lat] format for coordinates
              endCoord: [dbSegment.lonEnd, dbSegment.latEnd],
            });
          } else {
            // Mark as missing - we'll need to fetch from Strava API
            missingSegmentIds.push(segmentId);
            // Add placeholder that will be replaced later
            segmentMetas.push({
              id: segmentId,
              name: '',
              distance: 0,
              elevationGain: 0,
              startCoord: [0, 0],
              endCoord: [0, 0],
            });
          }
        }

        // If we have missing segments and user is authenticated, fetch from Strava API
        if (missingSegmentIds.length > 0) {
          if (!isAuthenticated) {
            console.log(`[ROUTE_PLANNER_MISSING_SEGMENTS_ANONYMOUS]`, {
              userId: "anonymous",
              missingSegmentIds,
              message: "Some segments missing from database, authentication required for fresh data",
              timestamp: new Date().toISOString(),
            });

            throw new TRPCError({
              code: "UNAUTHORIZED",
              message: `Some segments are not available in our database. Please sign in with Strava to fetch missing segment data (${missingSegmentIds.length} segments missing).`,
            });
          }

          // For authenticated users: get Strava credentials and fetch missing segments
          console.log(`[ROUTE_PLANNER_FETCHING_MISSING_SEGMENTS]`, {
            userId: userId!,
            missingSegmentIds,
            message: "Fetching missing segments from Strava API",
            timestamp: new Date().toISOString(),
          });

          const dbStart = Date.now();
          const stravaAccount = await ctx.db.query.accounts.findFirst({
            where: eq(accounts.userId, userId),
            columns: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
            },
          });
          const dbDuration = Date.now() - dbStart;

          console.log(`[ROUTE_PLANNER_STRAVA_DB_QUERY]`, {
            userId: userId!,
            duration: `${dbDuration}ms`,
            hasAccount: !!stravaAccount,
            hasTokens: !!(
              stravaAccount?.access_token && stravaAccount?.refresh_token
            ),
            timestamp: new Date().toISOString(),
          });

          if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
            console.error(`[ROUTE_PLANNER_STRAVA_AUTH_ERROR]`, {
              userId: userId!,
              error: "Missing Strava credentials",
              hasAccount: !!stravaAccount,
              hasAccessToken: !!stravaAccount?.access_token,
              hasRefreshToken: !!stravaAccount?.refresh_token,
              timestamp: new Date().toISOString(),
            });

            throw new TRPCError({
              code: "UNAUTHORIZED",
              message:
                "Strava account not connected. Please sign in with Strava to fetch missing segment data.",
            });
          }

          // Create Strava client with token refresh callback
          const stravaClient = new StravaClient(
            stravaAccount.access_token,
            stravaAccount.refresh_token,
            stravaAccount.expires_at ?? 0,
            async (tokens) => {
              const tokenUpdateStart = Date.now();
              console.log(`[ROUTE_PLANNER_TOKEN_REFRESH_CALLBACK]`, {
                userId: userId!,
                message: "Updating database with refreshed tokens",
                timestamp: new Date().toISOString(),
              });

              // Update tokens in database when they're refreshed
              await ctx.db
                .update(accounts)
                .set({
                  access_token: tokens.accessToken,
                  refresh_token: tokens.refreshToken,
                  expires_at: tokens.expiresAt,
                })
                .where(eq(accounts.userId, userId));

              const tokenUpdateDuration = Date.now() - tokenUpdateStart;
              console.log(`[ROUTE_PLANNER_TOKEN_REFRESH_COMPLETE]`, {
                userId: userId!,
                duration: `${tokenUpdateDuration}ms`,
                timestamp: new Date().toISOString(),
              });
            },
          );

          // Fetch missing segments from Strava API
          const missingSegmentMetaPromises = missingSegmentIds.map((segmentId) =>
            stravaClient.getSegmentMeta(segmentId),
          );

          const missingSegmentMetas = await Promise.all(missingSegmentMetaPromises);

          // Replace placeholders with actual segment metadata in correct order
          for (let i = 0; i < segmentMetas.length; i++) {
            const segmentMeta = segmentMetas[i]!;
            if (missingSegmentIds.includes(segmentMeta.id)) {
              const fetchedMeta = missingSegmentMetas.find((meta) => meta.id === segmentMeta.id);
              if (fetchedMeta) {
                segmentMetas[i] = fetchedMeta;
              }
            }
          }

          console.log(`[ROUTE_PLANNER_MISSING_SEGMENTS_FETCHED]`, {
            userId: userId!,
            fetchedCount: missingSegmentMetas.length,
            totalSegments: segmentMetas.length,
            timestamp: new Date().toISOString(),
          });
        }

        const step1Duration = Date.now() - step1Start;

        console.log(`[ROUTE_PLANNER_STEP1_COMPLETE]`, {
          userId: userId ?? "anonymous",
          isAuthenticated,
          duration: `${step1Duration}ms`,
          segmentCount: segmentMetas.length,
          fromDatabase: dbSegments.length,
          fromStrava: missingSegmentIds.length,
          segments: segmentMetas.map((meta) => ({
            id: meta.id,
            name: meta.name,
            distance: meta.distance,
            elevationGain: meta.elevationGain,
          })),
          timestamp: new Date().toISOString(),
        });

        // Step 2: Build waypoint list and get cost matrix
        const step2Start = Date.now();
        console.log(
          `[ROUTE_PLANNER_STEP2_START] Building waypoints and retrieving cost matrix`,
        );

        const waypoints: Coordinate[] = [];

        // Add optional trip start point
        if (input.tripStart) {
          waypoints.push(input.tripStart);
          console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
            type: "tripStart",
            coordinate: input.tripStart,
            index: waypoints.length - 1,
          });
        }

        // Add start and end coordinates for each segment
        // Each segment contributes 2 waypoints (start and end)
        for (let i = 0; i < segmentMetas.length; i++) {
          const meta = segmentMetas[i]!;
          const segmentInput = input.segments[i]!;

          if (segmentInput.forwardDirection) {
            // Forward direction: start -> end
            waypoints.push(meta.startCoord);
            waypoints.push(meta.endCoord);

            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: "segmentStart",
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.startCoord,
              direction: "forward",
              index: waypoints.length - 2,
            });

            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: "segmentEnd",
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.endCoord,
              direction: "forward",
              index: waypoints.length - 1,
            });
          } else {
            // Reverse direction: end -> start
            waypoints.push(meta.endCoord);
            waypoints.push(meta.startCoord);

            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: "segmentStart",
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.endCoord,
              direction: "reverse",
              index: waypoints.length - 2,
            });

            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: "segmentEnd",
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.startCoord,
              direction: "reverse",
              index: waypoints.length - 1,
            });
          }
        }

        console.log(`[ROUTE_PLANNER_WAYPOINTS_BUILT]`, {
          totalWaypoints: waypoints.length,
          maxMatrixSize: 25,
          hasCapacityForMatrix: waypoints.length <= 25,
          waypointBreakdown: {
            tripStart: input.tripStart ? 1 : 0,
            segments: input.segments.length,
            segmentWaypoints: input.segments.length * 2,
          },
          timestamp: new Date().toISOString(),
        });

        // Validate matrix size constraints
        if (waypoints.length > 25) {
          throw new SegmentTooFarError(
            `Too many waypoints (${waypoints.length}). Maximum is 25 for Matrix API. Consider reducing segments or removing trip start.`,
          );
        }

        if (waypoints.length === 0) {
          throw new SegmentTooFarError(
            "No waypoints generated. At least one segment is required.",
          );
        }

        // Get cost matrix from Mapbox
        console.log(`[ROUTE_PLANNER_MATRIX_REQUEST_START]`, {
          waypointCount: waypoints.length,
          matrixSize: `${waypoints.length}x${waypoints.length}`,
          profile: "cycling",
          timestamp: new Date().toISOString(),
        });

        const matrix: CostMatrix = await getMatrix(waypoints);
        const step2Duration = Date.now() - step2Start;

        // Validate matrix response
        if (!matrix.distances || !matrix.durations) {
          throw new ExternalApiPlannerError(
            "Invalid matrix response from Mapbox API - missing distance or duration data",
          );
        }

        if (
          matrix.distances.length !== waypoints.length ||
          matrix.durations.length !== waypoints.length
        ) {
          throw new ExternalApiPlannerError(
            `Matrix size mismatch. Expected ${waypoints.length}x${waypoints.length}, got ${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          );
        }

        // Validate all values are finite numbers
        const hasInvalidDistances = matrix.distances.some((row) =>
          row.some((dist) => !Number.isFinite(dist) || dist < 0),
        );
        const hasInvalidDurations = matrix.durations.some((row) =>
          row.some((dur) => !Number.isFinite(dur) || dur < 0),
        );

        if (hasInvalidDistances || hasInvalidDurations) {
          throw new ExternalApiPlannerError(
            "Matrix contains invalid distance or duration values",
          );
        }

        console.log(`[ROUTE_PLANNER_STEP2_COMPLETE]`, {
          duration: `${step2Duration}ms`,
          matrixSize: `${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          maxDistance: Math.max(...matrix.distances.flat()),
          minDistance: Math.min(
            ...matrix.distances.flat().filter((d) => d > 0),
          ),
          avgDistance: Math.round(
            matrix.distances.flat().reduce((sum, d) => sum + d, 0) /
              matrix.distances.flat().length,
          ),
          maxDuration: Math.max(...matrix.durations.flat()),
          avgDuration: Math.round(
            matrix.durations.flat().reduce((sum, d) => sum + d, 0) /
              matrix.durations.flat().length,
          ),
          timestamp: new Date().toISOString(),
        });

        // For now, return not implemented - context data is ready for next steps
        // Steps 3-6 will be implemented in subsequent commits
        const totalDuration = Date.now() - planStart;

        console.log(`[ROUTE_PLANNER_STEP2_READY]`, {
          userId: userId ?? "anonymous",
          isAuthenticated,
          totalDuration: `${totalDuration}ms`,
          contextReady: true,
          segmentCount: segmentMetas.length,
          waypointCount: waypoints.length,
          matrixSize: `${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          nextSteps: ["TSP solver", "Geometry stitching", "Daily partitioning"],
          timestamp: new Date().toISOString(),
        });

        // Step 3: Solve TSP to find optimal segment order
        const step3Start = Date.now();
        console.log(
          `[ROUTE_PLANNER_STEP3_START] Solving TSP for optimal segment order`,
        );

        const tripStartIndex = input.tripStart ? 0 : undefined;

        try {
          const tspSolution = await solveOrderedSegments(
            matrix,
            input.segments,
            tripStartIndex,
          );

          const step3Duration = Date.now() - step3Start;

          console.log(`[ROUTE_PLANNER_STEP3_COMPLETE]`, {
            duration: `${step3Duration}ms`,
            method: tspSolution.method,
            segmentCount: tspSolution.orderedSegments.length,
            totalDistance: tspSolution.totalDistance,
            totalDuration: tspSolution.totalDuration,
            solvingTimeMs: tspSolution.solvingTimeMs,
            withinTimeLimit: tspSolution.solvingTimeMs <= 500,
            orderedSegmentIds: tspSolution.orderedSegments.map(
              (seg) => seg.segmentId,
            ),
            timestamp: new Date().toISOString(),
          });

          // Step 5: Geometry stitching & elevation retrieval (Commit #5)
          const step5Start = Date.now();
          console.log(
            `[ROUTE_PLANNER_STEP5_START] Stitching route geometry and retrieving elevation data`,
          );

          let stitchedGeometry: StitchedGeometry;
          let step5Duration: number;
          try {
            stitchedGeometry = await stitchRouteGeometry(
              tspSolution,
              segmentMetas,
              matrix,
              tripStartIndex,
            );

            step5Duration = Date.now() - step5Start;

            console.log(`[ROUTE_PLANNER_STEP5_COMPLETE]`, {
              duration: `${step5Duration}ms`,
              totalDistance: stitchedGeometry.totalDistance,
              totalElevationGain: stitchedGeometry.totalElevationGain,
              coordinateCount: stitchedGeometry.geometry.coordinates.length,
              cumulativePoints: stitchedGeometry.cumulativeDistances.length,
              avgDistancePerSegment: Math.round(
                stitchedGeometry.totalDistance /
                  tspSolution.orderedSegments.length,
              ),
              avgElevationPerSegment: Math.round(
                stitchedGeometry.totalElevationGain /
                  tspSolution.orderedSegments.length,
              ),
              timestamp: new Date().toISOString(),
            });
          } catch (stitchError) {
            step5Duration = Date.now() - step5Start;

            console.error(`[ROUTE_PLANNER_STEP5_ERROR]`, {
              duration: `${step5Duration}ms`,
              error:
                stitchError instanceof Error
                  ? stitchError.message
                  : "Unknown error",
              timestamp: new Date().toISOString(),
            });

            // Re-throw the original error to be handled by the outer error mapping
            throw stitchError;
          }

          // Step 6: Daily partitioning (Commit #6)
          const step6Start = Date.now();
          console.log(
            `[ROUTE_PLANNER_STEP6_START] Partitioning route into daily segments`,
          );

          try {
            // Build trip constraints from input
            const tripConstraints = {
              startDate: input.startDate,
              endDate: input.endDate,
              maxDailyDistanceKm: input.maxDailyDistanceKm,
              maxDailyElevationM: input.maxDailyElevationM,
            };

            const partitionResult = partitionRoute(
              tspSolution,
              segmentMetas,
              matrix,
              tripConstraints,
              tripStartIndex,
            );

            const step6Duration = Date.now() - step6Start;

            if (!partitionResult.success) {
              console.error(`[ROUTE_PLANNER_STEP6_FAILED]`, {
                duration: `${step6Duration}ms`,
                errorCode: partitionResult.errorCode,
                errorDetails: partitionResult.errorDetails,
                timestamp: new Date().toISOString(),
              });

              // Map partition error codes to our custom error classes
              if (partitionResult.errorCode === "dailyLimitExceeded") {
                throw new DailyLimitExceededError(
                  partitionResult.errorDetails ??
                    "Daily constraints cannot be met",
                );
              } else if (partitionResult.errorCode === "customLimitExceeded") {
                throw new CustomLimitExceededError(
                  partitionResult.errorDetails ??
                    "Custom daily limits exceeded",
                );
              } else if (partitionResult.errorCode === "needMoreDays") {
                throw new NeedMoreDaysError(
                  partitionResult.errorDetails ??
                    "Route requires more than maximum allowed days",
                );
              } else if (partitionResult.errorCode === "segmentTooFar") {
                throw new SegmentTooFarError(
                  partitionResult.errorDetails ??
                    "Segments are too far apart to route efficiently",
                );
              } else {
                throw new DailyLimitExceededError(
                  partitionResult.errorDetails ?? "Route partitioning failed",
                );
              }
            }

            console.log(`[ROUTE_PLANNER_STEP6_COMPLETE]`, {
              duration: `${step6Duration}ms`,
              partitionCount: partitionResult.partitions!.length,
              partitions: partitionResult.partitions!.map((p) => ({
                day: p.dayNumber,
                segments: p.segmentIndices.length,
                distanceKm: Math.round(p.distanceKm),
                elevationM: Math.round(p.elevationGainM),
                durationHours: Math.round((p.durationMinutes / 60) * 10) / 10,
              })),
              timestamp: new Date().toISOString(),
            });

            // Build DayRoute objects for the response using stitched geometry
            const routes = await Promise.all(
              partitionResult.partitions!.map(async (partition) => {
                const segmentsVisited = partition.segmentIndices.map(
                  (segmentIndex) =>
                    tspSolution.orderedSegments[segmentIndex]!.segmentId,
                );

                // Build detailed segment information with names and Strava URLs
                const segments = partition.segmentIndices.map((segmentIndex) => {
                  const segmentId = tspSolution.orderedSegments[segmentIndex]!.segmentId;
                  const segmentMeta = segmentMetas.find(
                    (meta) => meta.id === segmentId.toString(),
                  );

                  if (!segmentMeta) {
                    throw new Error(
                      `Segment metadata not found for segment ID ${segmentId}`,
                    );
                  }

                  return {
                    id: segmentId,
                    name: segmentMeta.name,
                    stravaUrl: `https://www.strava.com/segments/${segmentId}`,
                  };
                });

                // Extract day-specific geometry from the stitched route
                const dayGeometry = extractDayGeometry(
                  stitchedGeometry,
                  partition.segmentIndices,
                );

                // Calculate bidirectional elevation from the actual route geometry coordinates
                const elevationResult = calculateBidirectionalElevation(
                  dayGeometry.coordinates.map(coord => [coord[0], coord[1], undefined]) // Add elevation placeholder
                );

                console.log(`[ROUTE_PLANNER_DAY_GEOMETRY]`, {
                  dayNumber: partition.dayNumber,
                  segmentIndices: partition.segmentIndices,
                  segmentCount: partition.segmentIndices.length,
                  coordinateCount: dayGeometry.coordinates.length,
                  distanceKm: partition.distanceKm,
                  partitionElevationGainM: partition.elevationGainM,
                  calculatedAscentM: elevationResult.ascentM,
                  calculatedDescentM: elevationResult.descentM,
                  segmentDetails: segments.map((s) => ({ id: s.id, name: s.name })),
                });

                return {
                  dayNumber: partition.dayNumber,
                  distanceKm: partition.distanceKm,
                  elevationGainM: elevationResult.ascentM, // Use ascent for backward compatibility
                  ascentM: elevationResult.ascentM,
                  descentM: elevationResult.descentM,
                  geometry: dayGeometry,
                  segments,
                  segmentsVisited, // Keep for backwards compatibility
                  durationMinutes: partition.durationMinutes,
                };
              })
            );

            // Calculate totals
            const totalDistanceKm = routes.reduce(
              (sum, route) => sum + route.distanceKm,
              0,
            );
            const totalElevationGainM = routes.reduce(
              (sum, route) => sum + route.elevationGainM,
              0,
            );
            const totalAscentM = routes.reduce(
              (sum, route) => sum + route.ascentM,
              0,
            );
            const totalDescentM = routes.reduce(
              (sum, route) => sum + route.descentM,
              0,
            );
            const totalDurationMinutes = routes.reduce(
              (sum, route) => sum + route.durationMinutes,
              0,
            );

            const totalPlanDuration = Date.now() - planStart;

            console.log(`[ROUTE_PLANNER_SUCCESS]`, {
              totalDuration: `${totalPlanDuration}ms`,
              segmentCount: tspSolution.orderedSegments.length,
              routeCount: routes.length,
              totalDistanceKm: Math.round(totalDistanceKm),
              totalElevationGainM: Math.round(totalElevationGainM),
              totalDurationHours:
                Math.round((totalDurationMinutes / 60) * 10) / 10,
              tspMethod: tspSolution.method,
              tspSolvingTimeMs: tspSolution.solvingTimeMs,
              geometryStitchingTimeMs: step5Duration,
              partitioningTimeMs: step6Duration,
              stitchedCoordinates: stitchedGeometry.geometry.coordinates.length,
              hasStitchedGeometry: true,
              timestamp: new Date().toISOString(),
            });

            // Return successful planning result with applied constraints
            return {
              ok: true,
              routes,
              totalDistanceKm,
              totalElevationGainM,
              totalAscentM,
              totalDescentM,
              totalDurationMinutes,
              constraints: tripConstraints,
            };
          } catch (partitionError) {
            const step6Duration = Date.now() - step6Start;

            console.error(`[ROUTE_PLANNER_STEP6_ERROR]`, {
              duration: `${step6Duration}ms`,
              error:
                partitionError instanceof Error
                  ? partitionError.message
                  : "Unknown error",
              timestamp: new Date().toISOString(),
            });

            // Re-throw the original error to be handled by outer error mapping
            throw partitionError;
          }
        } catch (error) {
          const step3Duration = Date.now() - step3Start;

          console.error(`[ROUTE_PLANNER_STEP3_ERROR]`, {
            duration: `${step3Duration}ms`,
            error: error instanceof Error ? error.message : "Unknown error",
            errorType:
              error instanceof TSPSolverError ? "TSPSolverError" : "Unknown",
            timestamp: new Date().toISOString(),
          });

          // Re-throw the original error to be handled by outer error mapping
          throw error;
        }
      } catch (error) {
        const totalDuration = Date.now() - planStart;

        // Handle authentication errors - these should still throw as tRPC errors
        if (error instanceof TRPCError && error.code === "UNAUTHORIZED") {
          console.error(`[ROUTE_PLANNER_AUTH_ERROR]`, {
            code: error.code,
            message: error.message,
            duration: `${totalDuration}ms`,
            timestamp: new Date().toISOString(),
          });
          throw error;
        }

        console.error(`[ROUTE_PLANNER_ERROR]`, {
          error: error instanceof Error ? error.message : "Unknown error",
          duration: `${totalDuration}ms`,
          stack: error instanceof Error ? error.stack : undefined,
          errorType:
            error instanceof Error ? error.constructor.name : typeof error,
          timestamp: new Date().toISOString(),
        });

        // Use the error mapping function to convert all other errors
        // to structured PlanResponse failures with HTTP 200 status
        return mapErrorToResponse(error, "Route planning main procedure");
      }
    }),
});
