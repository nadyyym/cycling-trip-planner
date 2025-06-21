"use client";

import { useSegmentStore } from "~/app/_hooks/useSegmentStore";
import { type SegmentDTO } from "~/server/integrations/strava";
import { api } from "~/trpc/react";
import { useEffect } from "react";

interface SegmentListSidebarProps {
  segments: SegmentDTO[];
  isLoading: boolean;
  error: { message: string } | null;
  debouncedBounds: { sw: [number, number]; ne: [number, number] } | null;
  isRateLimited?: boolean;
}

/**
 * Sidebar component that displays segment cards with interactive features
 * Handles segment selection, highlighting, and zoom-to-segment functionality
 */
export default function SegmentListSidebar({
  segments,
  isLoading,
  error,
  debouncedBounds,
  isRateLimited = false,
}: SegmentListSidebarProps) {
  const {
    highlightedSegmentId,
    selectedSegmentIds,
    highlightSegment,
    toggleSegmentSelection,
    clearSelection,
    zoomToSegment,
  } = useSegmentStore();

  // Get saved status for current segments
  const { data: savedSegmentIds = [] } = api.segment.getSavedStatus.useQuery(
    { segmentIds: segments.map(s => s.id) },
    { enabled: segments.length > 0 }
  );

  // Save segments mutation
  const saveSegmentsMutation = api.segment.saveMany.useMutation({
    onSuccess: (result) => {
      // Show success toast
      console.log(`Successfully saved ${result.saved} segments, skipped ${result.skipped} existing`);
      
      // Clear selection after successful save
      clearSelection();
      
      // Simple alert for now (can be replaced with proper toast later)
      alert(`✅ Saved ${result.saved} segment${result.saved === 1 ? '' : 's'}${result.skipped > 0 ? `, ${result.skipped} already existed` : ''}`);
    },
    onError: (error) => {
      console.error('Failed to save segments:', error);
      alert(`❌ Failed to save segments: ${error.message}`);
    },
  });

  // Pre-check saved segments when data loads
  useEffect(() => {
    if (savedSegmentIds.length > 0) {
      // Only set saved segments as selected if no segments are currently selected
      // to avoid overriding user's manual selection
      const currentSelection = Array.from(selectedSegmentIds);
      if (currentSelection.length === 0) {
        const segmentStore = useSegmentStore.getState();
        segmentStore.setSelectedSegments(savedSegmentIds);
      }
    }
  }, [savedSegmentIds, selectedSegmentIds]);

  const handleCardHover = (segmentId: string | null) => {
    highlightSegment(segmentId);
  };

  const handleCardClick = (segmentId: string) => {
    if (zoomToSegment) {
      zoomToSegment(segmentId);
    }
  };

  const handleCheckboxChange = (segmentId: string) => {
    toggleSegmentSelection(segmentId);
  };

  const handleSaveSelected = () => {
    const selectedSegments = segments.filter(s => selectedSegmentIds.has(s.id));
    
    if (selectedSegments.length === 0) {
      alert('Please select segments to save');
      return;
    }

    // Convert SegmentDTO to the format expected by the API
    const segmentsToSave = selectedSegments.map(segment => ({
      id: segment.id,
      name: segment.name,
      distance: segment.distance,
      averageGrade: segment.averageGrade,
      polyline: segment.polyline,
      latStart: segment.latStart,
      lonStart: segment.lonStart,
      latEnd: segment.latEnd,
      lonEnd: segment.lonEnd,
      // elevHigh and elevLow are not available in basic SegmentDTO
      komTime: segment.komTime,
      climbCategory: segment.climbCategory,
      elevationGain: segment.elevationGain,
    }));

    saveSegmentsMutation.mutate({ segments: segmentsToSave });
  };

  return (
    <div className="w-80 overflow-y-auto border-r bg-white p-4">
      <div className="space-y-4">
        {/* Header with segment count */}
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium text-gray-900">
            Found segments
            {isLoading && (
              <span className="ml-2 text-xs text-blue-600">Loading...</span>
            )}
            {segments.length > 0 && (
              <span className="ml-2 text-xs text-gray-500">
                ({segments.length} found)
              </span>
            )}
          </h3>

          {/* Selection controls */}
          {selectedSegmentIds.size > 0 && (
            <div className="mb-4 rounded-lg bg-blue-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-blue-900">
                  {selectedSegmentIds.size} segment
                  {selectedSegmentIds.size === 1 ? "" : "s"} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={clearSelection}
                    className="rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                  >
                    Clear
                  </button>
                  <button
                    onClick={handleSaveSelected}
                    disabled={saveSegmentsMutation.isPending}
                    className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Save selected segments to your collection"
                  >
                    {saveSegmentsMutation.isPending ? 'Saving...' : 'Save Selected'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
                  <div className="h-3 w-1/2 rounded bg-gray-200"></div>
                </div>
              ))}
            </div>
          )}

          {/* Rate limited state */}
          {isRateLimited && (
            <div className="rounded-md bg-yellow-50 p-3">
              <div className="text-sm text-yellow-800">
                <p className="font-medium">⏳ Strava Rate Limited</p>
                <p className="mt-1">
                  Too many requests. Please wait a moment before exploring new areas.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <div className="text-sm text-red-800">
                {error.message ===
                "Strava account not connected. Please sign in with Strava." ? (
                  <>
                    <p className="font-medium">Authentication Required</p>
                    <p className="mt-1">
                      Please sign in with Strava to explore segments.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-medium">Failed to load segments</p>
                    <p className="mt-1">{error.message}</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && segments.length === 0 && debouncedBounds && (
            <div className="py-8 text-center">
              <div className="mb-3 text-4xl text-gray-400">🚴‍♀️</div>
              <div className="mb-1 text-sm font-medium text-gray-900">
                No segments in view
              </div>
              <div className="text-sm text-gray-500">
                Try zooming out or exploring a different location
              </div>
            </div>
          )}

          {/* No bounds yet */}
          {!debouncedBounds && !isLoading && (
            <div className="py-8 text-center">
              <div className="mb-3 text-4xl text-gray-400">🗺️</div>
              <div className="text-sm text-gray-500">
                Move the map to explore segments in the area
              </div>
            </div>
          )}

          {/* Segments list */}
          {segments.length > 0 && (
            <div className="max-h-96 space-y-2 overflow-y-auto">
              {segments.map((segment) => {
                const isSelected = selectedSegmentIds.has(segment.id);
                const isHighlighted = highlightedSegmentId === segment.id;
                const isSaved = savedSegmentIds.includes(segment.id);

                return (
                  <div
                    key={segment.id}
                    className={`cursor-pointer rounded-lg border p-3 transition-all duration-200 ${
                      isHighlighted
                        ? "border-red-300 bg-red-50 shadow-md"
                        : isSelected
                          ? "border-blue-300 bg-blue-50"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onMouseEnter={() => handleCardHover(segment.id)}
                    onMouseLeave={() => handleCardHover(null)}
                    onClick={() => handleCardClick(segment.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleCardClick(segment.id);
                      }
                    }}
                    aria-label={`Zoom to segment: ${segment.name}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {/* Segment name */}
                        <div className="mb-2 flex items-center gap-2">
                          <h4 className="truncate text-sm font-medium text-gray-900">
                            {segment.name}
                          </h4>
                          {isSaved && (
                            <span 
                              className="flex-shrink-0 text-green-600 text-xs font-medium"
                              title="Segment already saved"
                            >
                              •
                            </span>
                          )}
                        </div>

                        {/* Distance and elevation row */}
                        <div className="mb-1 flex items-center gap-4 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            📏 {(segment.distance / 1000).toFixed(1)} km
                          </span>
                          {segment.elevationGain > 0 && (
                            <span className="flex items-center gap-1">
                              ⛰️ {Math.round(segment.elevationGain)}m
                            </span>
                          )}
                        </div>

                        {/* Grade and KOM time row */}
                        <div className="flex items-center gap-4 text-xs text-gray-600">
                          <span className="flex items-center gap-1">
                            📈 {segment.averageGrade.toFixed(1)}%
                          </span>
                          {segment.komTime && (
                            <span className="flex items-center gap-1">
                              🏆 {segment.komTime}
                            </span>
                          )}
                          {segment.climbCategory && (
                            <span className="rounded bg-orange-100 px-1.5 py-0.5 text-xs text-orange-800">
                              Cat {segment.climbCategory}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Save checkbox */}
                      <div className="flex-shrink-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation(); // Prevent card click when clicking checkbox
                            handleCheckboxChange(segment.id);
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          title="Save segment for planning"
                          aria-label={`Save ${segment.name} for planning`}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
