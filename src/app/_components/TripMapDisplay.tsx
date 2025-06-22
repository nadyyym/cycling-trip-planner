"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getDayColorHex } from "~/lib/mapUtils";
import type { Trip } from "../_hooks/useTripRouteStore";

// Mapbox access token setup
const initializeMapboxToken = () => {
  const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  if (token && !mapboxgl.accessToken) {
    mapboxgl.accessToken = token;
  }
  return token;
};

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
  const map = useRef<mapboxgl.Map | null>(null);
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

  // Initialize map
  useEffect(() => {
    // Prevent multiple map initializations
    if (mapInitialized.current || !mapContainer.current) return;

    console.log("[TRIP_MAP_DISPLAY] Initializing map with coordinates:", { lng, lat, zoom });

    // Initialize Mapbox token
    const mapboxToken = initializeMapboxToken();
    if (!mapboxToken) {
      console.error("[TRIP_MAP_DISPLAY] Mapbox access token is missing");
      onMapError?.("Map configuration error. Please check environment variables.");
      return;
    }

    try {
      mapInitialized.current = true;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: zoom,
      });

      console.log("[TRIP_MAP_DISPLAY] Map created successfully");

      // Wait for map to load before setting up event listeners
      map.current.on("load", () => {
        console.log("[TRIP_MAP_DISPLAY] Map loaded successfully");

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

      map.current.on("error", (e) => {
        console.error("[TRIP_MAP_DISPLAY] Map error:", e);
        onMapError?.("Failed to load map. Please check your internet connection.");
      });

    } catch (error) {
      console.error("[TRIP_MAP_DISPLAY] Failed to initialize map:", error);
      onMapError?.("Failed to initialize map. Please check your internet connection.");
      mapInitialized.current = false; // Reset on error
    }

    // Cleanup function
    return () => {
      if (map.current) {
        try {
          console.log("[TRIP_MAP_DISPLAY] Cleaning up map");
          // Check if map is still loaded before attempting to remove
          if (map.current.isStyleLoaded && map.current.isStyleLoaded()) {
            map.current.remove();
          } else {
            // If style isn't loaded, force remove without waiting
            map.current.getCanvas()?.remove();
          }
        } catch (error) {
          console.warn("[TRIP_MAP_DISPLAY] Error removing map (this is usually harmless during development):", error);
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
      console.log("[TRIP_MAP_DISPLAY] Map not ready yet for route display");
      return;
    }

    console.log("[TRIP_MAP_DISPLAY] Updating routes", {
      hasTrip: !!trip,
      routesVisible,
      routeCount: trip?.routes.length ?? 0,
    });

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
      console.warn("[TRIP_MAP_DISPLAY] Error removing existing trip route layers:", error);
    }

    // Add new trip routes if available and visible
    if (trip && routesVisible && trip.routes.length > 0) {
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

      try {
        // Add route lines and markers for each day
        trip.routes.forEach((route) => {
          try {
            const color = getDayColorHex(route.dayNumber);
            const routeSourceId = `trip-route-day-${route.dayNumber}-source`;
            const routeLayerId = `trip-route-day-${route.dayNumber}`;

            console.log(`[TRIP_MAP_DISPLAY_ROUTE_${route.dayNumber}] Adding route`, {
              coordinates: route.geometry?.coordinates?.length || 0,
              color,
              startCoord: route.geometry?.coordinates?.[0],
              endCoord: route.geometry?.coordinates?.[route.geometry?.coordinates?.length - 1],
            });

            // Validate route geometry
            if (!route.geometry || !route.geometry.coordinates || route.geometry.coordinates.length === 0) {
              console.warn(`[TRIP_MAP_DISPLAY_ROUTE_${route.dayNumber}] Invalid geometry, skipping route`);
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
                if (properties.segmentNames) {
                  const parsed: unknown = JSON.parse(properties.segmentNames as string);
                  if (Array.isArray(parsed) && parsed.every((item: unknown): item is string => typeof item === 'string')) {
                    segmentNames = parsed;
                  }
                }
              } catch (error) {
                console.warn("[TRIP_MAP_DISPLAY] Failed to parse segment names:", error);
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

        console.log(`[TRIP_MAP_DISPLAY] Successfully added ${trip.routes.length} routes to map`);
      } catch (error) {
        console.error("[TRIP_MAP_DISPLAY] Error adding trip routes to map:", error);
      }
    } else {
      console.log("[TRIP_MAP_DISPLAY] No routes to display", {
        hasTrip: !!trip,
        routesVisible,
        routeCount: trip?.routes.length ?? 0,
      });
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