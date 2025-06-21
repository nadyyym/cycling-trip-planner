"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { env } from "~/env";
import { SegmentListSidebar } from "../_components/SegmentListSidebar";
import { useDebouncedBounds } from "../_hooks/useDebouncedBounds";
import { useSegmentExplore } from "../_hooks/useSegmentExplore";
import { useSegmentStore } from "../_hooks/useSegmentStore";
import { useRateLimitHandler } from "../_hooks/useRateLimitHandler";
import { api } from "~/trpc/react";
import { segmentsToGeoJSON } from "~/lib/mapUtils";
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

// Mapbox access token
mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

interface MapboxGeocodingResponse {
  features: Array<{
    center: [number, number];
    place_name: string;
  }>;
}

export default function ExplorePage() {
  // Map-related state
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);
  const [lng, setLng] = useState(-0.1276); // London coordinates as fallback
  const [lat, setLat] = useState(51.5074);
  const [zoom, setZoom] = useState(10);
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
    isLoading: isLoadingSegments,
    error: segmentError,
  } = useSegmentExplore(debouncedBounds);

  // Get saved segments (used to be "starred")
  const { data: savedSegments = [] } =
    api.segment.getMySavedSegments.useQuery();

  // Rate limiting handler for segments
  const { isRateLimited: isSegmentRateLimited } = useRateLimitHandler();

  // Segment store for selection and highlighting
  const { highlightedSegmentId, highlightSegment } = useSegmentStore();

  // Reference to track if initial segment search has been performed
  const hasInitialSegmentSearch = useRef(false);

  // Initialize Mapbox access token
  useEffect(() => {
    mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
  }, []);

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
        console.log("Got user location:", { latitude, longitude });

        // Update coordinates and zoom to user location
        setLat(latitude);
        setLng(longitude);
        setZoom(12);

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
          console.log("Starting reverse geocoding for user location...");
          const locationInfo = await reverseGeocode([longitude, latitude]);
          setCurrentLocationInfo(locationInfo);
          console.log(
            "Reverse geocoding successful:",
            locationInfo.displayName,
          );
        } catch (error) {
          console.warn("Reverse geocoding failed:", error);
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

    console.log("Initializing map with coordinates:", { lng, lat, zoom });

    try {
      mapInitialized.current = true;
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: zoom,
      });

      console.log("Map created successfully");

      // Wait for map to load before setting up event listeners
      map.current.on("load", () => {
        console.log("Map loaded successfully");

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
          console.log("[SEGMENT_SEARCH_AUTO]");
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

              setLng(Number(center.lng.toFixed(4)));
              setLat(Number(center.lat.toFixed(4)));
              setZoom(Number(currentZoom.toFixed(2)));

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
        map.current!.on("dragstart", () => console.log("Map drag started"));
        map.current!.on("dragend", () => console.log("Map drag ended"));
        map.current!.on("zoomstart", () => console.log("Map zoom started"));
        map.current!.on("zoomend", () => console.log("Map zoom ended"));
      });
    } catch (error) {
      console.error("Failed to initialize map:", error);
      setMapError(
        "Failed to initialize map. Please check your internet connection.",
      );
    }

    // Cleanup function
    return () => {
      if (map.current) {
        try {
          console.log("Cleaning up map");
          map.current.remove();
        } catch (error) {
          console.warn("Error removing map:", error);
        }
        map.current = null;
        mapInitialized.current = false;
      }
    };
  }, [lat, lng, zoom]); // Include coordinates but handle them carefully to avoid excessive re-renders

  // Update segments on map when data changes
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return;

    // Always show explore segments (no more tabs)
    const currentSegments = segments;

    // Remove existing source and layers if they exist
    try {
      if (map.current.getSource("segments")) {
        if (map.current.getLayer("segments-highlighted")) {
          map.current.removeLayer("segments-highlighted");
        }
        if (map.current.getLayer("segments-line")) {
          map.current.removeLayer("segments-line");
        }
        map.current.removeSource("segments");
      }

      // If no segments, just clear the map
      if (!currentSegments.length) {
        console.log(`Cleared map - no segments to display`);
        return;
      }

      const geoJsonData = segmentsToGeoJSON(currentSegments);

      // Add source and layers
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

      console.log(`Added ${currentSegments.length} segments to map`);

      // Add hover event listeners for map tooltips
      map.current.on("mouseenter", "segments-line", (e) => {
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
          },
        });

        // Also highlight the segment
        highlightSegment(String(properties.id));
      });

      // Update tooltip position on mouse move
      map.current.on("mousemove", "segments-line", (e) => {
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

  const handleSearch = async () => {
    if (!searchValue.trim() || !map.current) return;

    console.log("Searching for location:", searchValue);

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
        console.log("Flying to search result:", { lng, lat });

        map.current.flyTo({
          center: [lng, lat],
          zoom: 12,
          essential: true,
        });
      } else {
        console.warn("No results found for:", searchValue);
      }
    } catch (error) {
      console.error("Search failed:", error);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      void handleSearch();
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

  return (
    <div className="flex h-screen flex-col">
      {/* Header with Favourites */}
      <header className="border-b bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              ← Back to home
            </Link>
            <h1 className="text-xl font-semibold text-gray-900">
              Explore Cycling Segments
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Favourites section moved to header */}
            <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
              <span className="text-sm font-medium text-blue-900">
                💖 Favourites
              </span>
              {savedSegments.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                  {savedSegments.length}
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500">
              Lng: {lng} | Lat: {lat} | Zoom: {zoom}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - simplified without tabs */}
        <div className="flex w-80 flex-col overflow-hidden border-r bg-white">
          {/* Search section */}
          <div className="flex-shrink-0 border-b p-4">
            {/* ==== MINIMAL LOCATION UI (Step 7) ====  */}
            {/* Removed bulky location section to save 56px+ vertical space */}
            {/* Location functionality moved to minimal map button */}
            {/* ===================================== */}
            <div className="flex gap-2">
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  locationPermission === "granted"
                    ? "Enter city or location..."
                    : "Enter city or use your current location..."
                }
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={() => void handleSearch()}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Search
              </button>
            </div>
          </div>

          {/* Segment list - directly below search without tabs */}
          <div className="flex-1 overflow-hidden">
            <SegmentListSidebar
              segments={segments}
              isLoading={isLoadingSegments}
              error={segmentError}
              debouncedBounds={debouncedBounds}
              isRateLimited={isSegmentRateLimited}
            />
          </div>
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

                    {/* Search form */}
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={searchValue}
                        onChange={(e) => setSearchValue(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter") {
                            void handleSearch();
                            setIsLocationDialogOpen(false);
                          }
                        }}
                        placeholder="Enter city name..."
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                    {mapTooltip.segment.elevationGain > 0 && (
                      <p className="text-xs">
                        ⛰️ {Math.round(mapTooltip.segment.elevationGain)}m
                        elevation
                      </p>
                    )}
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
