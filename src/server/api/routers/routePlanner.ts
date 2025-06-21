import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { PlanRequestSchema, type PlanResponse } from "~/types/routePlanner";
import { StravaClient } from "~/server/integrations/strava";
import { getMatrix, type Coordinate, type CostMatrix } from "~/server/integrations/mapbox";
import { accounts } from "~/server/db/schema";
import { eq } from "drizzle-orm";

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
        segmentIds: input.segments.map(s => s.segmentId.toString()),
        timestamp: new Date().toISOString(),
      });

      try {
        // Step 1: Get user's Strava credentials and segment metadata
        const step1Start = Date.now();
        console.log(`[ROUTE_PLANNER_STEP1_START] Getting Strava credentials and segment metadata`);
        
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
          hasTokens: !!(stravaAccount?.access_token && stravaAccount?.refresh_token),
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
            message: "Strava account not connected. Please sign in with Strava to use route planning.",
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
        
        const segmentMetaPromises = input.segments.map(segment => 
          stravaClient.getSegmentMeta(segment.segmentId.toString())
        );
        
        const segmentMetas = await Promise.all(segmentMetaPromises);
        const step1Duration = Date.now() - step1Start;
        
        console.log(`[ROUTE_PLANNER_STEP1_COMPLETE]`, {
          duration: `${step1Duration}ms`,
          segmentCount: segmentMetas.length,
          segments: segmentMetas.map(meta => ({
            id: meta.id,
            name: meta.name,
            distance: meta.distance,
            elevationGain: meta.elevationGain,
          })),
          timestamp: new Date().toISOString(),
        });

        // Step 2: Build waypoint list and get cost matrix
        const step2Start = Date.now();
        console.log(`[ROUTE_PLANNER_STEP2_START] Building waypoints and retrieving cost matrix`);
        
        const waypoints: Coordinate[] = [];
        
        // Add optional trip start point
        if (input.tripStart) {
          waypoints.push(input.tripStart);
          console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
            type: 'tripStart',
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
              type: 'segmentStart',
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.startCoord,
              direction: 'forward',
              index: waypoints.length - 2,
            });
            
            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: 'segmentEnd',
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.endCoord,
              direction: 'forward',
              index: waypoints.length - 1,
            });
          } else {
            // Reverse direction: end -> start
            waypoints.push(meta.endCoord);
            waypoints.push(meta.startCoord);
            
            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: 'segmentStart',
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.endCoord,
              direction: 'reverse',
              index: waypoints.length - 2,
            });
            
            console.log(`[ROUTE_PLANNER_WAYPOINT_ADDED]`, {
              type: 'segmentEnd',
              segmentId: meta.id,
              segmentName: meta.name,
              coordinate: meta.startCoord,
              direction: 'reverse',
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
            code: 'BAD_REQUEST',
            message: `Too many waypoints (${waypoints.length}). Maximum is 25 for Matrix API. Consider reducing segments or removing trip start.`,
          });
        }
        
        if (waypoints.length === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'No waypoints generated. At least one segment is required.',
          });
        }
        
        // Get cost matrix from Mapbox
        console.log(`[ROUTE_PLANNER_MATRIX_REQUEST_START]`, {
          waypointCount: waypoints.length,
          matrixSize: `${waypoints.length}x${waypoints.length}`,
          profile: 'cycling',
          timestamp: new Date().toISOString(),
        });
        
        const matrix: CostMatrix = await getMatrix(waypoints);
        const step2Duration = Date.now() - step2Start;
        
        // Validate matrix response
        if (!matrix.distances || !matrix.durations) {
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: 'Invalid matrix response from Mapbox API',
          });
        }
        
        if (matrix.distances.length !== waypoints.length || 
            matrix.durations.length !== waypoints.length) {
          throw new TRPCError({
            code: 'BAD_GATEWAY', 
            message: `Matrix size mismatch. Expected ${waypoints.length}x${waypoints.length}, got ${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          });
        }
        
        // Validate all values are finite numbers
        const hasInvalidDistances = matrix.distances.some(row => 
          row.some(dist => !Number.isFinite(dist) || dist < 0)
        );
        const hasInvalidDurations = matrix.durations.some(row => 
          row.some(dur => !Number.isFinite(dur) || dur < 0)
        );
        
        if (hasInvalidDistances || hasInvalidDurations) {
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: 'Matrix contains invalid distance or duration values',
          });
        }
        
        console.log(`[ROUTE_PLANNER_STEP2_COMPLETE]`, {
          duration: `${step2Duration}ms`,
          matrixSize: `${matrix.distances.length}x${matrix.distances[0]?.length ?? 0}`,
          maxDistance: Math.max(...matrix.distances.flat()),
          minDistance: Math.min(...matrix.distances.flat().filter(d => d > 0)),
          avgDistance: Math.round(matrix.distances.flat().reduce((sum, d) => sum + d, 0) / matrix.distances.flat().length),
          maxDuration: Math.max(...matrix.durations.flat()),
          avgDuration: Math.round(matrix.durations.flat().reduce((sum, d) => sum + d, 0) / matrix.durations.flat().length),
          timestamp: new Date().toISOString(),
        });

        // For now, store the context and return not implemented
        // Steps 3-6 will be implemented in subsequent commits
        const context = {
          segmentMetas,
          waypoints,
          matrix,
        };
        
        const totalDuration = Date.now() - planStart;
        
        console.log(`[ROUTE_PLANNER_STEP2_READY]`, {
          totalDuration: `${totalDuration}ms`,
          contextReady: true,
          nextSteps: ['TSP solver', 'Geometry stitching', 'Daily partitioning'],
          timestamp: new Date().toISOString(),
        });

        // Stubbed response - Steps 3-6 will be implemented in subsequent commits
        return {
          ok: false,
          error: "notImplemented",
          details: `Matrix retrieval completed successfully. Got ${matrix.distances.length}x${matrix.distances[0]?.length ?? 0} cost matrix for ${waypoints.length} waypoints. TSP solver and route optimization still pending implementation.`,
        };

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
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: `${totalDuration}ms`,
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });
        
        // Map external API errors to appropriate tRPC errors
        if (error instanceof Error && error.message.includes('Mapbox')) {
          throw new TRPCError({
            code: 'BAD_GATEWAY',
            message: `External API error: ${error.message}`,
          });
        }
        
        if (error instanceof Error && error.message.includes('Strava')) {
          throw new TRPCError({
            code: 'BAD_GATEWAY', 
            message: `External API error: ${error.message}`,
          });
        }
        
        // Generic internal server error for unexpected errors
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Route planning failed due to internal error',
        });
      }
    }),
}); 