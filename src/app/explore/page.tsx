"use client";

import { useEffect, useRef, useState } from "react";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "~/env";
import { SegmentListSidebar } from "../_components/SegmentListSidebar";
import { useDebouncedBounds } from "../_hooks/useDebouncedBounds";
import { useSegmentExplore } from "../_hooks/useSegmentExplore";
import { useSegmentStore } from "../_hooks/useSegmentStore";
import { useRateLimitHandler } from "../_hooks/useRateLimitHandler";
import { useTripRouteStore } from "../_hooks/useTripRouteStore";
// import { api } from "~/trpc/react"; // Unused for now
// import { segmentsToGeoJSON } from "~/lib/mapUtils"; // Unused for now
import {
  reverseGeocode,
  type LocationInfo,
} from "~/server/integrations/mapbox";
import { MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { AutocompleteInput } from "../_components/AutocompleteInput";
import { TripConstraintsControls } from "../_components/TripConstraintsControls";
import { getDayColorsArray } from "~/lib/mapUtils";
import { useRouter } from "next/navigation";
import { useTripConstraintStore } from "../_hooks/useTripConstraintStore";
import { capture } from "~/lib/posthogClient";

// Dynamic mapbox import - will be loaded when needed

interface MapboxGeocodingResponse {
  features: Array<{
    center: [number, number];
    place_name: string;
  }>;
}

interface MapboxSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
}

