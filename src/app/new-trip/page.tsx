"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RouteListSidebar } from "../_components/RouteListSidebar";
import { TripMapDisplay } from "../_components/TripMapDisplay";
import { useTripRouteStore } from "../_hooks/useTripRouteStore";
import { useTripPlanner, type TripPlanInput } from "../_hooks/useTripPlanner";
import { useTripConstraintStore } from "../_hooks/useTripConstraintStore";
import { ArrowLeft, Calendar, MapPin, Mountain } from "lucide-react";
import Link from "next/link";

function NewTripPageContent() {
  // Map error state
  const [mapError, setMapError] = useState<string | null>(null);

  // URL params and routing
  const searchParams = useSearchParams();
  
  // Get segment IDs from URL parameters
  const segmentIds = searchParams.get('segments')?.split(',').filter(Boolean) ?? [];
  
  // Trip route store for displaying planned routes
  const { currentTrip, routesVisible } = useTripRouteStore();
  
  // Trip constraints store
  const { constraints } = useTripConstraintStore();
  
  // Trip planner hook for planning the trip
  const {
    isPending,
    isError,
    isSuccess,
    error,
    data,
    planTrip,
    isSaved,
    savedTrip,
  } = useTripPlanner();

  // Reference to track if planning has been attempted for current segments
  const planningAttempted = useRef(false);
  
  // Reference to track if saving has been attempted for current trip
  const savingAttempted = useRef(false);
  
  // Reference to track the last processed trip data to avoid re-processing
  const lastProcessedData = useRef<typeof data>(null);
  const lastProcessedSavedTrip = useRef<typeof savedTrip>(null);

  // Trigger planning when page loads with segment IDs
  useEffect(() => {
    // Reset planning and saving attempted flags when segment IDs change
    planningAttempted.current = false;
    savingAttempted.current = false;
    lastProcessedData.current = null;
    lastProcessedSavedTrip.current = null;
  }, [segmentIds]);

  useEffect(() => {
    if (
      segmentIds.length > 0 && 
      !isPending && 
      !isSuccess && 
      !isError && 
      !currentTrip &&
      !planningAttempted.current &&
      constraints.startDate &&
      constraints.endDate
    ) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[NEW_TRIP_AUTO_START]", {
          segmentCount: segmentIds.length,
          segmentIds: segmentIds,
          constraints: {
            startDate: constraints.startDate,
            endDate: constraints.endDate,
            maxDailyDistanceKm: constraints.maxDailyDistanceKm,
            maxDailyElevationM: constraints.maxDailyElevationM,
          },
          timestamp: new Date().toISOString(),
        });
      }

      planningAttempted.current = true;

      const input: TripPlanInput = {
        segmentIds: segmentIds,
        startDate: constraints.startDate,
        endDate: constraints.endDate,
        maxDailyDistanceKm: constraints.maxDailyDistanceKm,
        maxDailyElevationM: constraints.maxDailyElevationM,
      };

      planTrip(input);
    }
  }, [
    segmentIds, 
    isPending, 
    isSuccess, 
    isError, 
    currentTrip, 
    planTrip,
    constraints.startDate,
    constraints.endDate,
    constraints.maxDailyDistanceKm,
    constraints.maxDailyElevationM,
  ]);

  // Update trip route store when planning succeeds and center map
  useEffect(() => {
    if (isSuccess && data?.ok && data !== lastProcessedData.current) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[NEW_TRIP_SUCCESS]", {
          routeCount: data.routes.length,
          totalDistance: Math.round(data.totalDistanceKm),
          timestamp: new Date().toISOString(),
        });
      }

      // Mark this data as processed to prevent re-processing
      lastProcessedData.current = data;

      // Convert API response to trip route store format
      const tripRoutes = data.routes.map((route) => ({
        dayNumber: route.dayNumber,
        geometry: route.geometry,
        distanceKm: route.distanceKm,
        elevationGainM: route.elevationGainM, // Legacy field for backward compatibility
        ascentM: route.ascentM,
        descentM: route.descentM,
        segmentNames: route.segments.map((segment) => segment.name),
      }));

      // Extract start coordinate from first route for map centering
      const startCoordinate = tripRoutes[0]?.geometry.coordinates[0];

      const trip = {
        routes: tripRoutes,
        totalDistanceKm: data.totalDistanceKm,
        totalElevationGainM: data.totalElevationGainM, // Legacy field for backward compatibility
        totalAscentM: data.totalAscentM,
        totalDescentM: data.totalDescentM,
        startCoordinate,
      };

      // Update the trip route store to trigger map visualization
      const { setTrip } = useTripRouteStore.getState();
      setTrip(trip);

      // Note: Map centering will be handled by the route display effect with fitBounds
    }
  }, [isSuccess, data]);



  // Update trip route store with saved trip data
  useEffect(() => {
    if (isSaved && savedTrip && savedTrip !== lastProcessedSavedTrip.current) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[NEW_TRIP_SAVED]", {
          slug: savedTrip.slug,
          shareUrl: savedTrip.shareUrl,
          dayCount: savedTrip.days.length,
          timestamp: new Date().toISOString(),
        });
      }

      // Mark this saved trip as processed
      lastProcessedSavedTrip.current = savedTrip;

      const { setSavedTripData } = useTripRouteStore.getState();
      setSavedTripData({
        slug: savedTrip.slug,
        shareUrl: savedTrip.shareUrl,
        days: savedTrip.days,
      });
    }
  }, [isSaved, savedTrip]);



  // Show empty state if no segments are provided and no current trip
  const shouldShowEmptyState = segmentIds.length === 0 && !currentTrip && !isPending;

  if (shouldShowEmptyState) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-6">
            <div className="mx-auto mb-4 flex h-24 w-24 items-center justify-center rounded-full bg-blue-100">
              <MapPin className="h-12 w-12 text-blue-600" />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-gray-900">
              Ready to Plan Your Trip?
            </h1>
            <p className="text-gray-600 max-w-md mx-auto">
              Select cycling segments on the Explore page and set your trip constraints to create a custom multi-day cycling itinerary.
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-center gap-8 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>Custom dates</span>
              </div>
              <div className="flex items-center gap-2">
                <Mountain className="h-4 w-4" />
                <span>Daily limits</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>Route optimization</span>
              </div>
            </div>

            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Explore
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <RouteListSidebar
        isLoading={isPending}
        error={isError ? error : null}
        currentTrip={currentTrip}
        planResponse={data}
      />

      {/* Map container */}
      <div className="relative flex-1">
        {/* Back navigation */}
        <div className="absolute left-4 top-4 z-10">
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 rounded-md bg-white/90 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm backdrop-blur-sm hover:bg-white hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Explore
          </Link>
        </div>

        {/* Reusable Trip Map Display Component */}
        <TripMapDisplay
          trip={currentTrip}
          routesVisible={routesVisible}
          mapError={mapError}
          onMapError={setMapError}
          className="h-full w-full"
          initialCenter={[-0.1276, 51.5074]} // London coordinates as fallback
          initialZoom={10}
          showCoordinates={true}
        />
      </div>
    </div>
  );
}

export default function NewTripPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <NewTripPageContent />
    </Suspense>
  );
}