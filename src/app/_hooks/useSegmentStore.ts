import { create } from "zustand";

// Maximum number of segments that can be selected
const MAX_SEGMENTS = 10;

export interface SegmentStore {
  // Highlighted segment ID (for hover effects)
  highlightedSegmentId: string | null;

  // Set of selected segment IDs (for saving)
  selectedSegmentIds: Set<string>;

  // Actions
  highlightSegment: (segmentId: string | null) => void;
  toggleSegmentSelection: (segmentId: string, source?: "checkbox" | "card" | "hover") => { success: boolean; reason?: string };
  clearSelection: () => void;
  setSelectedSegments: (segmentIds: string[]) => void;

  // Map interaction actions
  zoomToSegment: ((segmentId: string) => void) | null;
  setZoomToSegment: (fn: (segmentId: string) => void) => void;

  // Notification callbacks
  onLimitReached: ((count: number, limit: number) => void) | null;
  setOnLimitReached: (callback: (count: number, limit: number) => void) => void;
}

/**
 * Zustand store for managing segment interactions and state
 * Used for highlighting hovered segments and managing selection state
 * Enforces a maximum limit of 10 selected segments
 */
export const useSegmentStore = create<SegmentStore>((set, get) => ({
  highlightedSegmentId: null,
  selectedSegmentIds: new Set<string>(),
  zoomToSegment: null,
  onLimitReached: null,

  highlightSegment: (segmentId: string | null) => {
    set({ highlightedSegmentId: segmentId });
  },

  toggleSegmentSelection: (segmentId: string, source: "checkbox" | "card" | "hover" = "checkbox") => {
    const state = get();
    const newSelectedIds = new Set(state.selectedSegmentIds);
    const wasSelected = newSelectedIds.has(segmentId);
    
    if (wasSelected) {
      // Always allow deselection
      newSelectedIds.delete(segmentId);
    } else {
      // Check if we're at the limit before adding
      if (newSelectedIds.size >= MAX_SEGMENTS) {
        // Trigger limit reached callback if available
        if (state.onLimitReached) {
          state.onLimitReached(newSelectedIds.size, MAX_SEGMENTS);
        }
        
        // Log the limit hit for analytics
        console.log(`[SEGMENT_LIMIT_REACHED]`, {
          segmentId,
          source,
          currentCount: newSelectedIds.size,
          limit: MAX_SEGMENTS,
          timestamp: new Date().toISOString(),
        });

        return { success: false, reason: `Maximum ${MAX_SEGMENTS} segments allowed` };
      }
      
      newSelectedIds.add(segmentId);
    }

    // Update the store with new selection
    set({ selectedSegmentIds: newSelectedIds });

    // Log the selection event for analytics
    console.log(`[SEGMENT_TOGGLE]`, {
      segmentId,
      source,
      selected: !wasSelected,
      totalSelected: newSelectedIds.size,
      limit: MAX_SEGMENTS,
      timestamp: new Date().toISOString(),
    });

    return { success: true };
  },

  clearSelection: () => {
    set({ selectedSegmentIds: new Set<string>() });
  },

  setSelectedSegments: (segmentIds: string[]) => {
    // Enforce the limit when setting multiple segments
    const limitedSegmentIds = segmentIds.slice(0, MAX_SEGMENTS);
    
    // Log if segments were truncated
    if (segmentIds.length > MAX_SEGMENTS) {
      console.log(`[SEGMENT_SET_TRUNCATED]`, {
        requested: segmentIds.length,
        applied: limitedSegmentIds.length,
        limit: MAX_SEGMENTS,
        timestamp: new Date().toISOString(),
      });
      
      // Trigger limit reached callback if available
      const state = get();
      if (state.onLimitReached) {
        state.onLimitReached(segmentIds.length, MAX_SEGMENTS);
      }
    }
    
    set({ selectedSegmentIds: new Set(limitedSegmentIds) });
  },

  setZoomToSegment: (fn: (segmentId: string) => void) => {
    set({ zoomToSegment: fn });
  },

  setOnLimitReached: (callback: (count: number, limit: number) => void) => {
    set({ onLimitReached: callback });
  },
}));

// Export the constant for use in components
export { MAX_SEGMENTS };
