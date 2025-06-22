import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, sql } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { favourites, segments } from "~/server/db/schema";

// Input validation schemas
const addManySchema = z.object({
  segments: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      distance: z.number(),
      averageGrade: z.number(),
      polyline: z.string().optional(),
      latStart: z.number(),
      lonStart: z.number(),
      latEnd: z.number(),
      lonEnd: z.number(),
      elevHigh: z.number().optional(),
      elevLow: z.number().optional(),
      komTime: z.string().optional(),
      climbCategory: z.string().optional(),
      elevationGain: z.number().optional(),
      ascentM: z.number().optional(),
      descentM: z.number().optional(),
    }),
  ),
});

const removeSchema = z.object({
  segmentId: z.string(),
});

export const favouriteRouter = createTRPCRouter({
  /**
   * Add multiple segments to user's favourites
   * First ensures segments exist in the segments table, then adds to favourites
   * Idempotent - ignores duplicates
   */
  addMany: protectedProcedure
    .input(addManySchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const startTime = Date.now();

      console.log(`[FAVOURITE_ADD_MANY_START]`, {
        userId,
        segmentCount: input.segments.length,
        segmentIds: input.segments.map((s) => s.id),
        timestamp: new Date().toISOString(),
      });

      try {
        // First, ensure all segments exist in the segments table
        // Reuse existing segment.saveMany logic
        const segmentData = input.segments.map((segment) => ({
          id: BigInt(segment.id),
          name: segment.name,
          distance: segment.distance,
          averageGrade: segment.averageGrade,
          polyline: segment.polyline ?? null,
          latStart: segment.latStart,
          lonStart: segment.lonStart,
          latEnd: segment.latEnd,
          lonEnd: segment.lonEnd,
          elevHigh: segment.elevHigh ?? null,
          elevLow: segment.elevLow ?? null,
          komTime: segment.komTime ?? null,
          climbCategory: segment.climbCategory ?? null,
                      elevationGain: segment.elevationGain ?? null,
            ascentM: segment.ascentM ?? 0,
            descentM: segment.descentM ?? 0,
        }));

        // Insert segments (ignore conflicts)
        const segmentInsertStart = Date.now();
        await ctx.db
          .insert(segments)
          .values(segmentData)
          .onConflictDoNothing();
        const segmentInsertDuration = Date.now() - segmentInsertStart;

        // Now add to favourites (ignore conflicts for idempotency)
        const favouriteData = input.segments.map((segment) => ({
          userId,
          segmentId: BigInt(segment.id),
        }));

        const favouriteInsertStart = Date.now();
        const result = await ctx.db
          .insert(favourites)
          .values(favouriteData)
          .onConflictDoNothing()
          .returning({ segmentId: favourites.segmentId });
        const favouriteInsertDuration = Date.now() - favouriteInsertStart;

        const totalDuration = Date.now() - startTime;
        const addedCount = result.length;
        const skippedCount = input.segments.length - addedCount;

        console.log(`[FAVOURITE_ADD_MANY_SUCCESS]`, {
          userId,
          totalDuration: `${totalDuration}ms`,
          segmentInsertDuration: `${segmentInsertDuration}ms`,
          favouriteInsertDuration: `${favouriteInsertDuration}ms`,
          added: addedCount,
          skipped: skippedCount,
          total: input.segments.length,
          addedIds: result.map((r) => r.segmentId.toString()),
          timestamp: new Date().toISOString(),
        });

        return {
          added: addedCount,
          skipped: skippedCount,
          total: input.segments.length,
        };
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[FAVOURITE_ADD_MANY_ERROR]`, {
          userId,
          duration: `${duration}ms`,
          segmentCount: input.segments.length,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to add favourites",
          cause: error,
        });
      }
    }),

  /**
   * Remove a segment from user's favourites
   */
  remove: protectedProcedure
    .input(removeSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const startTime = Date.now();

      console.log(`[FAVOURITE_REMOVE_START]`, {
        userId,
        segmentId: input.segmentId,
        timestamp: new Date().toISOString(),
      });

      try {
        const result = await ctx.db
          .delete(favourites)
          .where(
            and(
              eq(favourites.userId, userId),
              eq(favourites.segmentId, BigInt(input.segmentId)),
            ),
          )
          .returning({ segmentId: favourites.segmentId });

        const duration = Date.now() - startTime;
        const removed = result.length > 0;

        console.log(`[FAVOURITE_REMOVE_SUCCESS]`, {
          userId,
          segmentId: input.segmentId,
          duration: `${duration}ms`,
          removed,
          timestamp: new Date().toISOString(),
        });

        return { removed };
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[FAVOURITE_REMOVE_ERROR]`, {
          userId,
          segmentId: input.segmentId,
          duration: `${duration}ms`,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to remove favourite",
          cause: error,
        });
      }
    }),

  /**
   * Get all favourites for the current user with joined segment data
   */
  getMyFavourites: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const startTime = Date.now();

    console.log(`[FAVOURITE_GET_MY_FAVOURITES_START]`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await ctx.db
        .select({
          segmentId: favourites.segmentId,
          createdAt: favourites.createdAt,
          // Segment data
          id: segments.id,
          name: segments.name,
          distance: segments.distance,
          averageGrade: segments.averageGrade,
          latStart: segments.latStart,
          lonStart: segments.lonStart,
          latEnd: segments.latEnd,
          lonEnd: segments.lonEnd,
          polyline: segments.polyline,
          komTime: segments.komTime,
          climbCategory: segments.climbCategory,
          elevationGain: segments.elevationGain,
        ascentM: segments.ascentM,
        descentM: segments.descentM,
          elevHigh: segments.elevHigh,
          elevLow: segments.elevLow,
        })
        .from(favourites)
        .innerJoin(segments, eq(favourites.segmentId, segments.id))
        .where(eq(favourites.userId, userId))
        .orderBy(segments.name);

      const favouritesList = result.map((row) => ({
        id: row.id.toString(),
        name: row.name,
        distance: row.distance,
        averageGrade: row.averageGrade,
        latStart: row.latStart,
        lonStart: row.lonStart,
        latEnd: row.latEnd,
        lonEnd: row.lonEnd,
        polyline: row.polyline ?? undefined,
        komTime: row.komTime ?? undefined,
        climbCategory: row.climbCategory ?? undefined,
                  elevationGain: row.elevationGain ?? 0,
          ascentM: row.ascentM ?? 0,
          descentM: row.descentM ?? 0,
        elevHigh: row.elevHigh ?? undefined,
        elevLow: row.elevLow ?? undefined,
        favouriteCreatedAt: row.createdAt,
      }));

      const duration = Date.now() - startTime;

      console.log(`[FAVOURITE_GET_MY_FAVOURITES_SUCCESS]`, {
        userId,
        duration: `${duration}ms`,
        count: favouritesList.length,
        timestamp: new Date().toISOString(),
      });

      return favouritesList;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[FAVOURITE_GET_MY_FAVOURITES_ERROR]`, {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get favourites",
        cause: error,
      });
    }
  }),

  /**
   * Get count of user's favourites (for header badge)
   */
  count: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const startTime = Date.now();

    console.log(`[FAVOURITE_COUNT_START]`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(favourites)
        .where(eq(favourites.userId, userId));

      const count = result[0]?.count ?? 0;
      const duration = Date.now() - startTime;

      console.log(`[FAVOURITE_COUNT_SUCCESS]`, {
        userId,
        duration: `${duration}ms`,
        count,
        timestamp: new Date().toISOString(),
      });

      return { count };
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[FAVOURITE_COUNT_ERROR]`, {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get favourite count",
        cause: error,
      });
    }
  }),
}); 