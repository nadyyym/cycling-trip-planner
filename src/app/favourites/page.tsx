import { auth } from "~/server/auth";
import { redirect } from "next/navigation";
import { FavouritesTable } from "./_components/FavouritesTable";

export default async function FavouritesPage() {
  const session = await auth();

  // Redirect to home if not authenticated
  if (!session) {
    redirect("/");
  }

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