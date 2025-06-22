import "mapbox-gl/dist/mapbox-gl.css";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Cycling Trip | Cycling Trip Planner",
  description: "View and share amazing cycling trip itineraries",
};

/**
 * Layout for trip display pages
 * Ensures Mapbox CSS is loaded and provides consistent styling
 */
export default function TripLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
} 