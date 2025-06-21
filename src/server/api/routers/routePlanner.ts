import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PlanRequestSchema, type PlanResponse } from "~/types/routePlanner";
import { StravaClient } from "~/server/integrations/strava";
import {
  getMatrix,
  type Coordinate,
  type CostMatrix,
  ExternalApiError,
} from "~/server/integrations/mapbox";
import { accounts } from "~/server/db/schema";
import { eq } from "drizzle-orm";
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
   * Requires user to be authenticated with Strava to access segment data
   *
   * All errors are mapped to structured responses with HTTP 200 status
   * Only authentication errors result in HTTP error responses
   */
  planTrip: protectedProcedure
    .input(PlanRequestSchema)
    .mutation(async ({ ctx, input }): Promise<PlanResponse> => {
      const planStart = Date.now();

      // Log the planning request for debugging
      console.log(`[ROUTE_PLANNER_START]`, {
        segmentCount: input.segments.length,
        maxDays: input.maxDays,
        hasTripStart: !!input.tripStart,
        segmentIds: input.segments.map((s) => s.segmentId.toString()),
        timestamp: new Date().toISOString(),
      });

      try {
        // Step 1: Get user's Strava credentials and segment metadata
        const step1Start = Date.now();
        console.log(
          `[ROUTE_PLANNER_STEP1_START] Getting Strava credentials and segment metadata`,
        );

        const userId = ctx.session.user.id;

        // Get user's Strava credentials from accounts table
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
          userId,
          duration: `${dbDuration}ms`,
          hasAccount: !!stravaAccount,
          hasTokens: !!(
            stravaAccount?.access_token && stravaAccount?.refresh_token
          ),
          timestamp: new Date().toISOString(),
        });

        if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
          console.error(`[ROUTE_PLANNER_STRAVA_AUTH_ERROR]`, {
            userId,
            error: "Missing Strava credentials",
            hasAccount: !!stravaAccount,
            hasAccessToken: !!stravaAccount?.access_token,
            hasRefreshToken: !!stravaAccount?.refresh_token,
            timestamp: new Date().toISOString(),
          });

          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Strava account not connected. Please sign in with Strava to use route planning.",
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
              userId,
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
              userId,
              duration: `${tokenUpdateDuration}ms`,
              timestamp: new Date().toISOString(),
            });
          },
        );

        const segmentMetaPromises = input.segments.map((segment) =>
          stravaClient.getSegmentMeta(segment.segmentId.toString()),
        );

        const segmentMetas = await Promise.all(segmentMetaPromises);
        const step1Duration = Date.now() - step1Start;

        console.log(`[ROUTE_PLANNER_STEP1_COMPLETE]`, {
          duration: `${step1Duration}ms`,
          segmentCount: segmentMetas.length,
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
            const partitionResult = partitionRoute(
              tspSolution,
              segmentMetas,
              matrix,
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
            const routes = partitionResult.partitions!.map((partition) => {
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

              console.log(`[ROUTE_PLANNER_DAY_GEOMETRY]`, {
                dayNumber: partition.dayNumber,
                segmentIndices: partition.segmentIndices,
                segmentCount: partition.segmentIndices.length,
                coordinateCount: dayGeometry.coordinates.length,
                distanceKm: partition.distanceKm,
                elevationGainM: partition.elevationGainM,
                segmentDetails: segments.map((s) => ({ id: s.id, name: s.name })),
              });

              return {
                dayNumber: partition.dayNumber,
                distanceKm: partition.distanceKm,
                elevationGainM: partition.elevationGainM,
                geometry: dayGeometry,
                segments,
                segmentsVisited, // Keep for backwards compatibility
                durationMinutes: partition.durationMinutes,
              };
            });

            // Calculate totals
            const totalDistanceKm = routes.reduce(
              (sum, route) => sum + route.distanceKm,
              0,
            );
            const totalElevationGainM = routes.reduce(
              (sum, route) => sum + route.elevationGainM,
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

            // Return successful planning result
            return {
              ok: true,
              routes,
              totalDistanceKm,
              totalElevationGainM,
              totalDurationMinutes,
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
