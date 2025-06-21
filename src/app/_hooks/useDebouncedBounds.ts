import { useEffect, useState } from "react";

export interface MapBounds {
  sw: [number, number]; // [lat, lng]
  ne: [number, number]; // [lat, lng]
}

/**
 * Custom hook that debounces map bounds changes
 * Prevents excessive API calls when user is actively panning/zooming
 *
 * @param bounds - Current map bounds
 * @param delay - Debounce delay in milliseconds (default: 400ms)
 * @returns Debounced bounds that only update after the delay period
 */
export function useDebouncedBounds(
  bounds: MapBounds | null,
  delay = 400,
): MapBounds | null {
  const [debouncedBounds, setDebouncedBounds] = useState<MapBounds | null>(
    bounds,
  );

  useEffect(() => {
    // If bounds is null, immediately set debounced bounds to null
    if (!bounds) {
      setDebouncedBounds(null);
      return;
    }

    // Set up the debounce timer
    const timer = setTimeout(() => {
      setDebouncedBounds(bounds);
    }, delay);

    // Cleanup function to clear the timer if bounds change before delay
    return () => {
      clearTimeout(timer);
    };
  }, [bounds, delay]);

  return debouncedBounds;
}

/**
 * Helper function to round bounds to avoid excessive precision
 * This helps with caching and reduces duplicate API calls for nearly identical bounds
 *
 * @param bounds - Map bounds to round
 * @param precision - Number of decimal places (default: 4)
 * @returns Rounded bounds
 */
export function roundBounds(bounds: MapBounds, precision = 4): MapBounds {
  const factor = Math.pow(10, precision);

  return {
    sw: [
      Math.round(bounds.sw[0] * factor) / factor,
      Math.round(bounds.sw[1] * factor) / factor,
    ],
    ne: [
      Math.round(bounds.ne[0] * factor) / factor,
      Math.round(bounds.ne[1] * factor) / factor,
    ],
  };
}

/**
 * Helper function to check if two bounds are significantly different
 * Used to avoid API calls for tiny map movements
 *
 * @param bounds1 - First bounds
 * @param bounds2 - Second bounds
 * @param threshold - Minimum difference threshold (default: 0.001)
 * @returns True if bounds are significantly different
 */
export function boundsChanged(
  bounds1: MapBounds | null,
  bounds2: MapBounds | null,
  threshold = 0.001,
): boolean {
  if (!bounds1 || !bounds2) {
    return bounds1 !== bounds2;
  }

  const latDiff =
    Math.abs(bounds1.sw[0] - bounds2.sw[0]) +
    Math.abs(bounds1.ne[0] - bounds2.ne[0]);
  const lngDiff =
    Math.abs(bounds1.sw[1] - bounds2.sw[1]) +
    Math.abs(bounds1.ne[1] - bounds2.ne[1]);

  return latDiff > threshold || lngDiff > threshold;
}
