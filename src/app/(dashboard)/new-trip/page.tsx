"use client";

import { useEffect } from "react";
import { MapPin, Route, Calendar } from "lucide-react";
import { useSidebar } from "~/app/_components/FloatingSidebar";

// Mock data for trip planning
const mockRoutes = [
  {
    id: "1",
    name: "Day 1: Coastal Route",
    distance: 45.2,
    elevation: 680,
    segments: ["Coastal Path", "Lighthouse Loop"],
    difficulty: "Moderate",
  },
  {
    id: "2",
    name: "Day 2: Mountain Challenge",
    distance: 62.8,
    elevation: 1250,
    segments: ["Col du Test", "Summit Trail"],
    difficulty: "Hard",
  },
];

function TripPlannerSidebar() {
  return (
    <div className="p-4">
      {/* Trip Planning Header */}
      <div className="mb-4">
        <h3 className="font-semibold text-gray-900 mb-2">Plan Your Trip</h3>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Calendar className="h-4 w-4" />
            <span>2-day cycling trip</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Route className="h-4 w-4" />
            <span>108 km total distance</span>
          </div>
        </div>
      </div>

      {/* Route List */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-900">Planned Routes</h4>
        {mockRoutes.map((route) => (
          <div
            key={route.id}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
          >
            <div className="mb-2">
              <h3 className="font-semibold text-gray-900">{route.name}</h3>
              <p className="text-xs text-gray-500">
                {route.segments.join(" → ")}
              </p>
            </div>
            
            <div className="grid grid-cols-2 gap-2 text-xs mb-2">
              <div>
                <span className="text-gray-500">Distance</span>
                <p className="font-medium">{route.distance} km</p>
              </div>
              <div>
                <span className="text-gray-500">Elevation</span>
                <p className="font-medium">{route.elevation} m</p>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                route.difficulty === "Hard" 
                  ? "bg-red-100 text-red-800"
                  : route.difficulty === "Moderate"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-green-100 text-green-800"
              }`}>
                {route.difficulty}
              </span>
              <button className="text-xs text-green-600 hover:text-green-700">
                Edit Route
              </button>
            </div>
          </div>
        ))}
        
        <button className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm text-gray-500 hover:border-green-300 hover:text-green-600">
          + Add Another Day
        </button>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 space-y-2">
        <button className="w-full rounded-lg bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700">
          Generate Trip
        </button>
        <button className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Save as Draft
        </button>
      </div>
    </div>
  );
}

export default function NewTripPage() {
  const { openSidebar } = useSidebar();

  useEffect(() => {
    // Open the sidebar with trip planner when page loads
    openSidebar(<TripPlannerSidebar />, "Trip Planner");
  }, [openSidebar]);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      {/* Map Placeholder */}
      <div className="h-full w-full bg-gradient-to-br from-blue-100 to-purple-100">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
              <Route className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Trip Planning Map
            </h2>
            <p className="text-gray-600">
              Plan your multi-day cycling adventure
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Use the sidebar to create and customize your trip routes
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