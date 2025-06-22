"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "~/env";
import { RouteListSidebar } from "../_components/RouteListSidebar";
import { useTripRouteStore } from "../_hooks/useTripRouteStore";
import { useTripPlanner } from "../_hooks/useTripPlanner";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { getDayColorsArray, getDayColorHex } from "~/lib/mapUtils";

// Mapbox access token
mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export default function NewTripPage() {
  // Map-related state
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [lng, setLng] = useState(-0.1276); // London coordinates as fallback
  const [lat, setLat] = useState(51.5074);
  const [zoom, setZoom] = useState(10);
  const [mapError, setMapError] = useState<string | null>(null);

  // URL params and routing
  const searchParams = useSearchParams();
  
  // Get segment IDs from URL parameters
  const segmentIds = searchParams.get('segments')?.split(',').filter(Boolean) ?? [];
  
  // Trip route store for displaying planned routes
  const { currentTrip, routesVisible } = useTripRouteStore();
  
  // Trip planner hook for planning the trip
  const {
    isPending,
    isError,
    isSuccess,
    error,
    data,
    planTrip,
    reset,
  } = useTripPlanner();

  // Map tooltip state for route hover
  const [mapTooltip, setMapTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    route: {
      dayNumber: number;
      distanceKm: number;
      elevationGainM: number;
      segmentNames: string[];
    } | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    route: null,
  });

  // Initialize map
  useEffect(() => {
    // Prevent multiple map initializations
    if (mapInitialized.current || !mapContainer.current) return;

    console.log("Initializing new-trip map with coordinates:", { lng, lat, zoom });

    try {
      mapInitialized.current = true;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: zoom,
      });

      console.log("New-trip map created successfully");

      // Wait for map to load before setting up event listeners
      map.current.on("load", () => {
        console.log("New-trip map loaded successfully");

        // Update state when map moves
        let moveTimeout: NodeJS.Timeout;
        map.current!.on("move", () => {
          if (!map.current) return;

          // Clear previous timeout to debounce updates
          clearTimeout(moveTimeout);
          moveTimeout = setTimeout(() => {
            if (map.current) {
              const center = map.current.getCenter();
              const currentZoom = map.current.getZoom();

              setLng(Number(center.lng.toFixed(4)));
              setLat(Number(center.lat.toFixed(4)));
              setZoom(Number(currentZoom.toFixed(2)));
            }
          }, 100); // Debounce updates by 100ms
        });
      });
    } catch (error) {
      console.error("Failed to initialize new-trip map:", error);
      setMapError(
        "Failed to initialize map. Please check your internet connection.",
      );
    }

    // Cleanup function
    return () => {
      if (map.current) {
        try {
          console.log("Cleaning up new-trip map");
          // Check if map is still loaded before attempting to remove
          if (map.current.isStyleLoaded && map.current.isStyleLoaded()) {
            map.current.remove();
          } else {
            // If style isn't loaded, force remove without waiting
            map.current.getCanvas()?.remove();
          }
        } catch (error) {
          console.warn("Error removing new-trip map (this is usually harmless during development):", error);
        } finally {
          map.current = null;
          mapInitialized.current = false;
        }
      }
    };
  }, []); // Remove lng, lat, zoom dependencies to prevent unnecessary re-initializations

  // Trigger planning when page loads with segment IDs
  useEffect(() => {
    if (segmentIds.length > 0 && !isPending && !isSuccess && !isError && !currentTrip) {
      console.log("[NEW_TRIP_AUTO_START]", {
        segmentCount: segmentIds.length,
        segmentIds: segmentIds,
        timestamp: new Date().toISOString(),
      });

      planTrip({ segmentIds });
    }
  }, [segmentIds, isPending, isSuccess, isError, currentTrip, planTrip]);

  // Update trip route store when planning succeeds and center map
  useEffect(() => {
    if (isSuccess && data?.ok) {
      console.log("[NEW_TRIP_SUCCESS]", {
        routeCount: data.routes.length,
        totalDistance: Math.round(data.totalDistanceKm),
        timestamp: new Date().toISOString(),
      });

      // Convert API response to trip route store format
      const tripRoutes = data.routes.map((route) => ({
        dayNumber: route.dayNumber,
        geometry: route.geometry,
        distanceKm: route.distanceKm,
        elevationGainM: route.elevationGainM,
        segmentNames: route.segments.map((segment) => segment.name),
      }));

      // Extract start coordinate from first route for map centering
      const startCoordinate = tripRoutes[0]?.geometry.coordinates[0];

      const trip = {
        routes: tripRoutes,
        totalDistanceKm: data.totalDistanceKm,
        totalElevationGainM: data.totalElevationGainM,
        startCoordinate,
      };

      // Update the trip route store to trigger map visualization
      const { setTrip } = useTripRouteStore.getState();
      setTrip(trip);

      // Note: Map centering will be handled by the route display effect with fitBounds
    }
  }, [isSuccess, data]);

  // Display trip routes on map
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) {
      console.log("[NEW_TRIP_ROUTES] Map not ready yet");
      return;
    }

    console.log("[NEW_TRIP_ROUTES] Updating routes", {
      hasCurrentTrip: !!currentTrip,
      routesVisible,
      routeCount: currentTrip?.routes.length ?? 0,
    });

    // Define colors for different days using centralized colors
    const dayColors = getDayColorsArray(); // ["#6366f1", "#10b981", "#f97316", "#ec4899"]

    // Remove existing trip route layers and sources
    try {
      // Remove route layers
      for (let i = 1; i <= 4; i++) {
        const routeLayerId = `trip-route-day-${i}`;
        const routeSourceId = `trip-route-day-${i}-source`;
        const startLayerId = `trip-route-day-${i}-start`;
        const startSourceId = `trip-route-day-${i}-start-source`;
        const endLayerId = `trip-route-day-${i}-end`;
        const endSourceId = `trip-route-day-${i}-end-source`;
        
        // Remove layers first
        [routeLayerId, startLayerId, endLayerId].forEach(layerId => {
          if (map.current!.getLayer(layerId)) {
            map.current!.removeLayer(layerId);
          }
        });
        
        // Then remove sources
        [routeSourceId, startSourceId, endSourceId].forEach(sourceId => {
          if (map.current!.getSource(sourceId)) {
            map.current!.removeSource(sourceId);
          }
        });
      }

      // Remove trip start marker if it exists
      if (map.current.getLayer("trip-start-marker")) {
        map.current.removeLayer("trip-start-marker");
      }
      if (map.current.getSource("trip-start-marker-source")) {
        map.current.removeSource("trip-start-marker-source");
      }
    } catch (error) {
      console.warn("Error removing existing trip route layers:", error);
    }

    // Add new trip routes if available and visible
    if (currentTrip && routesVisible && currentTrip.routes.length > 0) {
      console.log("[NEW_TRIP_ROUTES_DISPLAY]", {
        routeCount: currentTrip.routes.length,
        totalDistance: Math.round(currentTrip.totalDistanceKm),
        startCoordinate: currentTrip.startCoordinate,
        routes: currentTrip.routes.map(r => ({
          day: r.dayNumber,
          coordCount: r.geometry.coordinates.length,
          distanceKm: Math.round(r.distanceKm),
        })),
        timestamp: new Date().toISOString(),
      });

      try {
        // Add route lines and markers for each day
        currentTrip.routes.forEach((route, index) => {
          try {
            const color = getDayColorHex(route.dayNumber);
            const routeSourceId = `trip-route-day-${route.dayNumber}-source`;
            const routeLayerId = `trip-route-day-${route.dayNumber}`;

            console.log(`[ROUTE_${route.dayNumber}] Adding route`, {
              coordinates: route.geometry?.coordinates?.length || 0,
              color,
              startCoord: route.geometry?.coordinates?.[0],
              endCoord: route.geometry?.coordinates?.[route.geometry?.coordinates?.length - 1],
            });

            // Validate route geometry
            if (!route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
              console.warn(`[ROUTE_${route.dayNumber}] Invalid geometry, skipping route`);
              return;
            }

            // Add route source
            map.current!.addSource(routeSourceId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: {
                  dayNumber: route.dayNumber,
                  distanceKm: route.distanceKm,
                  elevationGainM: route.elevationGainM,
                  segmentNames: JSON.stringify(route.segmentNames || []),
                },
                geometry: route.geometry,
              },
            });

          // Add route layer
          map.current!.addLayer({
            id: routeLayerId,
            type: "line",
            source: routeSourceId,
            layout: {
              "line-join": "round",
              "line-cap": "round",
            },
            paint: {
              "line-color": color,
              "line-width": 6,
              "line-opacity": 0.8,
            },
          });

          // Add start marker for this route
          const startCoord = route.geometry.coordinates[0];
          const endCoord = route.geometry.coordinates[route.geometry.coordinates.length - 1];

          if (startCoord) {
            const startSourceId = `trip-route-day-${route.dayNumber}-start-source`;
            const startLayerId = `trip-route-day-${route.dayNumber}-start`;

            map.current!.addSource(startSourceId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: { dayNumber: route.dayNumber, type: "start" },
                geometry: {
                  type: "Point",
                  coordinates: startCoord,
                },
              },
            });

            map.current!.addLayer({
              id: startLayerId,
              type: "circle",
              source: startSourceId,
              paint: {
                "circle-radius": 8,
                "circle-color": "#ffffff",
                "circle-stroke-color": color,
                "circle-stroke-width": 3,
              },
            });
          }

          // Add end marker for this route
          if (endCoord && endCoord !== startCoord) {
            const endSourceId = `trip-route-day-${route.dayNumber}-end-source`;
            const endLayerId = `trip-route-day-${route.dayNumber}-end`;

            map.current!.addSource(endSourceId, {
              type: "geojson",
              data: {
                type: "Feature",
                properties: { dayNumber: route.dayNumber, type: "end" },
                geometry: {
                  type: "Point",
                  coordinates: endCoord,
                },
              },
            });

            map.current!.addLayer({
              id: endLayerId,
              type: "circle",
              source: endSourceId,
              paint: {
                "circle-radius": 6,
                "circle-color": color,
                "circle-stroke-color": "#ffffff",
                "circle-stroke-width": 2,
              },
            });
          }

          // Add hover events for map tooltips
          map.current!.on("mouseenter", routeLayerId, (e) => {
            if (!e.features?.[0]) return;

            const feature = e.features[0];
            const properties = feature.properties;
            if (!properties) return;

            map.current!.getCanvas().style.cursor = "pointer";

            // Safe parsing of segment names with fallback
            let segmentNames: string[] = [];
            try {
              segmentNames = properties.segmentNames ? JSON.parse(properties.segmentNames as string) : [];
            } catch (error) {
              console.warn("Failed to parse segment names:", error);
              segmentNames = [];
            }

            setMapTooltip({
              visible: true,
              x: e.point.x,
              y: e.point.y,
              route: {
                dayNumber: Number(properties.dayNumber ?? 0),
                distanceKm: Number(properties.distanceKm ?? 0),
                elevationGainM: Number(properties.elevationGainM ?? 0),
                segmentNames,
              },
            });
          });

          // Update tooltip position on mouse move
          map.current!.on("mousemove", routeLayerId, (e) => {
            setMapTooltip((prev) => ({
              ...prev,
              x: e.point.x,
              y: e.point.y,
            }));
          });

          // Hide tooltip on mouse leave
          map.current!.on("mouseleave", routeLayerId, () => {
            map.current!.getCanvas().style.cursor = "";
            setMapTooltip({
              visible: false,
              x: 0,
              y: 0,
              route: null,
            });
          });
          
          } catch (error) {
            console.error(`[ROUTE_${route.dayNumber}] Error adding route:`, error);
          }
        });

        // Fit map to show all routes
        if (currentTrip.routes.length > 0) {
          const allCoordinates = currentTrip.routes.flatMap(route => route.geometry.coordinates);
          if (allCoordinates.length > 0) {
            const bounds = new mapboxgl.LngLatBounds();
            allCoordinates.forEach(coord => bounds.extend(coord));
            
            map.current.fitBounds(bounds, {
              padding: 50,
              maxZoom: 14,
            });
          }
        }

        console.log(`[NEW_TRIP_ROUTES] Successfully added ${currentTrip.routes.length} routes to map`);
      } catch (error) {
        console.error("Error adding trip routes to map:", error);
      }
    } else {
      console.log("[NEW_TRIP_ROUTES] No routes to display", {
        hasCurrentTrip: !!currentTrip,
        routesVisible,
        routeCount: currentTrip?.routes.length ?? 0,
      });
    }
  }, [currentTrip, routesVisible]);

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

        {/* Map */}
        <div ref={mapContainer} className="h-full w-full" />

        {/* Map error */}
        {mapError && (
          <div className="absolute inset-x-4 top-4 rounded-md bg-red-50 p-4">
            <div className="text-sm text-red-800">{mapError}</div>
          </div>
        )}

        {/* Map tooltip */}
        {mapTooltip.visible && mapTooltip.route && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border bg-white p-3 shadow-lg"
            style={{
              left: mapTooltip.x + 10,
              top: mapTooltip.y - 10,
              transform: "translateY(-100%)",
            }}
          >
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <div 
                  className="h-3 w-3 rounded-full border border-gray-300"
                  style={{ backgroundColor: getDayColorHex(mapTooltip.route.dayNumber) }}
                />
                <h4 className="text-sm font-medium text-gray-900">
                  Day {mapTooltip.route.dayNumber}
                </h4>
              </div>
              <div className="space-y-1 text-xs text-gray-600">
                <div className="font-semibold text-blue-600">
                  📏 {Math.round(mapTooltip.route.distanceKm)} km
                </div>
                <div>⛰️ {Math.round(mapTooltip.route.elevationGainM)} m</div>
                <div>🎯 {mapTooltip.route.segmentNames.length} segments</div>
              </div>
            </div>
          </div>
        )}

        {/* Map coordinates display */}
        <div className="absolute bottom-4 left-4 rounded-md bg-white/90 px-3 py-2 text-xs text-gray-600 backdrop-blur-sm">
          Lng: {lng} | Lat: {lat} | Zoom: {zoom}
        </div>
      </div>
    </div>
  );
} 