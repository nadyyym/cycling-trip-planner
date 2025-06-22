"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { getDayColorHex } from "~/lib/mapUtils";
import type { Trip } from "../_hooks/useTripRouteStore";

// Dynamic import type for mapbox-gl
type MapboxGL = typeof import("mapbox-gl");

/**
 * Helper function to update or create a GeoJSON source
 */
function updateOrCreateSource(
  map: any,
  sourceId: string,
  data: GeoJSON.Feature | GeoJSON.FeatureCollection
) {
  const existingSource = map.getSource(sourceId);
  if (existingSource) {
    // Update existing source data
    existingSource.setData(data);
  } else {
    // Create new source
    map.addSource(sourceId, {
      type: "geojson",
      data,
    });
  }
}

/**
 * Helper function to remove all trip route layers and sources dynamically
 */
function removeAllTripRouteLayers(map: any) {
  const style = map.getStyle();
  if (!style?.sources) return;

  // Get all source IDs that match trip route patterns
  const tripSourceIds = Object.keys(style.sources).filter(id => 
    id.startsWith('trip-route-day-') || 
    id === 'trip-start-marker-source'
  );

  // Remove associated layers first
  tripSourceIds.forEach(sourceId => {
    const layerId = sourceId.replace('-source', '');
    const startLayerId = `${layerId}-start`;
    const endLayerId = `${layerId}-end`;
    
    [layerId, startLayerId, endLayerId, 'trip-start-marker'].forEach(id => {
      if (map.getLayer(id)) {
        map.removeLayer(id);
      }
    });
  });

  // Then remove sources
  tripSourceIds.forEach(sourceId => {
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }
  });
}

export interface TripMapDisplayProps {
  /** Trip data to display on the map */
  trip: Trip | null;
  /** Whether routes should be visible */
  routesVisible?: boolean;
  /** Optional map error message */
  mapError?: string | null;
  /** Callback when map error occurs */
  onMapError?: (error: string) => void;
  /** Additional CSS classes for the map container */
  className?: string;
  /** Initial map center coordinates [lng, lat] */
  initialCenter?: [number, number];
  /** Initial map zoom level */
  initialZoom?: number;
  /** Whether to show map coordinates display */
  showCoordinates?: boolean;
}

/**
 * Reusable map component for displaying cycling trip routes
 * Extracted from new-trip page to ensure consistency across trip display pages
 */
