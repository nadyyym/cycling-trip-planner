import Link from "next/link";
import { auth } from "~/server/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-white">
      <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-tight text-gray-900">
            cycling-trip-planner 🚲
          </h1>
          <p className="mt-6 text-xl text-gray-600">
            Discover amazing cycling segments and build epic multi-day trips
          </p>
        </div>

        <div className="flex flex-col items-center gap-4">
          {session ? (
            <div className="text-center">
              <p className="text-lg text-gray-700">
                Welcome back, {session.user?.name}!
              </p>
              <div className="mt-4 flex gap-4">
                <Link
                  href="/explore"
                  className="rounded-md bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
                >
                  Explore Segments
                </Link>
                <Link
                  href="/itineraries"
                  className="rounded-md border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-50"
                >
                  My Itineraries
                </Link>
                <Link
                  href="/api/auth/signout"
                  className="rounded-md border border-gray-300 px-6 py-3 text-gray-700 hover:bg-gray-50"
                >
                  Sign out
                </Link>
              </div>
            </div>
          ) : (
            <div className="text-center">
              <p className="mb-4 text-lg text-gray-700">
                Sign in with Strava to start planning your cycling adventures
              </p>
              <Link
                href="/api/auth/signin"
                className="rounded-md bg-orange-600 px-8 py-3 text-white hover:bg-orange-700"
              >
                Sign in with Strava
              </Link>
            </div>
          )}
        </div>

        <div className="mt-12 text-center">
          <h2 className="mb-4 text-2xl font-semibold text-gray-900">
            How it works
          </h2>
          <div className="grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-3">
            <div className="text-center">
              <div className="mb-2 text-3xl">🗺️</div>
              <h3 className="font-semibold text-gray-900">Discover</h3>
              <p className="text-gray-600">
                Search for cycling segments by city or explore the map
              </p>
            </div>
            <div className="text-center">
              <div className="mb-2 text-3xl">🎯</div>
              <h3 className="font-semibold text-gray-900">Select</h3>
              <p className="text-gray-600">
                Choose your favorite segments from Strava&apos;s database
              </p>
            </div>
            <div className="text-center">
              <div className="mb-2 text-3xl">📅</div>
              <h3 className="font-semibold text-gray-900">Plan</h3>
              <p className="text-gray-600">
                Generate multi-day itineraries with half-day cycling routes
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
