import { useState, useEffect, useCallback } from "react";
import { env } from "~/env";

interface MapboxSuggestion {
  id: string;
  place_name: string;
  center: [number, number];
  text: string;
  place_type: string[];
}

interface MapboxAutocompleteResponse {
  features: MapboxSuggestion[];
}

interface UseMapboxAutocompleteOptions {
  debounceMs?: number;
  minQueryLength?: number;
  types?: string;
}

interface UseMapboxAutocompleteResult {
  suggestions: MapboxSuggestion[];
  isLoading: boolean;
  error: string | null;
  clearSuggestions: () => void;
}

/**
 * Custom hook for Mapbox geocoding autocomplete suggestions
 * Provides debounced search with caching for better UX and performance
 */
export function useMapboxAutocomplete(
  query: string,
  options: UseMapboxAutocompleteOptions = {},
): UseMapboxAutocompleteResult {
  const {
    debounceMs = 300,
    minQueryLength = 2,
    types = "place,locality,neighborhood,address",
  } = options;

  const [suggestions, setSuggestions] = useState<MapboxSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Simple in-memory cache for suggestions
  const [cache] = useState(new Map<string, MapboxSuggestion[]>());

  const fetchSuggestions = useCallback(
    async (searchQuery: string) => {
      if (searchQuery.length < minQueryLength) {
        setSuggestions([]);
        setIsLoading(false);
        return;
      }

      // Check cache first
      const cacheKey = `${searchQuery}-${types}`;
      if (cache.has(cacheKey)) {
        setSuggestions(cache.get(cacheKey)!);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        console.log(`[MAPBOX_AUTOCOMPLETE_START]`, {
          query: searchQuery,
          types,
          timestamp: new Date().toISOString(),
        });

        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
          searchQuery,
        )}.json?access_token=${env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN}&types=${types}&limit=5&autocomplete=true`;

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Geocoding failed: ${response.status}`);
        }

        const data = (await response.json()) as MapboxAutocompleteResponse;
        const results = data.features || [];

        // Cache the results
        cache.set(cacheKey, results);

        setSuggestions(results);

        console.log(`[MAPBOX_AUTOCOMPLETE_SUCCESS]`, {
          query: searchQuery,
          resultCount: results.length,
          results: results.map((r) => r.place_name),
          cached: true,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        setError(errorMessage);
        setSuggestions([]);

        console.warn(`[MAPBOX_AUTOCOMPLETE_ERROR]`, {
          query: searchQuery,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      } finally {
        setIsLoading(false);
      }
    },
    [minQueryLength, types, cache],
  );

  // Debounced effect for fetching suggestions
  useEffect(() => {
    const trimmedQuery = query.trim();

    if (trimmedQuery.length === 0) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    if (trimmedQuery.length < minQueryLength) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    const timeoutId = setTimeout(() => {
      void fetchSuggestions(trimmedQuery);
    }, debounceMs);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [query, debounceMs, minQueryLength, fetchSuggestions]);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    suggestions,
    isLoading,
    error,
    clearSuggestions,
  };
}
