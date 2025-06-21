"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import mapboxgl from "mapbox-gl";

import { env } from "~/env";

// Import Mapbox CSS
import "mapbox-gl/dist/mapbox-gl.css";

// Type for Mapbox Geocoding API response
interface MapboxGeocodingResponse {
  features: Array<{
    center: [number, number];
    place_name: string;
  }>;
}

export default function ExplorePage() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const mapInitialized = useRef(false);

  // Default to Girona, Spain - famous cycling destination
  const [lng, setLng] = useState(2.8214); // Girona longitude
  const [lat, setLat] = useState(41.9794); // Girona latitude
  const [zoom, setZoom] = useState(12);
  const [searchValue, setSearchValue] = useState("");
  const [mapError, setMapError] = useState<string | null>(null);
  const [locationPermission, setLocationPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const getUserLocation = useCallback(() => {
    setIsLoadingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const userLng = position.coords.longitude;
        const userLat = position.coords.latitude;

        console.log("User location obtained:", { userLng, userLat });

        setLng(userLng);
        setLat(userLat);
        setLocationPermission("granted");
        setIsLoadingLocation(false);

        // If map is already initialized, fly to user location
        if (map.current) {
          map.current.flyTo({
            center: [userLng, userLat],
            zoom: 13,
            essential: true,
          });
        }
      },
      (error) => {
        console.error("Error getting user location:", error);
        setLocationPermission("denied");
        setIsLoadingLocation(false);

        switch (error.code) {
          case error.PERMISSION_DENIED:
            console.log("User denied the request for geolocation");
            break;
          case error.POSITION_UNAVAILABLE:
            console.log("Location information is unavailable");
            break;
          case error.TIMEOUT:
            console.log("The request to get user location timed out");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
      },
    );
  }, []);

  // Request user's location on component mount
  useEffect(() => {
    const requestUserLocation = async () => {
      if (!navigator.geolocation) {
        console.log("Geolocation is not supported by this browser");
        return;
      }

      try {
        // Check if we already have permission
        const permission = await navigator.permissions.query({
          name: "geolocation",
        });

        if (permission.state === "granted") {
          setLocationPermission("granted");
          getUserLocation();
        } else if (permission.state === "denied") {
          setLocationPermission("denied");
        } else {
          // Permission is 'prompt' - we'll ask when user clicks the geolocation button
          setLocationPermission("unknown");
        }
      } catch (error) {
        console.log("Could not check geolocation permission:", error);
      }
    };

    void requestUserLocation();
  }, [getUserLocation]);

  // Initialize map - controlled initialization to prevent circular updates
  useEffect(() => {
    // Set Mapbox access token
    if (!env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN) {
      setMapError("Mapbox access token is not configured");
      return;
    }

    mapboxgl.accessToken = env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

    // Prevent multiple initializations
    if (mapInitialized.current || !mapContainer.current) return;

    try {
      console.log("Initializing map with coordinates:", { lng, lat, zoom });

      // Initialize map with current coordinates
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/streets-v12",
        center: [lng, lat],
        zoom: zoom,
        attributionControl: false,
        // Improved touch handling for better three-finger drag support
        touchPitch: true,
        touchZoomRotate: true,
        dragPan: true,
        dragRotate: false, // Disable rotation for simpler interaction
        keyboard: true,
        doubleClickZoom: true,
        scrollZoom: true,
        boxZoom: true,
        // Configure interaction options for better gesture handling
        interactive: true,
        bearingSnap: 7,
        pitchWithRotate: false,
      });

      mapInitialized.current = true;

      // Add error handling for the map
      map.current.on("error", (e) => {
        console.error("Mapbox GL error:", e);
        setMapError("Map failed to load. Please refresh the page.");
      });

      // Wait for map to load before adding controls and event listeners
      map.current.on("load", () => {
        console.log("Map loaded successfully");
        if (!map.current) return;

        // Add navigation controls
        map.current.addControl(new mapboxgl.NavigationControl(), "top-right");

        // Add custom geolocate control that respects our permission handling
        const geolocateControl = new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true,
          },
          trackUserLocation: true,
          showUserHeading: true,
        });

        map.current.addControl(geolocateControl, "top-right");

        // Add scale control
        map.current.addControl(new mapboxgl.ScaleControl(), "bottom-left");

        // Add fullscreen control
        map.current.addControl(new mapboxgl.FullscreenControl(), "top-right");

        // Update state when map moves - debounced to prevent excessive updates
        let moveTimeout: NodeJS.Timeout;
        map.current.on("move", () => {
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

        // Log map interactions for debugging
        map.current.on("dragstart", () => console.log("Map drag started"));
        map.current.on("dragend", () => console.log("Map drag ended"));
        map.current.on("zoomstart", () => console.log("Map zoom started"));
        map.current.on("zoomend", () => console.log("Map zoom ended"));
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
        } finally {
          map.current = null;
          mapInitialized.current = false;
        }
      }
    };
  }, [lat, lng, zoom]); // Include coordinates but handle them carefully to avoid excessive re-renders

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

      if (data.features && data.features.length > 0 && data.features[0]) {
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
      {/* Header */}
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
            <div className="text-sm text-gray-500">
              Lng: {lng} | Lat: {lat} | Zoom: {zoom}
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 overflow-y-auto border-r bg-white p-4">
          <div className="space-y-4">
            {/* Location controls */}
            <div className="rounded-lg bg-green-50 p-4">
              <h3 className="mb-2 text-sm font-medium text-green-900">
                📍 Current location: Girona, Spain
              </h3>
              <button
                onClick={handleUseMyLocation}
                disabled={isLoadingLocation}
                className="w-full rounded-md bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLoadingLocation
                  ? "Getting your location..."
                  : locationPermission === "denied"
                    ? "Location access denied"
                    : "📍 Use my location"}
              </button>
              {locationPermission === "denied" && (
                <p className="mt-2 text-xs text-green-700">
                  Enable location permissions to use your current location
                </p>
              )}
            </div>

            {/* Search */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">
                Search location
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter city or location..."
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

            {/* Instructions */}
            <div className="rounded-lg bg-blue-50 p-4">
              <h3 className="text-sm font-medium text-blue-900">
                How to explore segments
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-blue-800">
                <li>• Use your location or search for a city</li>
                <li>• Navigate the map with controls</li>
                <li>
                  • Click &ldquo;Search segments in view&rdquo; to find cycling
                  routes
                </li>
                <li>• Select segments to add to your trip</li>
              </ul>
            </div>

            {/* Map controls */}
            <div className="space-y-3">
              <button className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                Search segments in view
              </button>

              <button className="w-full rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">
                Clear selection
              </button>
            </div>

            {/* Segments list placeholder */}
            <div className="border-t pt-4">
              <h3 className="mb-2 text-sm font-medium text-gray-900">
                Found segments
              </h3>
              <div className="text-sm text-gray-500">
                Search for segments to see results here
              </div>
            </div>
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
                    {locationPermission === "granted"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
