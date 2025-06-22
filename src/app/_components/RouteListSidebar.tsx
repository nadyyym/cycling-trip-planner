"use client";

import React from "react";
import { type Trip } from "~/app/_hooks/useTripRouteStore";
import { type PlanResponse } from "~/types/routePlanner";
import { useToast } from "~/hooks/use-toast";
import { Copy, Calendar, MapPin, Clock, Download, Save } from "lucide-react";
import { getDayColor } from "~/lib/mapUtils";
import { downloadRoutesAsZip, type RouteForGPX } from "~/lib/gpxUtils";
import { useTripPlanner } from "~/app/_hooks/useTripPlanner";
import { buildSavePayload } from "~/lib/tripUtils";
import { useTripConstraintStore } from "~/app/_hooks/useTripConstraintStore";
import { useTripRouteStore } from "~/app/_hooks/useTripRouteStore";

interface RouteListSidebarProps {
  /** Whether the trip planning is in progress */
  isLoading: boolean;
  /** Error from trip planning if any */
  error: { message: string } | null;
  /** Current planned trip */
  currentTrip: Trip | null;
  /** Raw plan response from API */
  planResponse?: PlanResponse;
}

/**
 * Sidebar component that displays planned trip routes with day-by-day breakdown
 * Replaces individual segment display with route-focused information
 */