export default function ExplorePage() {
  // Map-related state
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const mapInitialized = useRef(false);
  
  // Use refs for map coordinates to avoid re-renders on every map move
  const lngRef = useRef(-0.1276); // London coordinates as fallback
  const latRef = useRef(51.5074);
  const zoomRef = useRef(10);
  
  // State for displaying coordinates (throttled updates) - currently unused but kept for future use
  // const [displayCoords, setDisplayCoords] = useState({
  //   lng: lngRef.current,
  //   lat: latRef.current,
  //   zoom: zoomRef.current,
  // });

  const [mapError, setMapError] = useState<string | null>(null);

  // Location-related state
  const [locationPermission, setLocationPermission] = useState<
    "granted" | "denied" | "prompt" | null
  >(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  const [currentLocationInfo, setCurrentLocationInfo] =
    useState<LocationInfo | null>(null);

  // Dialog state for location change
  const [isLocationDialogOpen, setIsLocationDialogOpen] = useState(false);

  // Search state
  const [searchValue, setSearchValue] = useState("");

  // Map bounds for segment exploration
  const [mapBounds, setMapBounds] = useState<{
    sw: [number, number];
    ne: [number, number];
  } | null>(null);

  // Map tooltip state
  const [mapTooltip, setMapTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    segment: {
      id: string;
      name: string;
      distance: number;
      averageGrade: number;
      elevationGain: number;
      ascentM: number;
      descentM: number;
    } | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    segment: null,
  });

  // Use debounced bounds for API calls
  const debouncedBounds = useDebouncedBounds(mapBounds, 1000);

  // Segment exploration hook
  const {
    segments,
    segmentsGeoJSON,
    isLoading: isLoadingSegments,
    error: segmentError,
    refetch: refetchSegments,
  } = useSegmentExplore(debouncedBounds);

  // Get saved segments (used to be "starred")
  // const { data: savedSegments = [] } =
  //   api.segment.getMySavedSegments.useQuery();

  // Get favourite count for header badge
  // const { data: favouriteCount } = api.favourite.count.useQuery(undefined, {
  //   refetchInterval: 60000, // Refresh every minute
  //   staleTime: 0, // Always consider stale for real-time updates
  // });

  // Rate limiting handler for segments
  const { isRateLimited: isSegmentRateLimited } = useRateLimitHandler();

  // Segment store for selection and highlighting
  const { highlightedSegmentId, selectedSegmentIds, highlightSegment } = useSegmentStore();

  // Router for navigation
  const router = useRouter();

  // Trip constraints store
  const { constraints } = useTripConstraintStore();

  // Trip route store for displaying planned routes
  const { currentTrip, routesVisible } = useTripRouteStore();

  // Reference to track if initial segment search has been performed
  const hasInitialSegmentSearch = useRef(false);

  // Initialize Mapbox access token - handled in dynamic import

  // Check location permission and try to get user location on mount
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((result) => {
          setLocationPermission(result.state);
          if (result.state === "granted") {
            getUserLocation();
          }
        })
        .catch(() => {
          // Fallback for browsers that don't support permissions API
          setLocationPermission("prompt");
        });
    }
  }, []);

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by this browser.");
      return;
    }

    setIsLoadingLocation(true);

    const requestUserLocation = async () => {
      try {
        const position = await new Promise<GeolocationPosition>(
          (resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000,
            });
          },
        );

        const { latitude, longitude } = position.coords;
        if (process.env.NODE_ENV !== "production") {
          console.log("Got user location:", { latitude, longitude });
        }

        // Update coordinates and zoom to user location
        lngRef.current = longitude;
        latRef.current = latitude;
        zoomRef.current = 12;

        // If map is initialized, fly to the new location
        if (map.current) {
          map.current.flyTo({
            center: [longitude, latitude],
            zoom: 12,
            essential: true,
          });
        }

        setLocationPermission("granted");

        // ==== REVERSE GEOCODING (Step 6) ====
        // Get city name from coordinates for personalized location display
        // Cache results for 1 hour to avoid excessive API calls
        // ================================================
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log("Starting reverse geocoding for user location...");
          }
          const locationInfo = await reverseGeocode([longitude, latitude]);
          setCurrentLocationInfo(locationInfo);
          if (process.env.NODE_ENV !== "production") {
            console.log(
              "Reverse geocoding successful:",
              locationInfo.displayName,
            );
          }
        } catch (error) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Reverse geocoding failed:", error);
          }
          // Keep currentLocationInfo as null for fallback behavior
        }
      } catch (error) {
        console.error("Error getting user location:", error);
        const geoError = error as GeolocationPositionError;
        setLocationPermission(geoError?.code === 1 ? "denied" : "prompt");
      } finally {
        setIsLoadingLocation(false);
      }
    };

    void requestUserLocation();
  };

  // Initialize map
  useEffect(() => {
    // Prevent multiple map initializations
    if (mapInitialized.current || !mapContainer.current) return;

    if (process.env.NODE_ENV !== "production") {
      console.log("Initializing map with coordinates:", { lng: lngRef.current, lat: latRef.current, zoom: zoomRef.current });
    }

    const initializeMap = async () => {
      try {
        const mapboxgl = (await import("mapbox-gl")).default;

        // Initialize Mapbox token
        if (env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN && !mapboxgl.accessToken) {
          mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
        }

        mapInitialized.current = true;
        map.current = new mapboxgl.Map({
          container: mapContainer.current!,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [lngRef.current, latRef.current],
          zoom: zoomRef.current,
        });

      if (process.env.NODE_ENV !== "production") {
        console.log("Map created successfully");
      }

      // Wait for map to load before setting up event listeners
      map.current.on("load", () => {
        if (process.env.NODE_ENV !== "production") {
          console.log("Map loaded successfully");
        }

        // ==== AUTOMATIC INITIAL SEGMENT SEARCH (Step 1) ====
        // This fires an initial search when the map first loads to show
        // immediate value to users. Uses a ref to ensure it only happens once.
        // =============================================
        if (!hasInitialSegmentSearch.current) {
          const initialBounds = map.current!.getBounds();

          if (initialBounds) {
            setMapBounds({
              sw: [initialBounds.getSouth(), initialBounds.getWest()],
              ne: [initialBounds.getNorth(), initialBounds.getEast()],
            });
          }

          hasInitialSegmentSearch.current = true;

          // Helpful console statement for QA instrumentation
          // (to be replaced with analytics event in the future).
          if (process.env.NODE_ENV !== "production") {
            console.log("[SEGMENT_SEARCH_AUTO]");
          }
        }

        // Update state when map moves - debounced to prevent excessive updates
        let moveTimeout: NodeJS.Timeout;
        map.current!.on("move", () => {
          if (!map.current) return;

          // Clear previous timeout to debounce updates
          clearTimeout(moveTimeout);
          moveTimeout = setTimeout(() => {
            if (map.current) {
              const center = map.current.getCenter();
              const currentZoom = map.current.getZoom();
              const currentBounds = map.current.getBounds();

               lngRef.current = Number(center.lng.toFixed(4));
               latRef.current = Number(center.lat.toFixed(4));
               zoomRef.current = Number(currentZoom.toFixed(2));

               // Throttled update for display coordinates (less frequent re-renders) - currently unused
               // setDisplayCoords({
               //   lng: lngRef.current,
               //   lat: latRef.current,
               //   zoom: zoomRef.current,
               // });

               // Update map bounds for segment exploration
              if (currentBounds) {
                setMapBounds({
                  sw: [currentBounds.getSouth(), currentBounds.getWest()],
                  ne: [currentBounds.getNorth(), currentBounds.getEast()],
                });
              }
            }
          }, 100); // Debounce updates by 100ms
        });

        // Log map interactions for debugging
        if (process.env.NODE_ENV !== "production") {
          map.current!.on("dragstart", () => console.log("Map drag started"));
          map.current!.on("dragend", () => console.log("Map drag ended"));
          map.current!.on("zoomstart", () => console.log("Map zoom started"));
          map.current!.on("zoomend", () => console.log("Map zoom ended"));
        }
      });
      } catch (error) {
        console.error("Failed to initialize map:", error);
        setMapError(
          "Failed to initialize map. Please check your internet connection.",
        );
      }
    };

    void initializeMap();

    // Cleanup function
    return () => {
      if (map.current) {
        try {
          if (process.env.NODE_ENV !== "production") {
            console.log("Cleaning up map");
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
            console.warn("Error removing map (this is usually harmless during development):", error);
          }
        } finally {
          map.current = null;
          mapInitialized.current = false;
        }
      }
    };
  }, []);

  // Update segments on map when data changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Always show explore segments (no more tabs)
    const currentSegments = segments;

    // If no segments, just clear the map
    if (!currentSegments.length) {
      if (process.env.NODE_ENV !== "production") {
        console.log(`Cleared map - no segments to display`);
      }
      // Update existing source with empty data instead of removing
      const existingSource = map.current.getSource("segments");
      if (existingSource) {
        existingSource.setData({
          type: "FeatureCollection",
          features: [],
        });
      }
      return;
    }

    const geoJsonData = segmentsGeoJSON;

    try {
      // Update or create source
      const existingSource = map.current.getSource("segments");
      if (existingSource) {
        // Update existing source data
        existingSource.setData(geoJsonData);
      } else {
        // Create new source and layers
        map.current.addSource("segments", {
          type: "geojson",
          data: geoJsonData,
        });

        // Add the segment lines layer
        map.current.addLayer({
          id: "segments-line",
          type: "line",
          source: "segments",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#10b981", // Green for segments
            "line-width": 4,
          },
        });

        // Add a layer for highlighted segments
        map.current.addLayer({
          id: "segments-highlighted",
          type: "line",
          source: "segments",
          layout: {
            "line-join": "round",
            "line-cap": "round",
          },
          paint: {
            "line-color": "#ec4899", // Pink color for highlighted segments
            "line-width": 3,
          },
          filter: ["==", ["get", "id"], ""], // Initially no segments highlighted
        });
      }

      if (process.env.NODE_ENV !== "production") {
        console.log(`Added ${currentSegments.length} segments to map`);
      }

      // Add hover event listeners for map tooltips
      map.current.on("mouseenter", "segments-line", (e: any) => {
        if (!e.features?.[0]) return;

        const feature = e.features[0];
        const properties = feature.properties;
        if (!properties) return;

        map.current!.getCanvas().style.cursor = "pointer";

        setMapTooltip({
          visible: true,
          x: e.point.x,
          y: e.point.y,
          segment: {
            id: String(properties.id),
            name: String(properties.name),
            distance: Number(properties.distance),
            averageGrade: Number(properties.averageGrade),
            elevationGain: Number(properties.elevationGain),
            ascentM: Number(properties.ascentM),
            descentM: Number(properties.descentM),
          },
        });

        // Also highlight the segment
        highlightSegment(String(properties.id));
      });

      // Update tooltip position on mouse move
      map.current.on("mousemove", "segments-line", (e: any) => {
        setMapTooltip((prev) => ({
          ...prev,
          x: e.point.x,
          y: e.point.y,
        }));
      });

      // Hide tooltip on mouse leave
      map.current.on("mouseleave", "segments-line", () => {
        map.current!.getCanvas().style.cursor = "";
        setMapTooltip({
          visible: false,
          x: 0,
          y: 0,
          segment: null,
        });

        // Remove highlight
        highlightSegment(null);
      });
    } catch (error) {
      console.warn("Error updating segments on map:", error);
    }
  }, [segments, highlightSegment]);

  // Update highlighted segment filter
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;

    const layerId = "segments-highlighted";
    if (map.current.getLayer(layerId)) {
      try {
        // Update the filter to highlight the selected segment
        const filter = highlightedSegmentId
          ? ["==", ["get", "id"], highlightedSegmentId]
          : ["==", ["get", "id"], ""]; // Empty filter shows no segments

        map.current.setFilter(layerId, filter);
      } catch (error) {
        console.warn("Error updating segment highlight:", error);
      }
    }
  }, [highlightedSegmentId]);

  // Display trip routes on map
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;

    // Define colors for different days using centralized colors
    const dayColors = getDayColorsArray(); // ["#6366f1", "#10b981", "#f97316", "#ec4899"]

    // Helper function to remove all trip route layers and sources dynamically
    const removeAllTripRouteLayers = () => {
      const style = map.current!.getStyle();
      if (!style?.sources) return;

      // Get all source IDs that match trip route patterns
      const tripSourceIds = Object.keys(style.sources).filter(id => 
        id.startsWith('trip-route-day-') || 
        id === 'trip-start-marker-source'
      );

      // Remove associated layers first
      tripSourceIds.forEach(sourceId => {
        const layerId = sourceId.replace('-source', '');
        
        [layerId, 'trip-start-marker'].forEach(id => {
          if (map.current!.getLayer(id)) {
            map.current!.removeLayer(id);
          }
        });
      });

      // Then remove sources
      tripSourceIds.forEach(sourceId => {
        if (map.current!.getSource(sourceId)) {
          map.current!.removeSource(sourceId);
        }
      });
    };

    // Remove existing trip route layers and sources
    try {
      removeAllTripRouteLayers();
    } catch (error) {
      console.warn("Error removing existing trip route layers:", error);
    }

    // Add new trip routes if available and visible
    if (currentTrip && routesVisible) {
      if (process.env.NODE_ENV !== "production") {
        console.log("[TRIP_ROUTES_DISPLAY]", {
          routeCount: currentTrip.routes.length,
          totalDistance: Math.round(currentTrip.totalDistanceKm),
          startCoordinate: currentTrip.startCoordinate,
          timestamp: new Date().toISOString(),
        });
      }

      try {
        // Add route lines for each day
        currentTrip.routes.forEach((route) => {
          const dayNumber = route.dayNumber;
          const color = dayColors[(dayNumber - 1) % dayColors.length] ?? "#6366f1";
          const sourceId = `trip-route-day-${dayNumber}-source`;
          const layerId = `trip-route-day-${dayNumber}`;

          // Add source for this day's route
          map.current!.addSource(sourceId, {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {
                dayNumber,
                distance: route.distanceKm,
                elevation: route.elevationGainM,
                segments: route.segmentNames.join(", "),
              },
              geometry: route.geometry,
            },
          });

          // Add line layer for this day's route
          map.current!.addLayer({
            id: layerId,
            type: "line",
            source: sourceId,
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

          if (process.env.NODE_ENV !== "production") {
            console.log(`[TRIP_ROUTE_DAY_ADDED]`, {
              dayNumber,
              color,
              coordinateCount: route.geometry.coordinates.length,
              distance: Math.round(route.distanceKm),
              elevation: Math.round(route.elevationGainM),
            });
          }
        });

        // Add start point marker if available
        if (currentTrip.startCoordinate) {
          map.current.addSource("trip-start-marker-source", {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {
                title: "Trip Start",
              },
              geometry: {
                type: "Point",
                coordinates: currentTrip.startCoordinate,
              },
            },
          });

          map.current.addLayer({
            id: "trip-start-marker",
            type: "circle",
            source: "trip-start-marker-source",
            paint: {
              "circle-radius": 8,
              "circle-color": "#ffffff",
              "circle-stroke-color": "#22c55e",
              "circle-stroke-width": 3,
            },
          });

          // Fly to the start point with appropriate zoom
          map.current.flyTo({
            center: currentTrip.startCoordinate,
            zoom: 11,
            essential: true,
          });

          if (process.env.NODE_ENV !== "production") {
            console.log("[TRIP_START_MARKER_ADDED]", {
              coordinate: currentTrip.startCoordinate,
              timestamp: new Date().toISOString(),
            });
          }
        }

        if (process.env.NODE_ENV !== "production") {
          console.log(`[TRIP_ROUTES_COMPLETE]`, {
            routesAdded: currentTrip.routes.length,
            hasStartMarker: !!currentTrip.startCoordinate,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error("Error adding trip routes to map:", error);
      }
    }
  }, [currentTrip, routesVisible]);

  const handleSearch = async () => {
    if (!searchValue.trim() || !map.current) return;

    // Track explore search event
    void capture('explore_search_submit', {
      query_length: searchValue.trim().length,
      filter_state: 'location_search'
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("Searching for location:", searchValue);
    }

    try {
      // Use Mapbox Geocoding API directly
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchValue,
        )}.json?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}&types=place,locality,neighborhood`,
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = (await response.json()) as MapboxGeocodingResponse;

      if (data.features?.[0]) {
        const [lng, lat] = data.features[0].center;
        if (process.env.NODE_ENV !== "production") {
          console.log("Flying to search result:", { lng, lat });
        }

        map.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          essential: true,
        });
      } else {
        if (process.env.NODE_ENV !== "production") {
          console.warn("No results found for:", searchValue);
        }
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const handleUseMyLocation = () => {
    if (locationPermission === "denied") {
      alert(
        "Location access was denied. Please enable location permissions in your browser settings and refresh the page.",
      );
      return;
    }

    getUserLocation();
  };

  // ==== AUTOCOMPLETE SUGGESTION SELECTION ====
  // Handle when user selects a suggestion from autocomplete dropdown
  // Navigates map to the selected location with smooth animation
  // ============================================
  const handleSuggestionSelect = (suggestion: MapboxSuggestion) => {
    if (!map.current) return;

    const [lng, lat] = suggestion.center;
    if (process.env.NODE_ENV !== "production") {
      console.log("Flying to autocomplete suggestion:", {
        suggestion: suggestion.place_name,
        coordinates: { lng, lat },
      });
    }

    map.current.flyTo({
      center: [lng, lat],
      zoom: 12,
      essential: true,
    });

    // Clear the search value after selection
    setSearchValue("");
  };

  const handlePlanTrip = () => {
    const selectedSegmentIds_array = Array.from(selectedSegmentIds);
    
    // Track explore plan trip click event
    void capture('explore_plan_trip_click', {
      selected_segment_count: selectedSegmentIds.size
    });

    if (process.env.NODE_ENV !== "production") {
      console.log("[EXPLORE_PLAN_TRIP]", {
        selectedSegmentCount: selectedSegmentIds.size,
        segmentIds: selectedSegmentIds_array,
        constraints,
        timestamp: new Date().toISOString(),
      });
    }

    // Navigate to new-trip page with selected segment IDs as URL parameters
    const segmentParams = selectedSegmentIds_array.join(',');
    router.push(`/new-trip?segments=${segmentParams}`);
  };

  return (
    <div className="flex h-screen flex-col">

      {/* Trip Planning Controls Bar */}
      <div className="border-b bg-gray-50 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="w-80">
              <AutocompleteInput
                value={searchValue}
                onChange={setSearchValue}
                onSelect={handleSuggestionSelect}
                placeholder={
                  locationPermission === "granted"
                    ? "Enter city or address..."
                    : "Enter city or use your current location..."
                }
                showSearchButton={false}
              />
            </div>
          </div>

          {/* Trip Constraints Controls */}
          <div className="relative">
            <TripConstraintsControls
              selectedSegmentCount={selectedSegmentIds.size}
              onPlanTrip={handlePlanTrip}
            />
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Floating Sidebar */}
        <div className="absolute left-4 top-4 z-10 w-80 max-h-[calc(100vh-200px)] bg-white rounded-lg shadow-lg border overflow-hidden">
          <SegmentListSidebar
            segments={segments}
            isLoading={isLoadingSegments}
            error={segmentError}
            debouncedBounds={debouncedBounds}
            isRateLimited={isSegmentRateLimited}
            onRefreshSegments={() => void refetchSegments()}
          />
        </div>

        {/* Map */}
        <div className="relative flex-1">
          {mapError ? (
            <div className="flex h-full items-center justify-center bg-gray-100">
              <div className="p-8 text-center">
                <div className="mb-2 text-lg font-medium text-red-600">
                  Map Error
                </div>
                <div className="mb-4 text-gray-600">{mapError}</div>
                <button
                  onClick={() => window.location.reload()}
                  className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                >
                  Refresh Page
                </button>
              </div>
            </div>
          ) : (
            <>
              <div ref={mapContainer} className="h-full w-full" />

              {/* Map overlay info */}
              <div className="absolute left-4 top-4 rounded-lg bg-white p-3 shadow-md">
                <div className="text-sm">
                  <div className="font-medium text-gray-900">
                    {locationPermission === "granted" && currentLocationInfo
                      ? currentLocationInfo.displayName
                      : locationPermission === "granted"
                        ? "📍 Your Location"
                        : "🏛️ Girona, Spain"}
                  </div>
                  <div className="text-gray-500">
                    {locationPermission === "granted"
                      ? "Showing your current area"
                      : "Famous cycling destination"}
                  </div>
                </div>
              </div>

              {/* ==== MINIMAL LOCATION BUTTON (Step 7) ====  */}
              {/* Compact map button to replace bulky sidebar section */}
              {/* ============================================== */}
              <Dialog
                open={isLocationDialogOpen}
                onOpenChange={setIsLocationDialogOpen}
              >
                <DialogTrigger asChild>
                  <button
                    className="absolute right-4 top-4 rounded-lg bg-white p-3 shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    aria-label="Change location"
                    title="Change area"
                  >
                    <MapPin className="h-5 w-5 text-gray-700" />
                  </button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Change Location</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {/* Current location button */}
                    <button
                      onClick={() => {
                        handleUseMyLocation();
                        setIsLocationDialogOpen(false);
                      }}
                      disabled={isLoadingLocation}
                      className="w-full rounded-md bg-green-600 px-4 py-3 text-sm text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isLoadingLocation
                        ? "Getting your location..."
                        : locationPermission === "denied"
                          ? "Location access denied"
                          : "📍 Use my current location"}
                    </button>

                    {locationPermission === "denied" && (
                      <p className="text-xs text-gray-600">
                        Enable location permissions in your browser settings to
                        use your current location
                      </p>
                    )}

                    {/* Divider */}
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-white px-2 text-gray-500">or</span>
                      </div>
                    </div>

                    {/* Autocomplete search form */}
                    <div className="space-y-2">
                      <AutocompleteInput
                        value={searchValue}
                        onChange={setSearchValue}
                        onSelect={(suggestion) => {
                          handleSuggestionSelect(suggestion);
                          setIsLocationDialogOpen(false);
                        }}
                        placeholder="Enter city or address..."
                        className="w-full"
                      />
                      <button
                        onClick={() => {
                          void handleSearch();
                          setIsLocationDialogOpen(false);
                        }}
                        className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      >
                        Search Location
                      </button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>

              {/* Map tooltip - appears when hovering over segments */}
              {mapTooltip.visible && mapTooltip.segment && (
                <div
                  className="pointer-events-none absolute z-50 rounded-md bg-gray-900 px-3 py-2 text-sm text-white shadow-lg"
                  style={{
                    left: mapTooltip.x + 10,
                    top: mapTooltip.y - 10,
                    transform: "translateY(-100%)",
                  }}
                >
                  <div className="space-y-1">
                    <p className="font-medium">{mapTooltip.segment.name}</p>
                    <div className="flex items-center gap-3 text-xs">
                      <span>
                        📏 {(mapTooltip.segment.distance / 1000).toFixed(1)} km
                      </span>
                      <span>
                        📈 {mapTooltip.segment.averageGrade.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {mapTooltip.segment.ascentM > 0 && (
                        <span className="text-orange-300">
                          ⬆️ {Math.round(mapTooltip.segment.ascentM)}m
                        </span>
                      )}
                      {mapTooltip.segment.descentM > 0 && (
                        <span className="text-blue-300">
                          ⬇️ {Math.round(mapTooltip.segment.descentM)}m
                        </span>
                      )}
                      {mapTooltip.segment.elevationGain > 0 && (
                        <span className="text-gray-300">
                          ⛰️ {Math.round(mapTooltip.segment.elevationGain)}m
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
