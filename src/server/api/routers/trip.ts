import { z } from "zod";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "~/server/api/trpc";
import { trips } from "~/server/db/schema";
import { reverseGeocode } from "~/server/integrations/mapbox";
import { eq } from "drizzle-orm";

/**
 * Input schema for saving a trip based on route planner output
 */
const saveTripInput = z.object({
  // Route planner constraints
  constraints: z.object({
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxDailyDistanceKm: z.number().min(1).max(200),
    maxDailyElevationM: z.number().min(0).max(3000),
  }),
  
  // Route planner results
  routes: z.array(z.object({
    dayNumber: z.number().min(1).max(4),
    distanceKm: z.number(),
    elevationGainM: z.number(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
    segmentsVisited: z.array(z.number()),
    durationMinutes: z.number(),
    segments: z.array(z.object({
      id: z.number(),
      name: z.string(),
      stravaUrl: z.string().optional(),
    })).optional(),
  })),
  
  totalDistanceKm: z.number(),
  totalElevationGainM: z.number(),
  totalDurationMinutes: z.number(),
});

/**
 * Generate a unique, SEO-friendly slug for the trip
 */
function generateTripSlug(startLocality: string, endLocality: string, startDate: string): string {
  // Clean locality names for URL use
  const cleanStart = startLocality.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const cleanEnd = endLocality.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  // Extract date components
  const dateStr = startDate.replace(/-/g, '');
  
  // Add random suffix to ensure uniqueness
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  // Handle same start/end locality (loop routes)
  if (cleanStart === cleanEnd) {
    return `${cleanStart}-loop-${dateStr}-${randomSuffix}`;
  }
  
  return `${cleanStart}-${cleanEnd}-${dateStr}-${randomSuffix}`;
}

/**
 * Format day name for trip display
 */
function formatDayName(
  dayNumber: number,
  startLocality: string,
  endLocality: string,
  distanceKm: number
): string {
  const roundedDistance = Math.round(distanceKm);
  
  // Handle loop routes (same start/end)
  if (startLocality === endLocality) {
    return `Day ${dayNumber} – ${startLocality} Loop – ${roundedDistance} km`;
  }
  
  return `Day ${dayNumber} – ${startLocality} - ${endLocality} – ${roundedDistance} km`;
}

export const tripRouter = createTRPCRouter({
  /**
   * Save a trip from route planner results with automatic locality naming
   * Calls reverse geocoding for start/end coordinates of each day
   * Generates SEO-friendly slug and returns shareable URL
   */
  save: protectedProcedure
    .input(saveTripInput)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      console.log(`[TRIP_SAVE_START]`, {
        userId,
        routeCount: input.routes.length,
        totalDistanceKm: input.totalDistanceKm,
        totalElevationM: input.totalElevationGainM,
        constraints: input.constraints,
        timestamp: new Date().toISOString(),
      });

      try {
        // Process each day to get locality names
        const daysWithLocalities = await Promise.all(
          input.routes.map(async (route) => {
            const { geometry, dayNumber, distanceKm, elevationGainM, durationMinutes } = route;
            const coordinates = geometry.coordinates;
            
            if (coordinates.length === 0) {
              throw new Error(`Day ${dayNumber} has no coordinates`);
            }

            // Get start and end coordinates
            const startCoord = coordinates[0] as [number, number];
            const endCoord = coordinates[coordinates.length - 1] as [number, number];

            console.log(`[TRIP_SAVE_GEOCODING_DAY]`, {
              dayNumber,
              startCoord,
              endCoord,
              coordinateCount: coordinates.length,
              timestamp: new Date().toISOString(),
            });

            // Reverse geocode start and end points
            const [startLocation, endLocation] = await Promise.all([
              reverseGeocode(startCoord),
              reverseGeocode(endCoord),
            ]);

            const startLocality = startLocation.displayName;
            const endLocality = endLocation.displayName;
            
            // Generate formatted day name
            const dayName = formatDayName(dayNumber, startLocality, endLocality, distanceKm);

            console.log(`[TRIP_SAVE_DAY_NAMED]`, {
              dayNumber,
              startLocality,
              endLocality,
              dayName,
              distanceKm: Math.round(distanceKm),
              elevationM: Math.round(elevationGainM),
              timestamp: new Date().toISOString(),
            });

            return {
              day: dayNumber,
              startLocality,
              endLocality,
              distanceKm: Math.round(distanceKm * 100) / 100, // Round to 2 decimal places
              elevationM: Math.round(elevationGainM),
              durationHours: Math.round(durationMinutes / 60 * 100) / 100,
              dayName,
              segmentCount: route.segmentsVisited.length,
              segments: route.segments ?? [],
            };
          })
        );

        // Generate slug using first and last day localities
        const firstDay = daysWithLocalities[0];
        const lastDay = daysWithLocalities[daysWithLocalities.length - 1];
        
        if (!firstDay || !lastDay) {
          throw new Error("No days found for trip");
        }
        const slug = generateTripSlug(
          firstDay.startLocality,
          lastDay.endLocality,
          input.constraints.startDate
        );

        // Prepare trip data for database
        const tripData = {
          creatorUserId: userId,
          startDate: input.constraints.startDate,
          endDate: input.constraints.endDate,
          constraints: input.constraints,
          totalDistanceKm: Math.round(input.totalDistanceKm * 100) / 100,
          totalElevationM: Math.round(input.totalElevationGainM),
          days: daysWithLocalities,
          slug,
          // geometryS3Key will be added later when we implement S3 storage
        };

        // Insert trip into database
        const [savedTrip] = await ctx.db.insert(trips).values(tripData).returning();

        if (!savedTrip) {
          throw new Error("Failed to save trip to database");
        }

        // Generate shareable URL
        const baseUrl = process.env.PUBLIC_TRIP_BASE_URL ?? "http://localhost:3000";
        const shareUrl = `${baseUrl}/trip/${slug}`;

        console.log(`[TRIP_SAVE_SUCCESS]`, {
          tripId: savedTrip.id,
          slug,
          shareUrl,
          dayCount: daysWithLocalities.length,
          totalDistanceKm: tripData.totalDistanceKm,
          totalElevationM: tripData.totalElevationM,
          duration: `${Date.now() - new Date(savedTrip.createdAt).getTime()}ms`,
          timestamp: new Date().toISOString(),
        });

        // Log analytics event
        console.log(`[ANALYTICS_EVENT]`, {
          event: "trip_saved",
          userId,
          tripId: savedTrip.id,
          slug,
          segmentCount: input.routes.reduce((sum, route) => sum + route.segmentsVisited.length, 0),
          dayCount: daysWithLocalities.length,
          totalDistanceKm: tripData.totalDistanceKm,
          totalElevationM: tripData.totalElevationM,
          timestamp: new Date().toISOString(),
        });

        return {
          slug,
          shareUrl,
          tripId: savedTrip.id,
          days: daysWithLocalities,
        };

      } catch (error) {
        console.error(`[TRIP_SAVE_ERROR]`, {
          userId,
          error: error instanceof Error ? error.message : "Unknown error",
          stack: error instanceof Error ? error.stack : undefined,
          timestamp: new Date().toISOString(),
        });

        throw new Error(
          error instanceof Error 
            ? `Failed to save trip: ${error.message}`
            : "Failed to save trip due to unknown error"
        );
      }
    }),

  /**
   * Get trip by slug for public sharing
   * Returns trip data for both authenticated and anonymous users
   */
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      console.log(`[TRIP_GET_BY_SLUG_START]`, {
        slug: input.slug,
        isAuthenticated: !!ctx.session?.user,
        timestamp: new Date().toISOString(),
      });

      const trip = await ctx.db.query.trips.findFirst({
        where: eq(trips.slug, input.slug),
        with: {
          creator: {
            columns: {
              id: true,
              name: true,
              // Don't expose email or other sensitive data
            },
          },
        },
      });

      if (!trip) {
        console.log(`[TRIP_GET_BY_SLUG_NOT_FOUND]`, {
          slug: input.slug,
          timestamp: new Date().toISOString(),
        });
        throw new Error("Trip not found");
      }

      console.log(`[TRIP_GET_BY_SLUG_SUCCESS]`, {
        tripId: trip.id,
        slug: input.slug,
        creatorId: trip.creatorUserId,
        dayCount: Array.isArray(trip.days) ? trip.days.length : 0,
        totalDistanceKm: trip.totalDistanceKm,
        isCreator: ctx.session?.user?.id === trip.creatorUserId,
        timestamp: new Date().toISOString(),
      });

      return {
        id: trip.id,
        slug: trip.slug,
        startDate: trip.startDate,
        endDate: trip.endDate,
        totalDistanceKm: trip.totalDistanceKm,
        totalElevationM: trip.totalElevationM,
        days: trip.days,
        constraints: trip.constraints,
        createdAt: trip.createdAt,
        creator: trip.creator ? {
          id: trip.creator.id,
          name: trip.creator.name,
        } : null,
        isCreator: ctx.session?.user?.id === trip.creatorUserId,
      };
    }),
}); 