export function RouteListSidebar({
  isLoading,
  error,
  currentTrip,
  planResponse,
}: RouteListSidebarProps) {
  const { toast } = useToast();
  const { saveTrip, isSaving, isSaved, savedTrip } = useTripPlanner();
  const { constraints } = useTripConstraintStore();
  const { setSavedTripData } = useTripRouteStore();

  // Handle GPX download
  const handleDownloadGPX = async () => {
    if (!currentTrip || !planResponse?.ok) return;

    try {
      // Convert current trip data to GPX format with locality names when available
      const routesForGPX: RouteForGPX[] = currentTrip.routes.map((route) => {
        // Find saved day data for this route
        const savedDayData = currentTrip.savedTripData?.days.find(d => d.day === route.dayNumber);
        
        return {
          dayNumber: route.dayNumber,
          geometry: route.geometry,
          distanceKm: route.distanceKm,
          elevationGainM: route.elevationGainM, // Legacy field for backward compatibility
          ascentM: route.ascentM,
          descentM: route.descentM,
          segmentNames: route.segmentNames,
          // Include locality names and formatted day name if available
          startLocality: savedDayData?.startLocality,
          endLocality: savedDayData?.endLocality,
          dayName: savedDayData?.dayName,
        };
      });

      // Get trip start date from constraints if available
      const tripStartDate = currentTrip.savedTripData ? new Date() : undefined; // TODO: Get actual start date from constraints

      await downloadRoutesAsZip(routesForGPX, tripStartDate);

      toast({
        title: "📁 Download Started!",
        description: `Downloading ${routesForGPX.length} daily routes as GPX files`,
        variant: "default",
      });
    } catch (error) {
      console.error('GPX download failed:', error);
      toast({
        title: "❌ Download Failed",
        description: "Failed to generate GPX files",
        variant: "destructive",
      });
    }
  };

  // Handle copy share link
  const handleCopyShareLink = () => {
    if (currentTrip?.savedTripData?.shareUrl) {
      navigator.clipboard.writeText(currentTrip.savedTripData.shareUrl).then(() => {
        toast({
          title: "🔗 Link copied!",
          description: "Trip share link copied to clipboard",
          variant: "default",
        });
      }).catch(() => {
        toast({
          title: "❌ Copy Failed",
          description: "Failed to copy link to clipboard",
          variant: "destructive",
        });
      });
    }
  };

  // Handle save trip
  const handleSaveTrip = () => {
    if (planResponse?.ok) {
      console.log("[UI_SAVE_CLICK]", {
        routeCount: planResponse.routes.length,
        totalDistanceKm: planResponse.totalDistanceKm,
        timestamp: new Date().toISOString(),
      });

      const savePayload = buildSavePayload(planResponse, constraints);
      saveTrip(savePayload);
    }
  };

  // Update trip route store when trip is saved
  React.useEffect(() => {
    if (isSaved && savedTrip) {
      setSavedTripData({
        slug: savedTrip.slug,
        shareUrl: savedTrip.shareUrl,
        days: savedTrip.days,
      });
    }
  }, [isSaved, savedTrip, setSavedTripData]);

  // Handle copy to clipboard
  const handleCopyMarkdown = () => {
    if (planResponse?.ok) {
      // Create a simple text summary
      const summary = `🚴‍♀️ Cycling Trip Itinerary

Trip Summary:
- Days: ${planResponse.routes.length}
- Total Distance: ${Math.round(planResponse.totalDistanceKm)} km
- Total Elevation: ${Math.round(planResponse.totalElevationGainM)} m
- Total Duration: ${Math.round(planResponse.totalDurationMinutes / 60 * 10) / 10} hours

Daily Routes:
${planResponse.routes.map(route => 
  `Day ${route.dayNumber}: ${Math.round(route.distanceKm)} km, ${Math.round(route.elevationGainM)} m elevation`
).join('\n')}

Generated by Cycling Trip Planner`;

      navigator.clipboard.writeText(summary).then(() => {
        toast({
          title: "📋 Copied!",
          description: "Trip itinerary copied to clipboard",
          variant: "default",
        });
      }).catch(() => {
        toast({
          title: "❌ Copy Failed",
          description: "Failed to copy to clipboard",
          variant: "destructive",
        });
      });
    }
  };

  return (
    <div className="w-80 overflow-y-auto border-r bg-white p-4">
      <div className="space-y-4">
        {/* Header */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Trip Planning</h2>
          <p className="text-sm text-gray-600">Your multi-day cycling itinerary</p>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="space-y-4">
            <div className="flex flex-col items-center justify-center py-8">
              <div className="mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600"></div>
              <div className="text-center">
                <h3 className="mb-2 text-lg font-medium text-gray-900">
                  Planning your trip...
                </h3>
                <p className="text-sm text-gray-600">
                  Optimizing routes and calculating distances
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <span className="text-red-400">❌</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">
                  Trip Planning Failed
                </h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error.message}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Success state with route breakdown */}
        {currentTrip && planResponse?.ok && (
          <div className="space-y-4">
            {/* Trip summary card */}
            <div className="rounded-lg border bg-gradient-to-br from-green-50 to-blue-50 p-4">
              <h3 className="mb-3 text-lg font-medium text-gray-900">Trip Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="font-medium">{currentTrip.routes.length} days</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-green-600" />
                  <span className="font-medium">{Math.round(currentTrip.totalDistanceKm)} km</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-orange-600">⬆️</span>
                  <span className="font-medium">{Math.round(currentTrip.totalAscentM)} m</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-sky-500">⬇️</span>
                  <span className="font-medium">{Math.round(currentTrip.totalDescentM)} m</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-purple-600" />
                  <span className="font-medium">
                    {Math.round(planResponse.totalDurationMinutes / 60 * 10) / 10}h
                  </span>
                </div>
              </div>
              
              {/* Action buttons */}
              <div className="mt-4 space-y-2">
                {/* Primary actions */}
                <div className="flex gap-2">
                  {!isSaved ? (
                    <button
                      onClick={handleSaveTrip}
                      disabled={isSaving}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Itinerary
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleCopyShareLink}
                      className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copy Public Link
                    </button>
                  )}
                  <button
                    onClick={handleDownloadGPX}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    title="Download GPX files"
                  >
                    <Download className="h-4 w-4" />
                    GPX
                  </button>
                  <button
                    onClick={handleCopyMarkdown}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                    title="Copy itinerary to clipboard"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Daily routes */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900">Daily Routes</h3>
              
              {currentTrip.routes.map((route) => {
                const dayColor = getDayColor(route.dayNumber);
                const colorClass = `${dayColor.borderClass} ${dayColor.bgClass}`;
                
                // Get saved day data if available
                const savedDayData = currentTrip.savedTripData?.days.find(d => d.day === route.dayNumber);
                const dayTitle = savedDayData?.dayName ?? `Day ${route.dayNumber}`;
                
                return (
                  <div
                    key={route.dayNumber}
                    className={`cursor-pointer rounded-lg border p-3 transition-all duration-200 hover:shadow-md ${colorClass}`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div 
                          className="h-3 w-3 rounded-full border border-gray-300"
                          style={{ backgroundColor: dayColor.hex }}
                        />
                        <h4 className="text-sm font-medium text-gray-900" title={dayTitle}>
                          {savedDayData ? (
                            <span className="truncate max-w-[180px] block">{dayTitle}</span>
                          ) : (
                            `Day ${route.dayNumber}`
                          )}
                        </h4>
                      </div>
                      <span className="text-xs text-gray-500">
                        {route.segmentNames.length} segments
                      </span>
                    </div>

                    {/* Enhanced route stats with better distance visibility */}
                    <div className="mb-2 grid grid-cols-3 gap-2 text-xs text-gray-600">
                      <span className="flex items-center gap-1 font-medium">
                        📏 <span className={`${dayColor.textClass} font-semibold`}>
                          {Math.round(route.distanceKm)} km
                        </span>
                      </span>
                      <span className="flex items-center gap-1 text-orange-600">
                        ⬆️ {Math.round(route.ascentM)} m
                      </span>
                      <span className="flex items-center gap-1 text-sky-500">
                        ⬇️ {Math.round(route.descentM)} m
                      </span>
                    </div>

                    {/* Segment list preview */}
                    {route.segmentNames.length > 0 && (
                      <div className="text-xs text-gray-600">
                        <div className="truncate">
                          🎯 {route.segmentNames.slice(0, 2).join(", ")}
                          {route.segmentNames.length > 2 && ` +${route.segmentNames.length - 2} more`}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed planning state with detailed error */}
        {planResponse && !planResponse.ok && (
          <div className="space-y-4">
            <div className="rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <span className="text-red-400">❌</span>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Trip Planning Failed
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p><strong>Error:</strong> {planResponse.error}</p>
                    <p className="mt-1">{planResponse.details}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Suggestions based on error type */}
            <div className="rounded-md bg-yellow-50 p-4">
              <h4 className="text-sm font-medium text-yellow-800 mb-2">Suggestions:</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                {planResponse.error === 'dailyLimitExceeded' && (
                  <>
                    <li>• Remove one or more segments from your selection</li>
                    <li>• Choose segments that are closer together</li>
                  </>
                )}
                {planResponse.error === 'needMoreDays' && (
                  <>
                    <li>• Remove some segments to fit within 7 days</li>
                    <li>• Choose segments that are closer together</li>
                  </>
                )}
                {planResponse.error === 'segmentTooFar' && (
                  <>
                    <li>• Select segments within the same region</li>
                    <li>• Remove segments that are outliers from your main route</li>
                  </>
                )}
                {planResponse.error === 'externalApi' && (
                  <>
                    <li>• Wait a few minutes and try again</li>
                    <li>• Check your internet connection</li>
                  </>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && !currentTrip && !planResponse && (
          <div className="py-8 text-center">
            <div className="mb-3 text-4xl text-gray-400">🗺️</div>
            <div className="mb-1 text-sm font-medium text-gray-900">
              No trip planned yet
            </div>
            <div className="text-sm text-gray-500">
              Your trip routes will appear here once planned
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 