import { create } from "zustand";

export interface SegmentStore {
  // Highlighted segment ID (for hover effects)
  highlightedSegmentId: string | null;

  // Set of selected segment IDs (for saving)
  selectedSegmentIds: Set<string>;

  // Actions
  highlightSegment: (segmentId: string | null) => void;
  toggleSegmentSelection: (segmentId: string, source?: "checkbox" | "card" | "hover") => void;
  clearSelection: () => void;
  setSelectedSegments: (segmentIds: string[]) => void;

  // Map interaction actions
  zoomToSegment: ((segmentId: string) => void) | null;
  setZoomToSegment: (fn: (segmentId: string) => void) => void;
}

/**
 * Zustand store for managing segment interactions and state
 * Used for highlighting hovered segments and managing selection state
 */
export const useSegmentStore = create<SegmentStore>((set, _get) => ({
  highlightedSegmentId: null,
  selectedSegmentIds: new Set<string>(),
  zoomToSegment: null,

  highlightSegment: (segmentId: string | null) => {
    set({ highlightedSegmentId: segmentId });
  },

  toggleSegmentSelection: (segmentId: string, source: "checkbox" | "card" | "hover" = "checkbox") => {
    set((state) => {
      const newSelectedIds = new Set(state.selectedSegmentIds);
      const wasSelected = newSelectedIds.has(segmentId);
      
      if (wasSelected) {
        newSelectedIds.delete(segmentId);
      } else {
        newSelectedIds.add(segmentId);
      }

      // Log the selection event for analytics
      console.log(`[SEGMENT_TOGGLE]`, {
        segmentId,
        source,
        selected: !wasSelected,
        totalSelected: newSelectedIds.size,
        timestamp: new Date().toISOString(),
      });

      return { selectedSegmentIds: newSelectedIds };
    });
  },

  clearSelection: () => {
    set({ selectedSegmentIds: new Set<string>() });
  },

  setSelectedSegments: (segmentIds: string[]) => {
    set({ selectedSegmentIds: new Set(segmentIds) });
  },

  setZoomToSegment: (fn: (segmentId: string) => void) => {
    set({ zoomToSegment: fn });
  },
}));
