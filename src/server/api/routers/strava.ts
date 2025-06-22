import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import {
  StravaClient,
  type BoundsInput,
  type SegmentDTO,
  // type PolylineDetail, // Unused for now but kept for future use
} from "~/server/integrations/strava";
import { accounts, segments } from "~/server/db/schema";
import { eq, inArray, sql, and, gte } from "drizzle-orm";
import { segmentExploreCache, LRUCache } from "~/server/cache/lru";

// Input validation schemas
const boundsSchema = z.object({
  sw: z.tuple([z.number(), z.number()]), // [lat, lng]
  ne: z.tuple([z.number(), z.number()]), // [lat, lng]
  detail: z.enum(["full", "simplified"]).optional().default("simplified"),
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

        // First, try to get segments from our database within the bounds
        const dbSearchStart = Date.now();
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        // Query segments within bounds that are less than 7 days old
        const dbSegments = await ctx.db
          .select()
          .from(segments)
          .where(
            and(
              gte(segments.latStart, input.sw[0]), // lat >= sw.lat
              sql`${segments.latStart} <= ${input.ne[0]}`, // lat <= ne.lat
              gte(segments.lonStart, input.sw[1]), // lng >= sw.lng  
              sql`${segments.lonStart} <= ${input.ne[1]}`, // lng <= ne.lng
              gte(segments.createdAt, sevenDaysAgo) // created within last 7 days
            )
          );
        
        const dbSearchDuration = Date.now() - dbSearchStart;

        console.log(`[STRAVA_SEGMENT_DB_SEARCH]`, {
          userId,
          cacheKey,
          duration: `${dbSearchDuration}ms`,
          dbSegmentCount: dbSegments.length,
          sevenDaysAgo: sevenDaysAgo.toISOString(),
          boundsQuery: {
            latRange: [input.sw[0], input.ne[0]],
            lngRange: [input.sw[1], input.ne[1]]
          },
          timestamp: new Date().toISOString(),
        });

        // If we have recent segments in our database, use them
        if (dbSegments.length > 0) {
          const dbSegmentDTOs: SegmentDTO[] = dbSegments.map((segment) => ({
            id: segment.id.toString(),
            name: segment.name,
            distance: segment.distance,
            averageGrade: segment.averageGrade,
            latStart: segment.latStart,
            lonStart: segment.lonStart,
            latEnd: segment.latEnd,
            lonEnd: segment.lonEnd,
            polyline: segment.polyline ?? undefined,
            komTime: segment.komTime ?? undefined,
            climbCategory: segment.climbCategory ?? undefined,
            elevationGain: segment.elevationGain ?? 0,
            ascentM: segment.ascentM ?? 0,
            descentM: segment.descentM ?? 0,
          }));

          // Store in memory cache as well
          segmentExploreCache.set(cacheKey, dbSegmentDTOs);

          const totalDuration = Date.now() - startTime;

          console.log(`[STRAVA_SEGMENT_EXPLORE_DB_SUCCESS]`, {
            userId,
            cacheKey,
            segmentCount: dbSegmentDTOs.length,
            dbSearchDuration: `${dbSearchDuration}ms`,
            totalDuration: `${totalDuration}ms`,
            source: "database",
            cacheStored: true,
            timestamp: new Date().toISOString(),
          });

          return dbSegmentDTOs;
        }

        // If no recent segments in database, fetch from Strava API
        console.log(`[STRAVA_SEGMENT_FETCH_FROM_API]`, {
          userId,
          cacheKey,
          reason: "No recent segments in database",
          timestamp: new Date().toISOString(),
        });

        const apiStart = Date.now();
        const stravaSegments = await stravaClient.exploreSegments(
          input as BoundsInput,
          input.detail,
        );
        const apiDuration = Date.now() - apiStart;

        // Save segments to database for future use
        if (stravaSegments.length > 0) {
          const dbSaveStart = Date.now();
          
          try {
            // Check which segments already exist to avoid duplicates
            const existingSegmentIds = await ctx.db
              .select({ id: segments.id })
              .from(segments)
              .where(
                inArray(
                  segments.id,
                  stravaSegments.map((s) => BigInt(s.id))
                )
              );
            
            const existingIds = new Set(existingSegmentIds.map(s => s.id.toString()));
            const segmentsToSave = stravaSegments.filter(s => !existingIds.has(s.id));

            if (segmentsToSave.length > 0) {
              const segmentData = segmentsToSave.map((segment) => ({
                id: BigInt(segment.id),
                name: segment.name,
                distance: segment.distance,
                averageGrade: segment.averageGrade,
                polyline: segment.polyline ?? null,
                latStart: segment.latStart,
                lonStart: segment.lonStart,
                latEnd: segment.latEnd,
                lonEnd: segment.lonEnd,
                elevHigh: null, // Will be populated later if needed
                elevLow: null, // Will be populated later if needed
                komTime: segment.komTime ?? null,
                climbCategory: segment.climbCategory ?? null,
                elevationGain: segment.elevationGain ?? 0,
                ascentM: segment.ascentM ?? 0,
                descentM: segment.descentM ?? 0,
              }));

              await ctx.db.insert(segments).values(segmentData);
            }

            const dbSaveDuration = Date.now() - dbSaveStart;

            console.log(`[STRAVA_SEGMENT_DB_SAVE]`, {
              userId,
              cacheKey,
              duration: `${dbSaveDuration}ms`,
              totalSegments: stravaSegments.length,
              existingSegments: existingIds.size,
              savedSegments: segmentsToSave.length,
              timestamp: new Date().toISOString(),
            });
          } catch (dbError) {
            console.warn(`[STRAVA_SEGMENT_DB_SAVE_ERROR]`, {
              userId,
              cacheKey,
              error: dbError instanceof Error ? dbError.message : "Unknown error",
              message: "Failed to save segments to database, continuing with API result",
              timestamp: new Date().toISOString(),
            });
          }
        }

        // Store result in memory cache
        segmentExploreCache.set(cacheKey, stravaSegments);

        const totalDuration = Date.now() - startTime;

        console.log(`[STRAVA_SEGMENT_EXPLORE_SUCCESS]`, {
          userId,
          cacheKey,
          segmentCount: stravaSegments.length,
          apiDuration: `${apiDuration}ms`,
          totalDuration: `${totalDuration}ms`,
          source: "strava_api",
          cacheStored: true,
          timestamp: new Date().toISOString(),
        });

        return stravaSegments;
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
