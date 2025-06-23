"use client";

import { useSegmentStore, MAX_SEGMENTS } from "~/app/_hooks/useSegmentStore";
import { type SegmentDTO } from "~/server/integrations/strava";
import { api } from "~/trpc/react";
import { useEffect, useMemo } from "react";
import { useToast } from "~/hooks/use-toast";
import { FixedSizeList as List } from "react-window";
import { SignInModal } from "./SignInModal";
import { useRequireAuth } from "../_hooks/useRequireAuth";
import { StravaSignInPrompt } from "./StravaSignInPrompt";
import { useSession } from "next-auth/react";
import { capture } from "~/lib/posthogClient";

interface SegmentListSidebarProps {
  segments: SegmentDTO[];
  isLoading: boolean;
  error: { message: string } | null;
  debouncedBounds: { sw: [number, number]; ne: [number, number] } | null;
  isRateLimited?: boolean;
  /** Function to refetch segments after sign-in */
  onRefreshSegments?: () => void;
}

interface SegmentItemProps {
  index: number;
  style: React.CSSProperties;
  data: {
    segments: SegmentDTO[];
    selectedSegmentIds: Set<string>;
    highlightedSegmentId: string | null;
    favouriteSegmentIds: string[];
    onCardHover: (segmentId: string | null) => void;
    onCardClick: (segmentId: string) => void;
    onZoomToSegment: (segmentId: string, event: React.MouseEvent) => void;
    onCheckboxChange: (segmentId: string) => void;
  };
}

/**
 * Virtualized segment item component
 */
