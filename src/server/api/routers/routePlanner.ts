import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { PlanRequestSchema, type PlanResponse } from "~/types/routePlanner";

/**
 * Route planner tRPC router
 * Handles trip planning requests to optimize cycling routes across multiple segments
 */
export const routePlannerRouter = createTRPCRouter({
  /**
   * Plan a cycling trip across multiple Strava segments
   * This procedure takes a list of segments and constraints,
   * then returns optimized daily routes or error details
   */
  planTrip: publicProcedure
    .input(PlanRequestSchema)
    .mutation(async ({ input }): Promise<PlanResponse> => {
      // Log the planning request for debugging
      console.log("Route planning request received:", {
        segmentCount: input.segments.length,
        maxDays: input.maxDays,
        hasTripStart: !!input.tripStart,
      });

      // Stubbed response - actual implementation will be added in subsequent commits
      return {
        ok: false,
        error: "notImplemented",
        details: "Route planning algorithm not yet implemented. This is a placeholder response.",
      };
    }),
}); 