export function TripMapDisplay({
  trip,
  routesVisible = true,
  mapError,
  onMapError,
  className = "h-full w-full",
  initialCenter = [-0.1276, 51.5074], // London coordinates as fallback
  initialZoom = 10,
  showCoordinates = false,
}: TripMapDisplayProps) {
  // Map-related refs and state
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const mapInitialized = useRef(false);
  const [lng, setLng] = useState(initialCenter[0]);
  const [lat, setLat] = useState(initialCenter[1]);
  const [zoom, setZoom] = useState(initialZoom);

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

  // Initialize map with dynamic import
  useEffect(() => {
    // Prevent multiple map initializations
    if (mapInitialized.current || !mapContainer.current) return;

    if (process.env.NODE_ENV !== "production") {
      console.log("[TRIP_MAP_DISPLAY] Initializing map with coordinates:", { lng, lat, zoom });
    }

    // Dynamic import of mapbox-gl
    const initializeMap = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;

        // Initialize Mapbox token
        const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        if (token && !mapboxgl.accessToken) {
          mapboxgl.accessToken = token;
        }

        if (!token) {
          if (process.env.NODE_ENV !== "production") {
            console.error("[TRIP_MAP_DISPLAY] Mapbox access token is missing");
          }
          onMapError?.("Map configuration error. Please check environment variables.");
          return;
        }

        mapInitialized.current = true;
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [lng, lat],
          zoom: zoom,
        });

        if (process.env.NODE_ENV !== "production") {
          console.log("[TRIP_MAP_DISPLAY] Map created successfully");
        }

        // Wait for map to load before setting up event listeners
        map.current.on("load", () => {
          if (process.env.NODE_ENV !== "production") {
            console.log("[TRIP_MAP_DISPLAY] Map loaded successfully");
          }

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

        map.current.on("error", (e: any) => {
          console.error("[TRIP_MAP_DISPLAY] Map error:", e);
          onMapError?.("Failed to load map. Please check your internet connection.");
        });

      } catch (error) {
        console.error("[TRIP_MAP_DISPLAY] Failed to initialize map:", error);
        onMapError?.("Failed to initialize map. Please check your internet connection.");
        mapInitialized.current = false; // Reset on error
      }
    };

    void initializeMap();

    // Cleanup function
    return () => {
      if (map.current) {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log("[TRIP_MAP_DISPLAY] Cleaning up map");
          }
          // Check if map is still loaded before attempting to remove
          if (map.current.isStyleLoaded && map.current.isStyleLoaded()) {
            map.current.remove();
          } else {
            // If style isn't loaded, force remove without waiting
            map.current.getCanvas()?.remove();
          }
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[TRIP_MAP_DISPLAY] Error removing map (this is usually harmless during development):", error);
          }
        } finally {
          map.current = null;
          mapInitialized.current = false;
        }
      }
    };
  }, []); // Remove dependencies to prevent unnecessary re-initializations

  // Display trip routes on map
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[TRIP_MAP_DISPLAY] Map not ready yet for route display");
      }
      return;
    }

    if (process.env.NODE_ENV !== "production") {
      console.log("[TRIP_MAP_DISPLAY] Updating routes", {
        hasTrip: !!trip,
        routesVisible,
        routeCount: trip?.routes.length ?? 0,
      });
    }

    // Remove existing trip route layers and sources
    try {
      removeAllTripRouteLayers(map.current!);
    } catch (error) {
      console.warn("[TRIP_MAP_DISPLAY] Error removing existing trip route layers:", error);
    }

    // Add new trip routes if available and visible
    if (trip && routesVisible && trip.routes.length > 0) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[TRIP_MAP_DISPLAY] Displaying routes", {
          routeCount: trip.routes.length,
          totalDistance: Math.round(trip.totalDistanceKm),
          startCoordinate: trip.startCoordinate,
          routes: trip.routes.map(r => ({
            day: r.dayNumber,
            coordCount: r.geometry.coordinates.length,
            distanceKm: Math.round(r.distanceKm),
          })),
          timestamp: new Date().toISOString(),
        });
      }

      // Load mapbox-gl for bounds calculation
      const addRoutesToMap = async () => {
        try {
          const mapboxgl = (await import("mapbox-gl")).default;

          // Add route lines and markers for each day
          trip.routes.forEach((route) => {
            try {
              const color = getDayColorHex(route.dayNumber);
              const routeSourceId = `trip-route-day-${route.dayNumber}-source`;
              const routeLayerId = `trip-route-day-${route.dayNumber}`;

              if (process.env.NODE_ENV !== "production") {
                console.log(`[TRIP_MAP_DISPLAY_ROUTE_${route.dayNumber}] Adding route`, {
                  coordinates: route.geometry?.coordinates?.length || 0,
                  color,
                  startCoord: route.geometry?.coordinates?.[0],
                  endCoord: route.geometry?.coordinates?.[route.geometry?.coordinates?.length - 1],
                });
              }

              // Validate route geometry
              if (!route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
                if (process.env.NODE_ENV !== "production") {
                  console.warn(`[TRIP_MAP_DISPLAY_ROUTE_${route.dayNumber}] Invalid geometry, skipping route`);
                }
                return;
              }

              // Add route source
              updateOrCreateSource(map.current!, routeSourceId, {
                type: "Feature",
                properties: {
                  dayNumber: route.dayNumber,
                  distanceKm: route.distanceKm,
                  elevationGainM: route.elevationGainM,
                  segmentNames: JSON.stringify(route.segmentNames || []),
                },
                geometry: route.geometry,
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

                updateOrCreateSource(map.current!, startSourceId, {
                  type: "Feature",
                  properties: { dayNumber: route.dayNumber, type: "start" },
                  geometry: {
                    type: "Point",
                    coordinates: startCoord,
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

                updateOrCreateSource(map.current!, endSourceId, {
                  type: "Feature",
                  properties: { dayNumber: route.dayNumber, type: "end" },
                  geometry: {
                    type: "Point",
                    coordinates: endCoord,
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
              map.current!.on("mouseenter", routeLayerId, (e: any) => {
                if (!e.features?.[0]) return;

                const feature = e.features[0];
                const properties = feature.properties;
                if (!properties) return;

                map.current!.getCanvas().style.cursor = "pointer";

                // Safe parsing of segment names with fallback
                let segmentNames: string[] = [];
                try {
                  if (properties.segmentNames) {
                    const parsed: unknown = JSON.parse(properties.segmentNames as string);
                    if (Array.isArray(parsed) && parsed.every((item: unknown): item is string => typeof item === 'string')) {
                      segmentNames = parsed;
                    }
                  }
                } catch (error) {
                  if (process.env.NODE_ENV !== "production") {
                    console.warn("[TRIP_MAP_DISPLAY] Failed to parse segment names:", error);
                  }
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
              map.current!.on("mousemove", routeLayerId, (e: any) => {
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
              console.error(`[TRIP_MAP_DISPLAY_ROUTE_${route.dayNumber}] Error adding route:`, error);
            }
          });

          // Fit map to show all routes
          if (trip.routes.length > 0) {
            const allCoordinates = trip.routes.flatMap(route => route.geometry.coordinates);
            if (allCoordinates.length > 0) {
              const bounds = new mapboxgl.LngLatBounds();
              allCoordinates.forEach(coord => bounds.extend(coord));
              
              map.current.fitBounds(bounds, {
                padding: 50,
                maxZoom: 14,
              });
            }
          }

          if (process.env.NODE_ENV !== "production") {
            console.log(`[TRIP_MAP_DISPLAY] Successfully added ${trip.routes.length} routes to map`);
          }
        } catch (error) {
          console.error("[TRIP_MAP_DISPLAY] Error adding trip routes to map:", error);
        }
      };

      void addRoutesToMap();
    } else {
      if (process.env.NODE_ENV !== "production") {
        console.log("[TRIP_MAP_DISPLAY] No routes to display", {
          hasTrip: !!trip,
          routesVisible,
          routeCount: trip?.routes.length ?? 0,
        });
      }
    }
  }, [trip, routesVisible]);

  return (
    <div className="relative w-full h-full">
      {/* Map error display */}
      {mapError && (
        <div className="absolute inset-x-4 top-4 z-10 rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-800">{mapError}</div>
        </div>
      )}

      {/* Map container */}
      <div ref={mapContainer} className={className} />

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
      {showCoordinates && (
        <div className="absolute bottom-4 left-4 rounded-md bg-white/90 px-3 py-2 text-xs text-gray-600 backdrop-blur-sm">
          Lng: {lng} | Lat: {lat} | Zoom: {zoom}
        </div>
      )}
    </div>
  );
} 