function SegmentItem({ index, style, data }: SegmentItemProps) {
  const segment = data.segments[index];
  if (!segment) return null;

  const isSelected = data.selectedSegmentIds.has(segment.id);
  const isHighlighted = data.highlightedSegmentId === segment.id;
  const isFavourited = data.favouriteSegmentIds.includes(segment.id);

  return (
    <div style={style}>
      <div
        className={`cursor-pointer rounded-lg border p-3 transition-all duration-200 mx-2 mb-2 ${
          isHighlighted
            ? "border-pink-300 bg-pink-50 shadow-md"
            : isSelected
              ? "border-blue-300 bg-blue-50 shadow-sm"
              : "border-gray-200 hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm"
        }`}
        onMouseEnter={() => data.onCardHover(segment.id)}
        onMouseLeave={() => data.onCardHover(null)}
        onClick={(_e) => data.onCardClick(segment.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            data.onCardClick(segment.id);
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={`${isSelected ? 'Deselect' : 'Select'} segment: ${segment.name}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Segment name */}
            <div className="mb-2 flex items-center gap-2">
              <h4 className="truncate text-sm font-medium text-gray-900">
                {segment.name}
              </h4>
              {isFavourited && (
                <span
                  className="flex-shrink-0 text-xs font-medium text-yellow-600"
                  title="Segment already favourited"
                >
                  ⭐
                </span>
              )}
            </div>

            {/* Distance and elevation row */}
            <div className="mb-1 flex items-center gap-4 text-xs text-gray-600">
              <span className="flex items-center gap-1">
                📏 {(segment.distance / 1000).toFixed(1)} km
              </span>
              {(segment.ascentM > 0 || segment.descentM > 0) && (
                <>
                  {segment.ascentM > 0 && (
                    <span className="flex items-center gap-1 text-orange-600">
                      ⬆️ {segment.ascentM}m
                    </span>
                  )}
                  {segment.descentM > 0 && (
                    <span className="flex items-center gap-1 text-sky-500">
                      ⬇️ {segment.descentM}m
                    </span>
                  )}
                </>
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

          {/* Action buttons */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Zoom to segment button */}
            <button
              onClick={(e) => data.onZoomToSegment(segment.id, e)}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Zoom to segment on map"
              aria-label={`Zoom to ${segment.name} on map`}
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                />
              </svg>
            </button>

            {/* Save checkbox */}
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation(); // Prevent card click when clicking checkbox
                data.onCheckboxChange(segment.id);
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              title="Add segment to favourites"
              aria-label={`Add ${segment.name} to favourites`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Sidebar component that displays segment cards with interactive features
 * Handles segment selection, highlighting, and zoom-to-segment functionality
 */
export function SegmentListSidebar({
  segments,
  isLoading,
  error,
  debouncedBounds,
  isRateLimited = false,
  onRefreshSegments,
}: SegmentListSidebarProps) {
  const {
    highlightedSegmentId,
    selectedSegmentIds,
    highlightSegment,
    toggleSegmentSelection,
    clearSelection,
    zoomToSegment,
    setOnLimitReached,
  } = useSegmentStore();

  // Check authentication status
  const { data: session } = useSession();
  const isAuthenticated = !!session;

  // Toast for user notifications
  const { toast } = useToast();

  // Auth guard for save to favourites functionality
  const { requireAuth, isModalOpen, triggerSource, onSignInSuccess, onModalClose } = 
    useRequireAuth("sidebar-save");

  // Auth guard for segment discovery sign-in prompt
  const segmentDiscoveryAuth = useRequireAuth("segment-discovery");

  // Set up limit reached callback to show toast notifications
  useEffect(() => {
    setOnLimitReached((count: number, limit: number) => {
      toast({
        title: `⚠️ Selection Limit Reached`,
        description: `You can only select up to ${limit} segments. Please deselect some segments to add new ones.`,
        variant: "destructive",
      });
    });
  }, [setOnLimitReached, toast]);

  // Get favourites to check which segments are already favourited
  const { data: favourites = [] } = api.favourite.getMyFavourites.useQuery();
  const favouriteSegmentIds = favourites.map((fav) => fav.id);

  // Add to favourites mutation with optimistic updates
  const utils = api.useUtils();
  const addFavouritesMutation = api.favourite.addMany.useMutation({
    onMutate: async (variables) => {
      // Cancel outgoing refetches
      await utils.favourite.getMyFavourites.cancel();
      await utils.favourite.count.cancel();

      // Snapshot previous values
      const previousFavourites = utils.favourite.getMyFavourites.getData();
      const previousCount = utils.favourite.count.getData();

      // Optimistically update count (estimate increase)
      utils.favourite.count.setData(undefined, (old) => ({
        count: (old?.count ?? 0) + variables.segments.length,
      }));

      return { previousFavourites, previousCount };
    },
    onSuccess: (result) => {
      // Show success toast
      console.log(
        `Successfully added ${result.added} favourites, skipped ${result.skipped} existing`,
      );

      // Clear selection after successful save
      clearSelection();

      // Simple alert for now (can be replaced with proper toast later)
      alert(
        `⭐ Added ${result.added} favourite${result.added === 1 ? "" : "s"}${result.skipped > 0 ? `, ${result.skipped} already existed` : ""}`,
      );
    },
    onError: (error, variables, context) => {
      console.error("Failed to add favourites:", error);
      
      // Revert optimistic updates on error
      if (context?.previousFavourites) {
        utils.favourite.getMyFavourites.setData(undefined, context.previousFavourites);
      }
      if (context?.previousCount) {
        utils.favourite.count.setData(undefined, context.previousCount);
      }
      
      alert(`❌ Failed to add favourites: ${error.message}`);
    },
    onSettled: () => {
      // Refetch to ensure consistency
      void utils.favourite.getMyFavourites.invalidate();
      void utils.favourite.count.invalidate();
    },
  });

  // Pre-check favourited segments when data loads
  useEffect(() => {
    if (favouriteSegmentIds.length > 0) {
      // Only set favourited segments as selected if no segments are currently selected
      // to avoid overriding user's manual selection
      const currentSelection = Array.from(selectedSegmentIds);
      if (currentSelection.length === 0) {
        const segmentStore = useSegmentStore.getState();
        segmentStore.setSelectedSegments(favouriteSegmentIds);
      }
    }
  }, [favouriteSegmentIds, selectedSegmentIds]);

  const handleCardHover = (segmentId: string | null) => {
    // Only highlight segments on hover, don't toggle selection
    highlightSegment(segmentId);
  };

  const handleCardClick = (segmentId: string) => {
    // Find the segment to get its distance for analytics
    const segment = segments.find(s => s.id === segmentId);
    const distanceKm = segment ? segment.distance / 1000 : 0;

    // Track segment click event
    void capture('explore_segment_click', {
      segment_id: segmentId,
      distance_km: Number(distanceKm.toFixed(1))
    });

    // Card click now toggles selection (per PRD requirement)
    console.log("[SEGMENT_CARD_CLICK_SELECT]", { segmentId });
    const result = toggleSegmentSelection(segmentId, "card");
    
    // Log if selection was blocked due to limit
    if (!result.success) {
      console.log("[SEGMENT_CARD_CLICK_BLOCKED]", { 
        segmentId, 
        reason: result.reason,
        currentCount: selectedSegmentIds.size 
      });
    }
  };

  const handleZoomToSegment = (segmentId: string, event: React.MouseEvent) => {
    // Prevent card click event from firing
    event.stopPropagation();

    if (zoomToSegment) {
      console.log("[SEGMENT_ZOOM_EXPLICIT]", { segmentId });
      zoomToSegment(segmentId);
    }
  };

  const handleCheckboxChange = (segmentId: string) => {
    const result = toggleSegmentSelection(segmentId, "checkbox");
    
    // Log if selection was blocked due to limit  
    if (!result.success) {
      console.log("[SEGMENT_CHECKBOX_BLOCKED]", { 
        segmentId, 
        reason: result.reason,
        currentCount: selectedSegmentIds.size 
      });
    }
  };

  const handleAddFavourites = () => {
    const selectedSegments = segments.filter((s) =>
      selectedSegmentIds.has(s.id),
    );

    if (selectedSegments.length === 0) {
      alert("Please select segments to add to favourites");
      return;
    }

    // Wrap the actual save operation with auth guard
    requireAuth(() => {
      console.log("[FAVOURITE_SAVE_ATTEMPT]", {
        segmentCount: selectedSegments.length,
        segmentIds: selectedSegments.map(s => s.id),
        timestamp: new Date().toISOString(),
      });

      // Convert SegmentDTO to the format expected by the API
      const segmentsToSave = selectedSegments.map((segment) => ({
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
        ascentM: segment.ascentM,
        descentM: segment.descentM,
      }));

      addFavouritesMutation.mutate({ segments: segmentsToSave });
    });
  };

  // Memoize the data for the virtualized list to prevent unnecessary re-renders
  const listData = useMemo(() => ({
    segments,
    selectedSegmentIds,
    highlightedSegmentId,
    favouriteSegmentIds,
    onCardHover: handleCardHover,
    onCardClick: handleCardClick,
    onZoomToSegment: handleZoomToSegment,
    onCheckboxChange: handleCheckboxChange,
  }), [
    segments, 
    selectedSegmentIds, 
    highlightedSegmentId, 
    favouriteSegmentIds,
    // Note: handler functions are stable due to useCallback in the store
  ]);

  return (
    <div className="w-80 overflow-hidden border-r bg-white">
      <div className="p-4">
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

          {/* Selection instructions */}
          {segments.length > 0 && selectedSegmentIds.size === 0 && (
            <div className="mb-4 rounded-lg bg-gray-50 p-3">
              <div className="text-xs text-gray-600">
                💡 <strong>Click on cards</strong> to select segments for trip planning or favourites
              </div>
            </div>
          )}

          {/* Selection controls */}
          {selectedSegmentIds.size > 0 && (
            <div className="mb-4 rounded-lg bg-blue-50 p-3">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm text-blue-900">
                    {selectedSegmentIds.size} of {MAX_SEGMENTS} segment
                    {selectedSegmentIds.size === 1 ? "" : "s"} selected
                  </span>
                  {selectedSegmentIds.size >= MAX_SEGMENTS && (
                    <span className="text-xs text-orange-600 mt-1">
                      ⚠️ Maximum segments selected
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={clearSelection}
                    className="rounded-md border border-blue-200 px-2 py-1 text-xs text-blue-700 hover:bg-blue-100"
                    title="Clear selection"
                  >
                    🗑️
                  </button>
                  <button
                    onClick={handleAddFavourites}
                    disabled={addFavouritesMutation.isPending}
                    className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    title="Add selected segments to favourites"
                  >
                    {addFavouritesMutation.isPending ? "Adding..." : "⭐ Favourite"}
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
                  Too many requests. Please wait a moment before exploring new
                  areas.
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
                    <p className="font-medium">No segments found</p>
                    <p className="mt-1">
                      Change your location or zoom level or use address search
                      bar
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Empty state - show sign-in prompt if not authenticated, otherwise show regular empty state */}
          {!isLoading && !error && segments.length === 0 && debouncedBounds && (
            <>
              {!isAuthenticated ? (
                <StravaSignInPrompt
                  title="Sign in with Strava to find segments"
                  description="Connect your Strava account to discover cycling segments in this area and start planning your trips."
                  icon="🚴‍♀️"
                  onSignIn={() => {
                    segmentDiscoveryAuth.requireAuth(() => {
                      // Refresh segments after successful sign-in
                      onRefreshSegments?.();
                    });
                  }}
                />
              ) : (
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
            </>
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
        </div>
      </div>

      {/* Virtualized segments list */}
      {segments.length > 0 && (
        <div className="flex-1">
          <List
            height={400} // Fixed height for the virtualized list
            itemCount={segments.length}
            itemSize={120} // Height of each segment item
            itemData={listData}
            width="100%"
          >
            {SegmentItem}
          </List>
        </div>
      )}

      {/* Sign-in modal for save to favourites */}
      <SignInModal
        isOpen={isModalOpen}
        onClose={onModalClose}
        triggerSource={triggerSource}
        onSignInSuccess={onSignInSuccess}
      />

      {/* Sign-in modal for segment discovery */}
      <SignInModal
        isOpen={segmentDiscoveryAuth.isModalOpen}
        onClose={segmentDiscoveryAuth.onModalClose}
        triggerSource={segmentDiscoveryAuth.triggerSource}
        onSignInSuccess={segmentDiscoveryAuth.onSignInSuccess}
      />
    </div>
  );
}
