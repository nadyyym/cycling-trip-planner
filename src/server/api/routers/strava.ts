import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  StravaClient,
  type BoundsInput,
  type SegmentDTO,
} from "~/server/integrations/strava";
import { accounts } from "~/server/db/schema";
import { eq } from "drizzle-orm";
import { segmentExploreCache, LRUCache } from "~/server/cache/lru";

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
   * Uses LRU cache to reduce API calls and handles rate limiting
   */
  segmentExplore: protectedProcedure
    .input(boundsSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const startTime = Date.now();
      const cacheKey = LRUCache.boundsToKey(input);

      // Enhanced structured logging for monitoring
      console.log(`[STRAVA_SEGMENT_EXPLORE_START]`, {
        userId,
        bounds: input,
        cacheKey,
        timestamp: new Date().toISOString(),
        sessionId: ctx.session.user.id,
      });

      try {
        // Check cache first
        const cachedResult = segmentExploreCache.get(cacheKey);
        if (cachedResult) {
          const duration = Date.now() - startTime;
          const segments = cachedResult as SegmentDTO[];
          console.log(`[STRAVA_SEGMENT_EXPLORE_CACHE_HIT]`, {
            userId,
            cacheKey,
            duration: `${duration}ms`,
            segmentCount: segments.length,
            timestamp: new Date().toISOString(),
          });
          return segments;
        }

        console.log(`[STRAVA_SEGMENT_EXPLORE_CACHE_MISS]`, {
          userId,
          cacheKey,
          message: "Fetching from Strava API",
          timestamp: new Date().toISOString(),
        });

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

        console.log(`[STRAVA_DB_QUERY]`, {
          userId,
          duration: `${dbDuration}ms`,
          hasAccount: !!stravaAccount,
          hasTokens: !!(
            stravaAccount?.access_token && stravaAccount?.refresh_token
          ),
          timestamp: new Date().toISOString(),
        });

        if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
          console.error(`[STRAVA_AUTH_ERROR]`, {
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
              "Strava account not connected. Please sign in with Strava.",
          });
        }

        // Create Strava client with token refresh callback
        const stravaClient = new StravaClient(
          stravaAccount.access_token,
          stravaAccount.refresh_token,
          stravaAccount.expires_at ?? 0,
          async (tokens) => {
            const tokenUpdateStart = Date.now();
            console.log(`[STRAVA_TOKEN_REFRESH_CALLBACK]`, {
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
            console.log(`[STRAVA_TOKEN_REFRESH_COMPLETE]`, {
              userId,
              duration: `${tokenUpdateDuration}ms`,
              timestamp: new Date().toISOString(),
            });
          },
        );

        // Explore segments using Strava API
        const apiStart = Date.now();
        const segments = await stravaClient.exploreSegments(
          input as BoundsInput,
        );
        const apiDuration = Date.now() - apiStart;

        // Store result in cache
        segmentExploreCache.set(cacheKey, segments);

        const totalDuration = Date.now() - startTime;

        console.log(`[STRAVA_SEGMENT_EXPLORE_SUCCESS]`, {
          userId,
          cacheKey,
          segmentCount: segments.length,
          apiDuration: `${apiDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          cacheStored: true,
          timestamp: new Date().toISOString(),
        });

        return segments;
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[STRAVA_SEGMENT_EXPLORE_ERROR]`, {
          userId,
          cacheKey,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : "Unknown error",
          errorType: error instanceof TRPCError ? error.code : "UNKNOWN",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        // Handle rate limiting specifically
        if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
          console.warn(`[STRAVA_RATE_LIMIT]`, {
            userId,
            cacheKey,
            retryAfter: (error.cause as { retryAfter?: number })?.retryAfter,
            message: "Strava rate limit exceeded",
            timestamp: new Date().toISOString(),
          });
          // Pass through the rate limit error with retryAfter information
          throw error;
        }

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
      const startTime = Date.now();

      console.log(`[STRAVA_SEGMENT_DETAIL_START]`, {
        userId,
        segmentId: input.segmentId,
        timestamp: new Date().toISOString(),
      });

      try {
        // Get user's Strava credentials
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

        console.log(`[STRAVA_SEGMENT_DETAIL_DB_QUERY]`, {
          userId,
          segmentId: input.segmentId,
          duration: `${dbDuration}ms`,
          hasAccount: !!stravaAccount,
          timestamp: new Date().toISOString(),
        });

        if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
          console.error(`[STRAVA_SEGMENT_DETAIL_AUTH_ERROR]`, {
            userId,
            segmentId: input.segmentId,
            error: "Missing Strava credentials",
            timestamp: new Date().toISOString(),
          });

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
            console.log(`[STRAVA_SEGMENT_DETAIL_TOKEN_REFRESH]`, {
              userId,
              segmentId: input.segmentId,
              message: "Refreshing tokens during segment detail fetch",
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
          },
        );

        // Get segment detail from Strava API
        const apiStart = Date.now();
        const segmentDetail = await stravaClient.getSegmentDetail(
          input.segmentId,
        );
        const apiDuration = Date.now() - apiStart;
        const totalDuration = Date.now() - startTime;

        console.log(`[STRAVA_SEGMENT_DETAIL_SUCCESS]`, {
          userId,
          segmentId: input.segmentId,
          segmentName: segmentDetail.name,
          distance: segmentDetail.distance,
          apiDuration: `${apiDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          timestamp: new Date().toISOString(),
        });

        return segmentDetail;
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[STRAVA_SEGMENT_DETAIL_ERROR]`, {
          userId,
          segmentId: input.segmentId,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : "Unknown error",
          errorType: error instanceof TRPCError ? error.code : "UNKNOWN",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

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

  /**
   * Get athlete's starred/favorite segments from Strava
   * Returns segments that the current user has starred on Strava
   * Includes full segment details with polylines
   */
  getStarredSegments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const startTime = Date.now();

    console.log(`[STRAVA_STARRED_SEGMENTS_START]`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    try {
      // Get user's Strava credentials
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

      console.log(`[STRAVA_STARRED_DB_QUERY]`, {
        userId,
        duration: `${dbDuration}ms`,
        hasAccount: !!stravaAccount,
        timestamp: new Date().toISOString(),
      });

      if (!stravaAccount?.access_token || !stravaAccount?.refresh_token) {
        console.error(`[STRAVA_STARRED_AUTH_ERROR]`, {
          userId,
          error: "Missing Strava credentials",
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Strava account not connected. Please sign in with Strava.",
        });
      }

      // Create Strava client with token refresh callback
      const stravaClient = new StravaClient(
        stravaAccount.access_token,
        stravaAccount.refresh_token,
        stravaAccount.expires_at ?? 0,
        async (tokens) => {
          const tokenUpdateStart = Date.now();
          console.log(`[STRAVA_STARRED_TOKEN_REFRESH]`, {
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
          console.log(`[STRAVA_STARRED_TOKEN_COMPLETE]`, {
            userId,
            duration: `${tokenUpdateDuration}ms`,
            timestamp: new Date().toISOString(),
          });
        },
      );

      // Get starred segments from Strava API
      const apiStart = Date.now();
      const starredSegments = await stravaClient.getStarredSegments();
      const apiDuration = Date.now() - apiStart;
      const totalDuration = Date.now() - startTime;

      console.log(`[STRAVA_STARRED_SEGMENTS_SUCCESS]`, {
        userId,
        segmentCount: starredSegments.length,
        apiDuration: `${apiDuration}ms`,
        totalDuration: `${totalDuration}ms`,
        segments: starredSegments
          .slice(0, 3)
          .map((s) => ({ id: s.id, name: s.name })), // Log first 3 for debugging
        timestamp: new Date().toISOString(),
      });

      return starredSegments;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[STRAVA_STARRED_SEGMENTS_ERROR]`, {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
        errorType: error instanceof TRPCError ? error.code : "UNKNOWN",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      // Handle rate limiting specifically
      if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
        console.warn(`[STRAVA_STARRED_RATE_LIMIT]`, {
          userId,
          retryAfter: (error.cause as { retryAfter?: number })?.retryAfter,
          message: "Strava rate limit exceeded while fetching starred segments",
          timestamp: new Date().toISOString(),
        });
        // Pass through the rate limit error with retryAfter information
        throw error;
      }

      // Re-throw TRPCError as-is
      if (error instanceof TRPCError) {
        throw error;
      }

      // Wrap other errors
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get starred segments",
        cause: error,
      });
    }
  }),
});
