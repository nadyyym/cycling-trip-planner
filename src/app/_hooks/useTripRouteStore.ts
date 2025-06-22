import { create } from "zustand";

/**
 * GeoJSON LineString geometry for route display
 */
export interface RouteGeometry {
  type: "LineString";
  coordinates: [number, number][];
}

/**
 * A single day's route for map display
 */
export interface TripRoute {
  dayNumber: number;
  geometry: RouteGeometry;
  distanceKm: number;
  elevationGainM: number; // Legacy field for backward compatibility
  ascentM: number;
  descentM: number;
  segmentNames: string[];
}

/**
 * Complete trip with multiple day routes
 */
export interface Trip {
  routes: TripRoute[];
  totalDistanceKm: number;
  totalElevationGainM: number; // Legacy field for backward compatibility
  totalAscentM: number;
  totalDescentM: number;
  startCoordinate?: [number, number]; // First coordinate for map centering
  // Saved trip information
  savedTripData?: {
    slug: string;
    shareUrl: string;
    days: Array<{
      day: number;
      dayName: string;
      startLocality: string;
      endLocality: string;
      distanceKm: number;
      elevationM: number;
    }>;
  };
}

/**
 * Store for managing planned trip routes on the map
 */
export interface TripRouteStore {
  /** Current planned trip (null if no trip planned) */
  currentTrip: Trip | null;
  
  /** Whether routes are currently visible on the map */
  routesVisible: boolean;
  
  /** Actions */
  setTrip: (trip: Trip) => void;
  setSavedTripData: (savedData: Trip['savedTripData']) => void;
  clearTrip: () => void;
  setRoutesVisible: (visible: boolean) => void;
}

/**
 * Zustand store for managing trip route state
 * Used for displaying planned routes on the map and managing visibility
 */
export const useTripRouteStore = create<TripRouteStore>((set) => ({
  currentTrip: null,
  routesVisible: true,

  setTrip: (trip: Trip) => {
    console.log("[TRIP_ROUTE_STORE_SET]", {
      routeCount: trip.routes.length,
      totalDistance: Math.round(trip.totalDistanceKm),
      totalElevation: Math.round(trip.totalElevationGainM),
      startCoordinate: trip.startCoordinate,
      timestamp: new Date().toISOString(),
    });

    set({ currentTrip: trip, routesVisible: true });
  },

  setSavedTripData: (savedData: Trip['savedTripData']) => {
    console.log("[TRIP_ROUTE_STORE_SET_SAVED_DATA]", {
      slug: savedData?.slug,
      shareUrl: savedData?.shareUrl,
      dayCount: savedData?.days.length,
      timestamp: new Date().toISOString(),
    });

    set((state) => ({
      currentTrip: state.currentTrip ? {
        ...state.currentTrip,
        savedTripData: savedData,
      } : null,
    }));
  },

  clearTrip: () => {
    console.log("[TRIP_ROUTE_STORE_CLEAR]", {
      timestamp: new Date().toISOString(),
    });

    set({ currentTrip: null, routesVisible: false });
  },

  setRoutesVisible: (visible: boolean) => {
    console.log("[TRIP_ROUTE_STORE_VISIBILITY]", {
      visible,
      timestamp: new Date().toISOString(),
    });

    set({ routesVisible: visible });
  },
})); 