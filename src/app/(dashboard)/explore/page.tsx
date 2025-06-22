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
import { useTripRouteStore } from "../_hooks/useTripRouteStore";
import { api } from "~/trpc/react";
import { segmentsToGeoJSON } from "~/lib/mapUtils";
import {
  reverseGeocode,
  type LocationInfo,
} from "~/server/integrations/mapbox";
import { MapPin, Search, Filter } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { AutocompleteInput } from "../_components/AutocompleteInput";
import { getDayColorsArray } from "~/lib/mapUtils";
import { useSidebar } from "~/app/_components/FloatingSidebar";

// Mapbox access token
mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

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

// Mock data for demonstration
const mockSegments = [
  {
    id: "1",
    name: "Col du Galibier",
    distance: 18.2,
    elevation: 1200,
    grade: 6.8,
    difficulty: "Hard",
    location: "French Alps",
  },
  {
    id: "2", 
    name: "Alpe d'Huez",
    distance: 13.8,
    elevation: 1100,
    grade: 8.1,
    difficulty: "Very Hard",
    location: "French Alps",
  },
  {
    id: "3",
    name: "Mont Ventoux",
    distance: 21.3,
    elevation: 1610,
    grade: 7.5,
    difficulty: "Hard",
    location: "Provence",
  },
];

function SegmentList() {
  return (
    <div className="p-4">
      {/* Search Header */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search segments..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-sm text-gray-600 hover:bg-gray-50">
          <Filter className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* Segment List */}
      <div className="space-y-3">
        {mockSegments.map((segment) => (
          <div
            key={segment.id}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-2">
              <h3 className="font-semibold text-gray-900">{segment.name}</h3>
              <p className="text-xs text-gray-500">{segment.location}</p>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Distance</span>
                <p className="font-medium">{segment.distance} km</p>
              </div>
              <div>
                <span className="text-gray-500">Elevation</span>
                <p className="font-medium">{segment.elevation} m</p>
              </div>
              <div>
                <span className="text-gray-500">Grade</span>
                <p className="font-medium">{segment.grade}%</p>
              </div>
            </div>
            
            <div className="mt-2 flex items-center justify-between">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                segment.difficulty === "Very Hard" 
                  ? "bg-red-100 text-red-800"
                  : segment.difficulty === "Hard"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-green-100 text-green-800"
              }`}>
                {segment.difficulty}
              </span>
              <button className="text-xs text-green-600 hover:text-green-700">
                Add to Trip
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const { openSidebar } = useSidebar();

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

  // Get favourite count for header badge
  const { data: favouriteCount } = api.favourite.count.useQuery(undefined, {
    refetchInterval: 60000, // Refresh every minute
    staleTime: 0, // Always consider stale for real-time updates
  });

  // Rate limiting handler for segments
  const { isRateLimited: isSegmentRateLimited } = useRateLimitHandler();

  // Segment store for selection and highlighting
  const { highlightedSegmentId, highlightSegment } = useSegmentStore();

  // Trip route store for displaying planned routes
  const { currentTrip, routesVisible } = useTripRouteStore();

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

  // Display trip routes on map
  useEffect(() => {
    if (!map.current?.isStyleLoaded()) return;

    // Define colors for different days using centralized colors
    const dayColors = getDayColorsArray(); // ["#6366f1", "#10b981", "#f97316", "#ec4899"]

    // Remove existing trip route layers and sources
    try {
      for (let i = 1; i <= 4; i++) {
        const layerId = `trip-route-day-${i}`;
        const sourceId = `trip-route-day-${i}-source`;
        
        if (map.current.getLayer(layerId)) {
          map.current.removeLayer(layerId);
        }
        if (map.current.getSource(sourceId)) {
          map.current.removeSource(sourceId);
        }
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
    if (currentTrip && routesVisible) {
      console.log("[TRIP_ROUTES_DISPLAY]", {
        routeCount: currentTrip.routes.length,
        totalDistance: Math.round(currentTrip.totalDistanceKm),
        startCoordinate: currentTrip.startCoordinate,
        timestamp: new Date().toISOString(),
      });

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

          console.log(`[TRIP_ROUTE_DAY_ADDED]`, {
            dayNumber,
            color,
            coordinateCount: route.geometry.coordinates.length,
            distance: Math.round(route.distanceKm),
            elevation: Math.round(route.elevationGainM),
          });
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

          console.log("[TRIP_START_MARKER_ADDED]", {
            coordinate: currentTrip.startCoordinate,
            timestamp: new Date().toISOString(),
          });
        }

        console.log(`[TRIP_ROUTES_COMPLETE]`, {
          routesAdded: currentTrip.routes.length,
          hasStartMarker: !!currentTrip.startCoordinate,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error adding trip routes to map:", error);
      }
    }
  }, [currentTrip, routesVisible]);

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
    console.log("Flying to autocomplete suggestion:", {
      suggestion: suggestion.place_name,
      coordinates: { lng, lat },
    });

    map.current.flyTo({
      center: [lng, lat],
      zoom: 12,
      essential: true,
    });

    // Clear the search value after selection
    setSearchValue("");
  };

  useEffect(() => {
    // Open the sidebar with segment list when page loads
    openSidebar(<SegmentList />, "Cycling Segments");
  }, [openSidebar]);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      {/* Map Placeholder */}
      <div className="h-full w-full bg-gradient-to-br from-green-100 to-blue-100">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
              <MapPin className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Interactive Map
            </h2>
            <p className="text-gray-600">
              Map component will be rendered here
            </p>
            <p className="mt-2 text-sm text-gray-500">
              The floating sidebar shows cycling segments that can be explored on this map
            </p>
          </div>
        </div>
      </div>

      {/* Map Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-2">
        <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md hover:shadow-lg">
          <span className="text-lg">+</span>
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-lg bg-white shadow-md hover:shadow-lg">
          <span className="text-lg">−</span>
        </button>
      </div>
    </div>
  );
}
