"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { api } from "~/trpc/react";
import { useToast } from "~/hooks/use-toast";
import { Calendar, MapPin, Download, Share2, User, Mountain } from "lucide-react";
import { getDayColor } from "~/lib/mapUtils";
import { downloadRoutesAsZip, type RouteForGPX } from "~/lib/gpxUtils";
import { TripMapDisplay } from "../../_components/TripMapDisplay";
import type { Trip } from "../../_hooks/useTripRouteStore";

// Type definitions for trip data from API
interface TripSegment {
  name: string;
}

interface TripDay {
  day: number;
  dayName?: string;
  startLocality: string;
  endLocality: string;
  distanceKm: number;
  elevationM: number;
  segmentCount?: number;
  durationHours?: number;
  segments?: TripSegment[];
  geometry?: {
    type: "LineString";
    coordinates: [number, number][];
  };
}

interface TripData {
  days: TripDay[];
  totalDistanceKm: number;
  totalElevationM: number;
  startDate: string;
  createdAt: string;
  creator?: {
    name: string;
  };
}

/**
 * Public trip display page for shared cycling trip URLs
 * Accessible at /trip/[slug] for both authenticated and anonymous users
 */
export default function TripDisplayPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const { toast } = useToast();

  // UI state
  const [mapError, setMapError] = useState<string | null>(null);
  const [routesVisible, setRoutesVisible] = useState(true);

  // Fetch trip data
  const { data: trip, isLoading, error } = api.trip.getBySlug.useQuery(
    { slug },
    { 
      enabled: !!slug,
      retry: false, // Don't retry on 404s
    }
  ) as { data: TripData | undefined, isLoading: boolean, error: unknown };

  // Convert API trip data to Trip format for map component
  const mapTrip: Trip | null = useMemo(() => {
    if (!trip?.days || !Array.isArray(trip.days)) {
      console.log("[TRIP_DISPLAY_CONVERT]", {
        hasTrip: !!trip,
        hasDays: Array.isArray(trip?.days),
        trip,
      });
      return null;
    }

    console.log("[TRIP_DISPLAY_CONVERT]", {
      slug,
      dayCount: trip.days.length,
      totalDistance: trip.totalDistanceKm,
      totalElevation: trip.totalElevationM,
      startDate: trip.startDate,
      timestamp: new Date().toISOString(),
    });

    // Convert each day to a route with stored route geometry
    const routes = trip.days.map((day: TripDay) => {
      // Use stored route geometry if available, otherwise create fallback
      let geometry;
      let geometrySource = "stored";
      
      if (day.geometry?.coordinates && day.geometry.coordinates.length > 0) {
        // Use the actual stored route geometry
        geometry = day.geometry;
        geometrySource = "stored";
      } else {
        // Fallback: use locality names to generate approximate coordinates for older trips
        console.warn(`[TRIP_DISPLAY_ROUTE_${day.day}] No stored geometry found, using locality-based fallback`);
        
        // Try to generate realistic coordinates based on locality names
        let startCoord: [number, number];
        let endCoord: [number, number];
        
        // Try to generate approximate coordinates based on locality names
        if (day.startLocality && day.endLocality) {
          console.log(`[TRIP_DISPLAY_ROUTE_${day.day}] Using localities: ${day.startLocality} -> ${day.endLocality}`);
          
          // Known locality coordinates for various regions
          const knownLocalities: Record<string, [number, number]> = {
            // Cyprus
            "ayios tykhonas": [33.0167, 34.6667],
            "lofou": [32.9000, 34.8500],
            "geroskipou": [32.4500, 34.7667],
            "limassol": [33.0333, 34.6833],
            "paphos": [32.4167, 34.7667],
            "nicosia": [33.3667, 35.1667],
            "larnaca": [33.6167, 34.9000],
            // Common European locations
            "london": [-0.1276, 51.5074],
            "paris": [2.3522, 48.8566],
            "rome": [12.4964, 41.9028],
            "madrid": [-3.7038, 40.4168],
            "berlin": [13.4050, 52.5200],
            "amsterdam": [4.9041, 52.3676],
            // Add more as needed
          };
          
          const startKey = day.startLocality.toLowerCase();
          const endKey = day.endLocality.toLowerCase();
          
          // Look up known coordinates
          const foundStartCoord = knownLocalities[startKey];
          const foundEndCoord = knownLocalities[endKey];
          
          // If we have known coordinates, use them; otherwise generate fallback
          if (foundStartCoord && foundEndCoord) {
            startCoord = foundStartCoord;
            endCoord = foundEndCoord;
          } else {
            // Generate spread-out fallback based on any known location or default
            const baseCoord = foundStartCoord ?? foundEndCoord ?? [20.0, 40.0]; // Mediterranean center
            const spread = (day.day - 1) * 0.5; // Spread days further apart
            
            if (foundStartCoord) {
              startCoord = foundStartCoord;
            } else {
              startCoord = [baseCoord[0] + spread, baseCoord[1] + spread * 0.3];
            }
            
            if (foundEndCoord) {
              endCoord = foundEndCoord;
            } else {
              endCoord = [startCoord[0] + 0.3, startCoord[1] + 0.15];
            }
          }
        } else {
          // Ultimate fallback: spread days across a general area
          const baseCoord: [number, number] = [20.0, 40.0]; // Mediterranean center
          const spread = (day.day - 1) * 0.5;
          startCoord = [baseCoord[0] + spread, baseCoord[1] + spread * 0.3];
          endCoord = [startCoord[0] + 0.3, startCoord[1] + 0.15];
        }
        
        const baseCoords: [number, number][] = [startCoord, endCoord];
        geometry = {
          type: "LineString" as const,
          coordinates: baseCoords,
        };
        geometrySource = "locality-fallback";
        
        console.log(`[TRIP_DISPLAY_ROUTE_${day.day}] Generated locality-based geometry:`, {
          startCoord,
          endCoord,
          startLocality: day.startLocality,
          endLocality: day.endLocality,
        });
      }

      const route = {
        dayNumber: day.day,
        geometry,
        distanceKm: day.distanceKm,
        elevationGainM: day.elevationM, // Legacy field for backward compatibility
        ascentM: day.elevationM, // Approximate for now
        descentM: day.elevationM * 0.8, // Approximate for now
        segmentNames: day.segments?.map((s: TripSegment) => s.name ?? 'Unknown Segment') ?? [],
      };

      console.log(`[TRIP_DISPLAY_ROUTE_${day.day}]`, {
        dayNumber: day.day,
        distanceKm: day.distanceKm,
        elevationM: day.elevationM,
        segmentCount: day.segments?.length ?? 0,
        coordinateCount: geometry.coordinates.length,
        geometrySource,
        hasStoredGeometry: !!day.geometry,
      });

      return route;
    });

    // Extract start coordinate from first route for map centering
    const startCoordinate = routes[0]?.geometry.coordinates[0];

    const convertedTrip: Trip = {
      routes,
      totalDistanceKm: trip.totalDistanceKm,
      totalElevationGainM: trip.totalElevationM, // Legacy field for backward compatibility
      totalAscentM: trip.totalElevationM, // Approximate for now
      totalDescentM: trip.totalElevationM * 0.8, // Approximate for now
      startCoordinate,
    };

    console.log("[TRIP_DISPLAY_CONVERT_SUCCESS]", {
      slug,
      routeCount: routes.length,
      startCoordinate,
      totalDistance: Math.round(convertedTrip.totalDistanceKm),
      totalElevation: Math.round(convertedTrip.totalElevationGainM),
    });

    return convertedTrip;
  }, [trip, slug]);

  // Handle GPX download
  const handleDownloadGPX = async () => {
    if (!trip?.days || !Array.isArray(trip.days)) return;

    try {
      console.log("[TRIP_DISPLAY_GPX_START]", {
        slug,
        dayCount: trip.days.length,
        timestamp: new Date().toISOString(),
      });

      // Convert trip data to GPX format
      const routesForGPX: RouteForGPX[] = trip.days.map((day: TripDay) => {
        // Use stored route geometry if available, otherwise create fallback
        let geometry;
        
        if (day.geometry?.coordinates && day.geometry.coordinates.length > 0) {
          // Use the actual stored route geometry
          geometry = day.geometry;
        } else {
          // Fallback: use locality names to generate approximate coordinates for older trips
          console.warn(`[TRIP_GPX_ROUTE_${day.day}] No stored geometry found, using locality-based fallback`);
          
          // Try to generate realistic coordinates based on locality names
          let startCoord: [number, number];
          let endCoord: [number, number];
          
          // Try to generate approximate coordinates based on locality names
          if (day.startLocality && day.endLocality) {
            console.log(`[TRIP_GPX_ROUTE_${day.day}] Using localities: ${day.startLocality} -> ${day.endLocality}`);
            
            // Known locality coordinates for various regions
            const knownLocalities: Record<string, [number, number]> = {
              // Cyprus
              "ayios tykhonas": [33.0167, 34.6667],
              "lofou": [32.9000, 34.8500],
              "geroskipou": [32.4500, 34.7667],
              "limassol": [33.0333, 34.6833],
              "paphos": [32.4167, 34.7667],
              "nicosia": [33.3667, 35.1667],
              "larnaca": [33.6167, 34.9000],
              // Common European locations
              "london": [-0.1276, 51.5074],
              "paris": [2.3522, 48.8566],
              "rome": [12.4964, 41.9028],
              "madrid": [-3.7038, 40.4168],
              "berlin": [13.4050, 52.5200],
              "amsterdam": [4.9041, 52.3676],
              // Add more as needed
            };
            
            const startKey = day.startLocality.toLowerCase();
            const endKey = day.endLocality.toLowerCase();
            
            // Look up known coordinates
            const foundStartCoord = knownLocalities[startKey];
            const foundEndCoord = knownLocalities[endKey];
            
            // If we have known coordinates, use them; otherwise generate fallback
            if (foundStartCoord && foundEndCoord) {
              startCoord = foundStartCoord;
              endCoord = foundEndCoord;
            } else {
              // Generate spread-out fallback based on any known location or default
              const baseCoord = foundStartCoord ?? foundEndCoord ?? [20.0, 40.0]; // Mediterranean center
              const spread = (day.day - 1) * 0.5; // Spread days further apart
              
              if (foundStartCoord) {
                startCoord = foundStartCoord;
              } else {
                startCoord = [baseCoord[0] + spread, baseCoord[1] + spread * 0.3];
              }
              
              if (foundEndCoord) {
                endCoord = foundEndCoord;
              } else {
                endCoord = [startCoord[0] + 0.3, startCoord[1] + 0.15];
              }
            }
          } else {
            // Ultimate fallback: spread days across a general area
            const baseCoord: [number, number] = [20.0, 40.0]; // Mediterranean center
            const spread = (day.day - 1) * 0.5;
            startCoord = [baseCoord[0] + spread, baseCoord[1] + spread * 0.3];
            endCoord = [startCoord[0] + 0.3, startCoord[1] + 0.15];
          }
          
          geometry = {
            type: "LineString" as const,
            coordinates: [startCoord, endCoord],
          };
          
          console.log(`[TRIP_GPX_ROUTE_${day.day}] Generated locality-based GPX geometry:`, {
            startCoord,
            endCoord,
            startLocality: day.startLocality,
            endLocality: day.endLocality,
          });
        }

        return {
          dayNumber: day.day,
          geometry,
          distanceKm: day.distanceKm,
          elevationGainM: day.elevationM, // Legacy field
          ascentM: day.elevationM, // Approximate
          descentM: day.elevationM * 0.8, // Approximate
          segmentNames: day.segments?.map((s: TripSegment) => s.name ?? 'Unknown Segment') ?? [],
          startLocality: day.startLocality,
          endLocality: day.endLocality,
          dayName: day.dayName ?? `Day ${day.day}`,
        };
      });

      const tripStartDate = new Date(trip.startDate);
      await downloadRoutesAsZip(routesForGPX, tripStartDate);

      console.log("[TRIP_DISPLAY_GPX_SUCCESS]", {
        slug,
        routeCount: routesForGPX.length,
        startDate: tripStartDate.toISOString(),
      });

      toast({
        title: "📁 Download Started!",
        description: `Downloading ${routesForGPX.length} daily routes as GPX files`,
        variant: "default",
      });
    } catch (error) {
      console.error('[TRIP_DISPLAY_GPX_ERROR]', { slug, error });
      toast({
        title: "❌ Download Failed",
        description: "Failed to generate GPX files",
        variant: "destructive",
      });
    }
  };

  // Handle share link copy
  const handleCopyShareLink = () => {
    const currentUrl = window.location.href;
    void navigator.clipboard.writeText(currentUrl).then(() => {
      console.log("[TRIP_DISPLAY_SHARE_SUCCESS]", { slug, url: currentUrl });
      toast({
        title: "🔗 Link copied!",
        description: "Trip share link copied to clipboard",
        variant: "default",
      });
    }).catch((error) => {
      console.error("[TRIP_DISPLAY_SHARE_ERROR]", { slug, error });
      toast({
        title: "❌ Copy Failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive",
      });
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600 mx-auto"></div>
          <p className="text-gray-600">Loading trip...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !trip) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mb-4 text-6xl text-gray-400">🗺️</div>
          <h1 className="mb-2 text-2xl font-semibold text-gray-900">Trip Not Found</h1>
          <p className="text-gray-600 mb-6">
            The trip you&apos;re looking for doesn&apos;t exist or has been removed.
          </p>
          <a 
            href="/explore" 
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            <MapPin className="h-4 w-4" />
            Explore Segments
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-96 overflow-y-auto border-r bg-white">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              🚴‍♀️ Cycling Trip
            </h1>
            <p className="text-sm text-gray-600">
              {Array.isArray(trip.days) ? trip.days.length : 0}-day cycling adventure
            </p>
          </div>

          {/* Trip summary */}
          <div className="rounded-lg border bg-gradient-to-br from-green-50 to-blue-50 p-4">
            <h2 className="mb-3 text-lg font-medium text-gray-900">Trip Summary</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-blue-600" />
                <span className="font-medium">{Array.isArray(trip.days) ? trip.days.length : 0} days</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-green-600" />
                <span className="font-medium">{Math.round(trip.totalDistanceKm)} km</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mountain className="h-4 w-4 text-orange-600" />
                <span className="font-medium">{Math.round(trip.totalElevationM)} m</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-purple-600" />
                <span className="font-medium">
                  {new Date(trip.startDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => void handleDownloadGPX()}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  <Download className="h-4 w-4" />
                  Download GPX
                </button>
                <button
                  onClick={handleCopyShareLink}
                  className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                  title="Copy share link"
                >
                  <Share2 className="h-4 w-4" />
                  Share
                </button>
              </div>
            </div>
          </div>

          {/* Creator info */}
          {trip.creator && (
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <User className="h-4 w-4" />
                <span>Created by <strong>{trip.creator.name}</strong></span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {new Date(trip.createdAt).toLocaleDateString()}
              </p>
            </div>
          )}

          {/* Daily breakdown */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-900">Daily Routes</h3>
            
            {Array.isArray(trip.days) && trip.days.map((day: TripDay) => {
              const dayColor = getDayColor(day.day);
              const colorClass = `${dayColor.borderClass} ${dayColor.bgClass}`;
              
              return (
                <div
                  key={day.day}
                  className={`rounded-lg border p-4 ${colorClass}`}
                >
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="h-3 w-3 rounded-full border border-gray-300"
                        style={{ backgroundColor: dayColor.hex }}
                      />
                      <h4 className="text-sm font-medium text-gray-900">
                        {day.dayName ?? `Day ${day.day}`}
                      </h4>
                    </div>
                    <span className="text-xs text-gray-500">
                      {day.segmentCount ?? 0} segments
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600 mb-2">
                    <span className="flex items-center gap-1 font-medium">
                      📏 <span className={`${dayColor.textClass} font-semibold`}>
                        {Math.round(day.distanceKm)} km
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-orange-600">
                      ⬆️ {Math.round(day.elevationM)} m
                    </span>
                    <span className="flex items-center gap-1 text-purple-600">
                      ⏱️ {(day.durationHours ?? 0).toFixed(1)}h
                    </span>
                  </div>

                  <div className="text-xs text-gray-600">
                    <span className="font-medium">{day.startLocality}</span>
                    {day.startLocality !== day.endLocality && (
                      <span> → <span className="font-medium">{day.endLocality}</span></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {/* Route visibility toggle */}
        <div className="absolute top-4 right-4 z-10">
          <button
            onClick={() => setRoutesVisible(!routesVisible)}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              routesVisible
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-white text-gray-700 hover:bg-gray-50 border border-gray-300"
            }`}
          >
            {routesVisible ? "Hide Routes" : "Show Routes"}
          </button>
        </div>

        {/* Reusable Trip Map Display Component */}
        <TripMapDisplay
          trip={mapTrip}
          routesVisible={routesVisible}
          mapError={mapError}
          onMapError={setMapError}
          className="w-full h-full bg-gray-200"
          initialCenter={[0, 0]} // Will be overridden by automatic route centering
          initialZoom={2} // Low zoom as fallback, will be overridden by fitBounds
          showCoordinates={false}
        />
      </div>
    </div>
  );
} 