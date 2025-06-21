import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { StravaClient, type BoundsInput } from "~/server/integrations/strava";
import { accounts } from "~/server/db/schema";
import { eq } from "drizzle-orm";

// Input validation schemas
const boundsSchema = z.object({
  sw: z.tuple([z.number(), z.number()]), // [lat, lng]
  ne: z.tuple([z.number(), z.number()]), // [lat, lng]
});

const segmentIdSchema = z.object({
  segmentId: z.string(),
});

export const stravaRouter = createTRPCRouter({
  /**
   * Explore segments within given map bounds
   * Requires user to be authenticated with Strava
   */
  segmentExplore: protectedProcedure
    .input(boundsSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      console.log(`segment_explore`, {
        userId,
        bounds: input,
        timestamp: new Date().toISOString(),
      });

      try {
        // Get user's Strava credentials from accounts table
        const stravaAccount = await ctx.db.query.accounts.findFirst({
          where: eq(accounts.userId, userId),
          columns: {
            access_token: true,
            refresh_token: true,
            expires_at: true,
          },
        });

        if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Strava account not connected. Please sign in with Strava.",
          });
        }

        // Create Strava client with token refresh callback
        const stravaClient = new StravaClient(
          stravaAccount.access_token,
          stravaAccount.refresh_token,
          stravaAccount.expires_at ?? 0,
          async (tokens) => {
            // Update tokens in database when they're refreshed
            await ctx.db
              .update(accounts)
              .set({
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                expires_at: tokens.expiresAt,
              })
              .where(eq(accounts.userId, userId));
          },
        );

        // Explore segments using Strava API
        const segments = await stravaClient.exploreSegments(
          input as BoundsInput,
        );

        console.log(`Found ${segments.length} segments for user ${userId}`);

        return segments;
      } catch (error) {
        console.error("Error in segmentExplore:", error);

        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Wrap other errors
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to explore segments",
          cause: error,
        });
      }
    }),

  /**
   * Get detailed information about a specific segment
   * Includes polyline and elevation data
   */
  getSegmentDetail: protectedProcedure
    .input(segmentIdSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      console.log(`get_segment_detail`, {
        userId,
        segmentId: input.segmentId,
        timestamp: new Date().toISOString(),
      });

      try {
        // Get user's Strava credentials
        const stravaAccount = await ctx.db.query.accounts.findFirst({
          where: eq(accounts.userId, userId),
          columns: {
            access_token: true,
            refresh_token: true,
            expires_at: true,
          },
        });

        if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message:
              "Strava account not connected. Please sign in with Strava.",
          });
        }

        // Create Strava client
        const stravaClient = new StravaClient(
          stravaAccount.access_token,
          stravaAccount.refresh_token,
          stravaAccount.expires_at ?? 0,
          async (tokens) => {
            // Update tokens in database when they're refreshed
            await ctx.db
              .update(accounts)
              .set({
                access_token: tokens.accessToken,
                refresh_token: tokens.refreshToken,
                expires_at: tokens.expiresAt,
              })
              .where(eq(accounts.userId, userId));
          },
        );

        // Get segment detail from Strava API
        const segmentDetail = await stravaClient.getSegmentDetail(
          input.segmentId,
        );

        console.log(`Fetched detail for segment ${input.segmentId}`);

        return segmentDetail;
      } catch (error) {
        console.error("Error in getSegmentDetail:", error);

        // Re-throw TRPCError as-is
        if (error instanceof TRPCError) {
          throw error;
        }

        // Wrap other errors
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get segment detail",
          cause: error,
        });
      }
    }),
});
