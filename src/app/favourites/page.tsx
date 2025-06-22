"use client";

import { useSession } from "next-auth/react";
import { FavouritesTable } from "./_components/FavouritesTable";
import { AuthEmptyState } from "../_components/AuthEmptyState";

/**
 * Favourites page with client-side authentication check
 * 
 * This page shows the user's saved segments if authenticated,
 * or an empty state with sign-in prompt if not authenticated.
 * This allows the page to be publicly accessible while soft-gating the content.
 */
export default function FavouritesPage() {
  const { data: session, status } = useSession();

  // Show loading state while checking authentication
  if (status === "loading") {
    return (
      <main className="min-h-screen bg-gray-50">
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </main>
    );
  }

  // Show auth empty state if not authenticated
  if (!session?.user) {
    return (
      <main className="min-h-screen bg-gray-50">
        <AuthEmptyState />
      </main>
    );
  }

  // Show favourites table if authenticated
  return (
    <main className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              My Favourite Segments
            </h1>
            <p className="mt-2 text-gray-600">
              Your saved cycling segments from Strava
            </p>
          </div>

          {/* Favourites Table */}
          <FavouritesTable className="mx-auto max-w-6xl" />
        </div>
      </div>
    </main>
  );
} 