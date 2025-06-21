import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { inArray } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "~/server/api/trpc";
import { segments } from "~/server/db/schema";

// Input validation schemas
const saveSegmentsSchema = z.object({
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
    }),
  ),
});

const getSavedSegmentsSchema = z.object({
  segmentIds: z.array(z.string()),
});

export const segmentRouter = createTRPCRouter({
  /**
   * Save multiple segments to the database
   * Only saves segments that don't already exist
   */
  saveMany: protectedProcedure
    .input(saveSegmentsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const startTime = Date.now();

      console.log(`[SEGMENT_SAVE_MANY_START]`, {
        userId,
        segmentCount: input.segments.length,
        segmentIds: input.segments.map((s) => s.id),
        totalDistance: input.segments.reduce((sum, s) => sum + s.distance, 0),
        avgGrade:
          input.segments.length > 0
            ? (
                input.segments.reduce((sum, s) => sum + s.averageGrade, 0) /
                input.segments.length
              ).toFixed(2)
            : 0,
        timestamp: new Date().toISOString(),
      });

      try {
        // Check which segments already exist in the database
        const existingQueryStart = Date.now();
        const existingSegments = await ctx.db
          .select({ id: segments.id })
          .from(segments)
          .where(
            inArray(
              segments.id,
              input.segments.map((s) => BigInt(s.id)),
            ),
          );
        const existingQueryDuration = Date.now() - existingQueryStart;

        const existingSegmentIds = new Set(
          existingSegments.map((s) => s.id.toString()),
        );

        // Filter out segments that already exist
        const segmentsToSave = input.segments.filter(
          (s) => !existingSegmentIds.has(s.id),
        );

        console.log(`[SEGMENT_SAVE_MANY_EXISTING_CHECK]`, {
          userId,
          existingCheckDuration: `${existingQueryDuration}ms`,
          totalSegments: input.segments.length,
          existingSegments: existingSegments.length,
          segmentsToSave: segmentsToSave.length,
          existingIds: Array.from(existingSegmentIds),
          timestamp: new Date().toISOString(),
        });

        let savedCount = 0;

        if (segmentsToSave.length > 0) {
          // Convert segments to database format
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
            elevHigh: segment.elevHigh ?? null,
            elevLow: segment.elevLow ?? null,
            komTime: segment.komTime ?? null,
            climbCategory: segment.climbCategory ?? null,
            elevationGain: segment.elevationGain ?? null,
          }));

          // Insert new segments
          const insertStart = Date.now();
          await ctx.db.insert(segments).values(segmentData);
          const insertDuration = Date.now() - insertStart;
          savedCount = segmentsToSave.length;

          console.log(`[SEGMENT_SAVE_MANY_INSERT]`, {
            userId,
            insertDuration: `${insertDuration}ms`,
            savedCount,
            avgInsertTime: `${Math.round(insertDuration / savedCount)}ms`,
            segmentsSaved: segmentsToSave.map((s) => ({
              id: s.id,
              name: s.name,
            })),
            timestamp: new Date().toISOString(),
          });
        }

        const skippedCount = input.segments.length - savedCount;
        const totalDuration = Date.now() - startTime;

        console.log(`[SEGMENT_SAVE_MANY_COMPLETE]`, {
          userId,
          totalDuration: `${totalDuration}ms`,
          saved: savedCount,
          skipped: skippedCount,
          total: input.segments.length,
          successRate: `${((savedCount / input.segments.length) * 100).toFixed(1)}%`,
          timestamp: new Date().toISOString(),
        });

        return {
          saved: savedCount,
          skipped: skippedCount,
          total: input.segments.length,
        };
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[SEGMENT_SAVE_MANY_ERROR]`, {
          userId,
          duration: `${duration}ms`,
          segmentCount: input.segments.length,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to save segments",
          cause: error,
        });
      }
    }),

  /**
   * Check which segments from a list are already saved in the database
   * Used to show badges on saved segments
   */
  getSavedStatus: protectedProcedure
    .input(getSavedSegmentsSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const startTime = Date.now();

      console.log(`[SEGMENT_GET_SAVED_STATUS_START]`, {
        userId,
        segmentCount: input.segmentIds.length,
        segmentIds: input.segmentIds,
        timestamp: new Date().toISOString(),
      });

      if (input.segmentIds.length === 0) {
        console.log(`[SEGMENT_GET_SAVED_STATUS_EMPTY]`, {
          userId,
          message: "No segment IDs provided, returning empty array",
          timestamp: new Date().toISOString(),
        });
        return [];
      }

      try {
        const savedSegments = await ctx.db
          .select({ id: segments.id })
          .from(segments)
          .where(
            inArray(
              segments.id,
              input.segmentIds.map((id) => BigInt(id)),
            ),
          );

        const result = savedSegments.map((s) => s.id.toString());
        const duration = Date.now() - startTime;

        console.log(`[SEGMENT_GET_SAVED_STATUS_SUCCESS]`, {
          userId,
          duration: `${duration}ms`,
          queriedSegments: input.segmentIds.length,
          savedSegments: result.length,
          savedIds: result,
          savedRate: `${((result.length / input.segmentIds.length) * 100).toFixed(1)}%`,
          timestamp: new Date().toISOString(),
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        console.error(`[SEGMENT_GET_SAVED_STATUS_ERROR]`, {
          userId,
          duration: `${duration}ms`,
          segmentCount: input.segmentIds.length,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get saved status",
          cause: error,
        });
      }
    }),

  /**
   * Get all saved segments for the current user
   * Returns segments that the user has explicitly saved in the application
   */
  getMySavedSegments: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const startTime = Date.now();

    console.log(`[SEGMENT_GET_SAVED_START]`, {
      userId,
      timestamp: new Date().toISOString(),
    });

    try {
      const savedSegments = await ctx.db
        .select()
        .from(segments)
        .orderBy(segments.name);

      const result = savedSegments.map((segment) => ({
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
      }));

      const duration = Date.now() - startTime;

      console.log(`[SEGMENT_GET_SAVED_SUCCESS]`, {
        userId,
        duration: `${duration}ms`,
        segmentCount: result.length,
        timestamp: new Date().toISOString(),
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      console.error(`[SEGMENT_GET_SAVED_ERROR]`, {
        userId,
        duration: `${duration}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to get saved segments",
        cause: error,
      });
    }
  }),
});
