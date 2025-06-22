"use client";

import { useEffect } from "react";
import { MapPin, Search, Filter } from "lucide-react";
import { useSidebar } from "~/app/_components/FloatingSidebar";

// Mock data for demonstration
const mockSegments = [
  {
    id: "1",
    name: "Col du Galibier",
    distance: 18.2,
    elevation: 1200,
    grade: 6.8,
    difficulty: "Hard",
    location: "French Alps",
  },
  {
    id: "2", 
    name: "Alpe d'Huez",
    distance: 13.8,
    elevation: 1100,
    grade: 8.1,
    difficulty: "Very Hard",
    location: "French Alps",
  },
  {
    id: "3",
    name: "Mont Ventoux",
    distance: 21.3,
    elevation: 1610,
    grade: 7.5,
    difficulty: "Hard",
    location: "Provence",
  },
];

function SegmentList() {
  return (
    <div className="p-4">
      {/* Search Header */}
      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search segments..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
        </div>
        <button className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white py-2 text-sm text-gray-600 hover:bg-gray-50">
          <Filter className="h-4 w-4" />
          Filters
        </button>
      </div>

      {/* Segment List */}
      <div className="space-y-3">
        {mockSegments.map((segment) => (
          <div
            key={segment.id}
            className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-2">
              <h3 className="font-semibold text-gray-900">{segment.name}</h3>
              <p className="text-xs text-gray-500">{segment.location}</p>
            </div>
            
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Distance</span>
                <p className="font-medium">{segment.distance} km</p>
              </div>
              <div>
                <span className="text-gray-500">Elevation</span>
                <p className="font-medium">{segment.elevation} m</p>
              </div>
              <div>
                <span className="text-gray-500">Grade</span>
                <p className="font-medium">{segment.grade}%</p>
              </div>
            </div>
            
            <div className="mt-2 flex items-center justify-between">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                segment.difficulty === "Very Hard" 
                  ? "bg-red-100 text-red-800"
                  : segment.difficulty === "Hard"
                  ? "bg-orange-100 text-orange-800"
                  : "bg-green-100 text-green-800"
              }`}>
                {segment.difficulty}
              </span>
              <button className="text-xs text-green-600 hover:text-green-700">
                Add to Trip
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const { openSidebar } = useSidebar();

  useEffect(() => {
    // Open the sidebar with segment list when page loads
    openSidebar(<SegmentList />, "Cycling Segments");
  }, [openSidebar]);

  return (
    <div className="relative h-[calc(100vh-3.5rem)] w-full">
      {/* Map Placeholder */}
      <div className="h-full w-full bg-gradient-to-br from-green-100 to-blue-100">
        <div className="flex h-full items-center justify-center">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-lg">
              <MapPin className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-900">
              Interactive Map
            </h2>
            <p className="text-gray-600">
              Map component will be rendered here
            </p>
            <p className="mt-2 text-sm text-gray-500">
              The floating sidebar shows cycling segments that can be explored on this map
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
