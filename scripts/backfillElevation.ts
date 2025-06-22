/**
 * Backfill script to populate existing segments with ascent and descent values
 * This script processes segments in batches to avoid overwhelming the database
 */

import { db } from "~/server/db";
import { segments } from "~/server/db/schema";
import { calculateElevationFromPolyline } from "~/server/algorithms/elevation";
import { isNull, isNotNull, sql } from "drizzle-orm";

const BATCH_SIZE = 500;

async function backfillElevation() {
  console.log("[BACKFILL_ELEVATION_START]", {
    batchSize: BATCH_SIZE,
    timestamp: new Date().toISOString(),
  });

  try {
    // Get count of segments that need backfilling
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(segments)
      .where(isNull(segments.ascentM));

    const totalToProcess = countResult[0]?.count ?? 0;

    console.log("[BACKFILL_ELEVATION_COUNT]", {
      totalSegments: totalToProcess,
      batchSize: BATCH_SIZE,
      estimatedBatches: Math.ceil(totalToProcess / BATCH_SIZE),
      timestamp: new Date().toISOString(),
    });

    if (totalToProcess === 0) {
      console.log("[BACKFILL_ELEVATION_COMPLETE]", {
        message: "No segments need backfilling",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    let processedCount = 0;
    let batchNumber = 0;

    while (processedCount < totalToProcess) {
      batchNumber++;
      const batchStart = Date.now();

      console.log("[BACKFILL_ELEVATION_BATCH_START]", {
        batchNumber,
        processedCount,
        totalToProcess,
        progress: `${Math.round((processedCount / totalToProcess) * 100)}%`,
        timestamp: new Date().toISOString(),
      });

      // Get batch of segments that need elevation data
      const segmentBatch = await db
        .select({
          id: segments.id,
          polyline: segments.polyline,
          elevationGain: segments.elevationGain,
        })
        .from(segments)
        .where(isNull(segments.ascentM))
        .limit(BATCH_SIZE);

      if (segmentBatch.length === 0) {
        console.log("[BACKFILL_ELEVATION_NO_MORE_SEGMENTS]", {
          batchNumber,
          processedCount,
          timestamp: new Date().toISOString(),
        });
        break;
      }

      // Process each segment in the batch
      const updates: Array<{ id: bigint; ascentM: number; descentM: number }> = [];

      for (const segment of segmentBatch) {
        try {
          let ascentM = 0;
          let descentM = 0;

          if (segment.polyline) {
            // Calculate from polyline if available
            const elevationResult = calculateElevationFromPolyline(segment.polyline);
            ascentM = elevationResult.ascentM;
            descentM = elevationResult.descentM;
          } else if (segment.elevationGain && segment.elevationGain > 0) {
            // Fallback to legacy elevation gain with heuristic split
            ascentM = Math.round(segment.elevationGain * 0.6);
            descentM = Math.round(segment.elevationGain * 0.4);
          }

          updates.push({
            id: segment.id,
            ascentM,
            descentM,
          });
        } catch (error) {
          console.warn("[BACKFILL_ELEVATION_SEGMENT_ERROR]", {
            segmentId: segment.id.toString(),
            error: error instanceof Error ? error.message : "Unknown error",
            timestamp: new Date().toISOString(),
          });

          // Add zero values for failed segments
          updates.push({
            id: segment.id,
            ascentM: 0,
            descentM: 0,
          });
        }
      }

      // Batch update all segments
      for (const update of updates) {
        await db
          .update(segments)
          .set({
            ascentM: update.ascentM,
            descentM: update.descentM,
          })
          .where(sql`${segments.id} = ${update.id}`);
      }

      processedCount += segmentBatch.length;
      const batchDuration = Date.now() - batchStart;

      console.log("[BACKFILL_ELEVATION_BATCH_COMPLETE]", {
        batchNumber,
        batchSize: segmentBatch.length,
        processedCount,
        totalToProcess,
        progress: `${Math.round((processedCount / totalToProcess) * 100)}%`,
        duration: `${batchDuration}ms`,
        avgTimePerSegment: `${Math.round(batchDuration / segmentBatch.length)}ms`,
        updatesApplied: updates.length,
        timestamp: new Date().toISOString(),
      });

      // Small delay to avoid overwhelming the database
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log("[BACKFILL_ELEVATION_COMPLETE]", {
      totalProcessed: processedCount,
      totalBatches: batchNumber,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("[BACKFILL_ELEVATION_ERROR]", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

// Run the backfill if this script is executed directly
if (require.main === module) {
  backfillElevation()
    .then(() => {
      console.log("Backfill completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Backfill failed:", error);
      process.exit(1);
    });
}

export { backfillElevation }; 