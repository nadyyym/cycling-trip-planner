import Link from "next/link";
import { auth } from "~/server/auth";
import { redirect } from "next/navigation";

export default async function FavouritesPage() {
  const session = await auth();

  // Redirect to home if not authenticated
  if (!session) {
    redirect("/");
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center">
              <Link
                href="/"
                className="text-xl font-bold text-gray-900 hover:text-gray-700"
              >
                🚲 Cycling Trip Planner
              </Link>
            </div>
            <nav className="flex items-center space-x-4">
              <Link
                href="/explore"
                className="text-gray-600 hover:text-gray-900"
              >
                Explore
              </Link>
              <Link
                href="/favourites"
                className="text-blue-600 font-medium"
              >
                Favourites
              </Link>
              <span className="text-gray-600">
                {session.user?.name}
              </span>
            </nav>
          </div>
        </div>
      </header>

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

          {/* Coming Soon Message */}
          <div className="mx-auto max-w-md rounded-lg bg-white p-8 shadow-sm">
            <div className="text-6xl mb-4">⭐</div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              Favourites Table Coming Soon
            </h2>
            <p className="text-gray-600 mb-6">
              We're building a beautiful table to display all your favourite segments with detailed information.
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Explore Segments
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
} 