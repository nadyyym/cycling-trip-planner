import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PlanRequestSchema, type PlanResponse } from "~/types/routePlanner";
import { StravaClient } from "~/server/integrations/strava";
import {
  getMatrix,
  type Coordinate,
  type CostMatrix,
} from "~/server/integrations/mapbox";
import { accounts } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { solveOrderedSegments, TSPSolverError } from "~/server/algorithms/tsp";
import { partitionRoute } from "~/server/algorithms/dailyPartitioner";

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
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Too many waypoints (${waypoints.length}). Maximum is 25 for Matrix API. Consider reducing segments or removing trip start.`,
          });
        }

        if (waypoints.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "No waypoints generated. At least one segment is required.",
          });
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
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Invalid matrix response from Mapbox API",
          });
        }

        if (
          matrix.distances.length !== waypoints.length ||
          matrix.durations.length !== waypoints.length
        ) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `Matrix size mismatch. Expected ${waypoints.length}x${waypoints.length}, got ${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          });
        }

        // Validate all values are finite numbers
        const hasInvalidDistances = matrix.distances.some((row) =>
          row.some((dist) => !Number.isFinite(dist) || dist < 0),
        );
        const hasInvalidDurations = matrix.durations.some((row) =>
          row.some((dur) => !Number.isFinite(dur) || dur < 0),
        );

        if (hasInvalidDistances || hasInvalidDurations) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "Matrix contains invalid distance or duration values",
          });
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

          // Step 4-6: Daily partitioning (Commit #6)
          // Note: Geometry stitching (Commit #5) will be added later to enhance this step
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

              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Route partitioning failed: ${partitionResult.errorDetails}`,
              });
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

            // Build DayRoute objects for the response
            // Note: This is a simplified geometry - will be enhanced in Commit #5
            const routes = partitionResult.partitions!.map((partition) => {
              const segmentsVisited = partition.segmentIndices.map(
                (segmentIndex) =>
                  tspSolution.orderedSegments[segmentIndex]!.segmentId,
              );

              // Create simplified geometry - a straight line between first and last segment
              // This will be replaced with proper geometry stitching in Commit #5
              const firstSegmentIndex = partition.segmentIndices[0]!;
              const lastSegmentIndex =
                partition.segmentIndices[partition.segmentIndices.length - 1]!;
              const firstSegment =
                tspSolution.orderedSegments[firstSegmentIndex]!;
              const lastSegment =
                tspSolution.orderedSegments[lastSegmentIndex]!;

              const firstSegmentMeta = segmentMetas.find(
                (meta) => meta.id === firstSegment.segmentId.toString(),
              )!;
              const lastSegmentMeta = segmentMetas.find(
                (meta) => meta.id === lastSegment.segmentId.toString(),
              )!;

              const startCoord = firstSegmentMeta.startCoord;
              const endCoord = lastSegmentMeta.endCoord;

              return {
                dayNumber: partition.dayNumber,
                distanceKm: partition.distanceKm,
                elevationGainM: partition.elevationGainM,
                geometry: {
                  type: "LineString" as const,
                  coordinates: [startCoord, endCoord],
                },
                segmentsVisited,
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
              partitioningTimeMs: step6Duration,
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

            // If it's already a TRPCError, re-throw it
            if (partitionError instanceof TRPCError) {
              throw partitionError;
            }

            // Otherwise, wrap it in a generic error
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to partition route into daily segments",
            });
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

          if (error instanceof TSPSolverError) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `TSP solving failed: ${error.message}`,
            });
          }

          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to solve TSP for route optimization",
          });
        }
      } catch (error) {
        const totalDuration = Date.now() - planStart;

        // Handle different error types appropriately
        if (error instanceof TRPCError) {
          console.error(`[ROUTE_PLANNER_TRPC_ERROR]`, {
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
          timestamp: new Date().toISOString(),
        });

        // Map external API errors to appropriate tRPC errors
        if (error instanceof Error && error.message.includes("Mapbox")) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `External API error: ${error.message}`,
          });
        }

        if (error instanceof Error && error.message.includes("Strava")) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: `External API error: ${error.message}`,
          });
        }

        // Generic internal server error for unexpected errors
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Route planning failed due to internal error",
        });
      }
    }),
});
